/**
 * Shared contract between the Workspace and any Kidscode persistence adapter (development mock
 * today, Laravel later). See docs/SHARED-API-CONTRACT.md for the full Phase 4 persistence section.
 *
 * An adapter implements:
 *   loadProject({projectRef, workspaceAccessToken, launchType}) -> Promise<{
 *       project_ref, source: KidscodeProjectSource, version_ref, saved_at, sb3
 *   }>
 *   saveProject({projectRef, workspaceAccessToken, sb3, baseVersionRef, reason}) -> Promise<{
 *       success: true, data: {project_ref, version_ref, saved_at, status}
 *   }>
 *
 * `sb3` is whatever `vm.loadProject`/`vm.saveProjectSb3` already accept and produce (an ArrayBuffer
 * or a project.json-shaped object) — the Workspace never inspects or reconstructs it.
 */

const KidscodeProjectSource = Object.freeze({
    SAVED: 'saved',
    STARTER: 'starter',
    BLANK: 'blank'
});

const KidscodeSaveReason = Object.freeze({
    MANUAL: 'manual',
    AUTOSAVE: 'autosave'
});

// Single declared debounce interval for autosave; components import this rather than
// hardcoding their own timeout.
const KIDSCODE_AUTOSAVE_DEBOUNCE_MS = 3000;

const persistenceUnavailableError = () =>
    new Error('The Workspace persistence adapter is not configured.');

/**
 * An adapter that always rejects. Used when no real adapter is available for the current
 * environment (e.g. production, where the Laravel adapter does not exist yet). Production must
 * fail closed rather than silently falling back to development-only mock storage.
 * @returns {{loadProject: Function, saveProject: Function}} a rejecting adapter
 */
const createUnavailableKidscodeWorkspacePersistenceAdapter = () => ({
    loadProject: () => Promise.reject(persistenceUnavailableError()),
    saveProject: () => Promise.reject(persistenceUnavailableError())
});

export {
    KIDSCODE_AUTOSAVE_DEBOUNCE_MS,
    KidscodeProjectSource,
    KidscodeSaveReason,
    createUnavailableKidscodeWorkspacePersistenceAdapter
};
