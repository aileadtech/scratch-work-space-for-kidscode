import {
    applyKidscodeVmReadOnlyGuard,
    isKidscodeVmReadOnly
} from '../../../src/lib/kidscode-workspace-vm-read-only-guard';

// A fake VM exposing exactly the mutating methods the guard wraps, plus two methods it must never
// touch (Green Flag/Stop — runtime execution, not project-content mutation). Every guarded method
// just records that it was really called, so a test can prove the real implementation did or didn't
// run. Methods live on a shared prototype — like the real VirtualMachine class — so that
// `delete vm[methodName]` (how the guard restores an unwrapped method) correctly falls back to the
// real implementation instead of leaving the method undefined, matching real VM instances.
class FakeVm {
    constructor () {
        this.calls = [];
    }
    greenFlag () {
        this.calls.push('greenFlag');
    }
    stopAll () {
        this.calls.push('stopAll');
    }
}
[
    'postSpriteInfo', 'addSprite', 'renameSprite', 'duplicateSprite', 'deleteSprite',
    'addCostume', 'addCostumeFromLibrary', 'duplicateCostume', 'deleteCostume', 'renameCostume',
    'updateSvg', 'updateBitmap',
    'addSound', 'duplicateSound', 'deleteSound', 'renameSound', 'updateSoundBuffer',
    'addBackdrop',
    'reorderTarget', 'reorderCostume', 'reorderSound',
    'shareCostumeToTarget', 'shareSoundToTarget', 'shareBlocksToTarget'
].forEach(name => {
    FakeVm.prototype[name] = function (...args) {
        this.calls.push(name);
        return args;
    };
});

const createFakeVm = () => new FakeVm();

describe('applyKidscodeVmReadOnlyGuard', () => {
    test('a fresh vm is not read-only by default', () => {
        const vm = createFakeVm();
        expect(isKidscodeVmReadOnly(vm)).toBe(false);
    });

    test('draft/editable (readOnly=false) leaves every guarded method as the real implementation', () => {
        const vm = createFakeVm();
        applyKidscodeVmReadOnlyGuard(vm, false);

        vm.postSpriteInfo({x: 10});
        vm.addSprite('{}');
        expect(vm.calls).toEqual(['postSpriteInfo', 'addSprite']);
        expect(isKidscodeVmReadOnly(vm)).toBe(false);
    });

    test.each([
        ['submitted', true],
        ['approved', true],
        ['tutor review', true]
    ])('%s: every guarded method becomes an inert no-op (readOnly=%s)', (_label, readOnly) => {
        const vm = createFakeVm();
        const guardedMethodNames = [
            'postSpriteInfo', 'addSprite', 'renameSprite', 'duplicateSprite',
            'addCostume', 'addCostumeFromLibrary', 'duplicateCostume', 'renameCostume',
            'updateSvg', 'updateBitmap',
            'addSound', 'duplicateSound', 'renameSound', 'updateSoundBuffer',
            'addBackdrop',
            'reorderTarget', 'reorderCostume', 'reorderSound',
            'shareCostumeToTarget', 'shareSoundToTarget', 'shareBlocksToTarget'
        ];
        applyKidscodeVmReadOnlyGuard(vm, readOnly);

        guardedMethodNames.forEach(name => {
            expect(() => vm[name]('x', 'y')).not.toThrow();
        });
        expect(vm.calls).toEqual([]);
        expect(isKidscodeVmReadOnly(vm)).toBe(true);
    });

    test('sprite/costume/sound property mutation (postSpriteInfo) never reaches the real target when read-only', () => {
        const vm = createFakeVm();
        applyKidscodeVmReadOnlyGuard(vm, true);

        // Covers x/y (Stage dragging and the sprite-info fields), size, direction, and visibility —
        // all funnel through this one call.
        vm.postSpriteInfo({x: 5, y: 5, size: 200, direction: 45, visible: false});

        expect(vm.calls).toEqual([]);
    });

    test.each(['deleteSprite', 'deleteCostume', 'deleteSound'])(
        '%s returns a callable "restore" no-op instead of crashing when its result is later invoked',
        methodName => {
            const vm = createFakeVm();
            applyKidscodeVmReadOnlyGuard(vm, true);

            const restore = vm[methodName](0);
            expect(typeof restore).toBe('function');
            // The real deleteSprite's own restore callback does restore().then(...) — must not throw
            // and must be thenable.
            expect(() => restore().then(() => {})).not.toThrow();
            expect(vm.calls).toEqual([]);
        }
    );

    test('Green Flag and Stop are never wrapped — playback stays available while read-only', () => {
        const vm = createFakeVm();
        applyKidscodeVmReadOnlyGuard(vm, true);

        vm.greenFlag();
        vm.stopAll();

        expect(vm.calls).toEqual(['greenFlag', 'stopAll']);
    });

    test('restores the exact original methods when read-only is lifted (live changes_requested/resubmit transition)', () => {
        const vm = createFakeVm();
        const originalPostSpriteInfo = vm.postSpriteInfo;
        const originalAddSprite = vm.addSprite;

        applyKidscodeVmReadOnlyGuard(vm, true);
        expect(vm.postSpriteInfo).not.toBe(originalPostSpriteInfo);

        applyKidscodeVmReadOnlyGuard(vm, false);
        expect(vm.postSpriteInfo).toBe(originalPostSpriteInfo);
        expect(vm.addSprite).toBe(originalAddSprite);
        expect(Object.prototype.hasOwnProperty.call(vm, 'postSpriteInfo')).toBe(false);
        expect(isKidscodeVmReadOnly(vm)).toBe(false);

        vm.postSpriteInfo({x: 1});
        expect(vm.calls).toEqual(['postSpriteInfo']);
    });

    test('a live draft → submitted transition applies the guard without needing a fresh vm', () => {
        const vm = createFakeVm();
        applyKidscodeVmReadOnlyGuard(vm, false);
        vm.addSprite('{}');
        expect(vm.calls).toEqual(['addSprite']);

        applyKidscodeVmReadOnlyGuard(vm, true);
        vm.addSprite('{}');

        expect(vm.calls).toEqual(['addSprite']); // no new call recorded
        expect(isKidscodeVmReadOnly(vm)).toBe(true);
    });

    test('calling with the same readOnly value again is idempotent and does not corrupt the originals', () => {
        const vm = createFakeVm();
        applyKidscodeVmReadOnlyGuard(vm, true);
        applyKidscodeVmReadOnlyGuard(vm, true);
        applyKidscodeVmReadOnlyGuard(vm, false);

        vm.addSprite('{}');
        expect(vm.calls).toEqual(['addSprite']);
    });

    test('a null/missing vm is a safe no-op', () => {
        expect(() => applyKidscodeVmReadOnlyGuard(null, true)).not.toThrow();
        expect(isKidscodeVmReadOnly(null)).toBe(false);
        expect(isKidscodeVmReadOnly()).toBe(false);
    });
});
