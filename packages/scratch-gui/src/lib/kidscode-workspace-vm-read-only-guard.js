/**
 * Genuinely blocks project-content mutation for a read-only Kidscode Workspace session (submitted/
 * approved Student, or Tutor review), covering every non-Blockly mutation path — Blockly's own
 * editability is handled separately via `workspace.setIsReadOnly()` in `containers/blocks.jsx`.
 *
 * Rather than touching the dozen-plus core Scratch GUI components that call these VM methods
 * (sprite pane, costume tab, sound tab, paint editor, sound editor, backdrop/costume/sound
 * libraries, stage), this replaces the mutating methods directly on the shared `vm` instance with
 * no-ops while read-only, and restores the originals when it isn't. This is a real functional
 * guarantee (nothing persists no matter which UI control is used, matching "genuinely read-only"),
 * not a visual overlay — viewing, running (Green Flag/Stop), and switching sprites/costumes/sounds
 * all keep working, since none of those call the methods below.
 *
 * `vm.loadProject` is deliberately never touched here: it is the legitimate mechanism the Kidscode
 * persistence/submission-review HOCs use to load the working/submitted project in the first place.
 * The vanilla File menu's "New"/"Load from your computer" (which also call it, and would otherwise
 * let a read-only session wholesale-replace the open project) are closed off separately via the
 * `canManageFiles` prop — see kidscode-workspace-submission-review-hoc.jsx.
 */

// Every VM method a Scratch GUI component calls to mutate sprite/costume/sound/backdrop content or
// a sprite's own properties, confirmed by reading each call site (see the Phase 8 Stage 4 read-only
// lockdown investigation) rather than guessed from naming.
const KIDSCODE_GUARDED_VM_METHODS = [
    // Sprite properties (x/y/size/direction/rotation style/visibility) and Stage dragging, which
    // commits through the same call at drag-end.
    'postSpriteInfo',
    // Add/rename/duplicate/delete sprite.
    'addSprite', 'renameSprite', 'duplicateSprite', 'deleteSprite',
    // Costumes (add/library/duplicate/delete/rename, plus the paint editor's own commit calls).
    'addCostume', 'addCostumeFromLibrary', 'duplicateCostume', 'deleteCostume', 'renameCostume',
    'updateSvg', 'updateBitmap',
    // Sounds (add/library/duplicate/delete/rename, plus the sound editor's own commit call).
    'addSound', 'duplicateSound', 'deleteSound', 'renameSound', 'updateSoundBuffer',
    // Backdrops — a backdrop is a Stage costume, so add reuses addCostume/addCostumeFromLibrary
    // above; addBackdrop is the dedicated backdrop-library/backpack-drop entry point.
    'addBackdrop',
    // Reordering sprites/costumes/sounds, and copying a costume/sound/script onto another sprite
    // (sprite-pane and stage drag-and-drop).
    'reorderTarget', 'reorderCostume', 'reorderSound',
    'shareCostumeToTarget', 'shareSoundToTarget', 'shareBlocksToTarget'
];

// deleteSprite/deleteCostume/deleteSound each return a plain callback the caller stores for a later
// "Restore" click (see target-pane.jsx/costume-tab.jsx/sound-tab.jsx's dispatchUpdateRestore) rather
// than a Promise the caller awaits immediately — deleteSprite's own restore callback additionally
// calls the returned function and chains .then() on its result. Every other guarded method's return
// value is either awaited with .then() or discarded outright, so a resolved Promise is always a safe
// stand-in regardless of which. These three need a callable no-op that itself resolves, matching
// both usage shapes.
const KIDSCODE_VM_DELETE_RESTORE_METHODS = ['deleteSprite', 'deleteCostume', 'deleteSound'];

const kidscodeNoOpForVmMethod = methodName => (
    KIDSCODE_VM_DELETE_RESTORE_METHODS.includes(methodName) ?
        () => (() => Promise.resolve()) :
        () => Promise.resolve()
);

const KIDSCODE_VM_GUARD_STATE = Symbol('kidscodeVmReadOnlyGuardState');

/**
 * Applies or lifts the read-only guard on `vm`, idempotently — safe to call on every render/effect
 * run, and safe to call again with the same `readOnly` value (a no-op). Covers both a session that
 * launches already read-only and one that transitions mid-session (e.g. a live Submit), matching the
 * same requirement Blockly's own read-only wiring already meets.
 * @param {object} vm - the Scratch VM instance
 * @param {boolean} readOnly - whether project-content mutation must be blocked
 * @returns {void}
 */
const applyKidscodeVmReadOnlyGuard = (vm, readOnly) => {
    if (!vm) return;
    const nextReadOnly = Boolean(readOnly);
    const state = vm[KIDSCODE_VM_GUARD_STATE] || {readOnly: false, originals: {}};
    vm[KIDSCODE_VM_GUARD_STATE] = state;
    if (state.readOnly === nextReadOnly) return;
    state.readOnly = nextReadOnly;

    if (nextReadOnly) {
        KIDSCODE_GUARDED_VM_METHODS.forEach(methodName => {
            if (typeof vm[methodName] !== 'function') return;
            state.originals[methodName] = vm[methodName];
            vm[methodName] = kidscodeNoOpForVmMethod(methodName);
        });
    } else {
        KIDSCODE_GUARDED_VM_METHODS.forEach(methodName => {
            if (Object.prototype.hasOwnProperty.call(state.originals, methodName)) {
                // Removing the shadowing own-property lets the real VirtualMachine.prototype method
                // show through again, rather than reassigning a captured reference to it.
                delete vm[methodName];
            }
        });
        state.originals = {};
    }
};

/**
 * Whether `vm` currently has the read-only guard applied. Used by call sites that cannot go through
 * a wrapped VM method at all — e.g. `lib/variable-utils.js`'s `setVariableValue`, which mutates a
 * target's variable object directly rather than calling any `vm.<method>()`.
 * @param {object} vm - the Scratch VM instance
 * @returns {boolean} true if project-content mutation is currently blocked
 */
const isKidscodeVmReadOnly = vm => Boolean(vm && vm[KIDSCODE_VM_GUARD_STATE] && vm[KIDSCODE_VM_GUARD_STATE].readOnly);

export {
    applyKidscodeVmReadOnlyGuard,
    isKidscodeVmReadOnly
};
