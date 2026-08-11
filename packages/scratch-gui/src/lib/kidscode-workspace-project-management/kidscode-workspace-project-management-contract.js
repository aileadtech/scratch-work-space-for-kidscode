/**
 * Shared contract between the Workspace and any Kidscode project-management adapter (development
 * mock today, Laravel later). See docs/SHARED-API-CONTRACT.md for the full Phase 5 project
 * management section.
 *
 * An adapter implements:
 *   renameProject({projectRef, workspaceAccessToken, title}) -> Promise<{
 *       success: true, data: {project_ref, title, updated_at}
 *   }>
 *   duplicateProject({projectRef, workspaceAccessToken, sb3, title}) -> Promise<{
 *       success: true, data: {project_ref, title, project_type: 'independent', status: 'draft', created_at}
 *   }>
 *   deleteDraftProject({projectRef, workspaceAccessToken}) -> Promise<{
 *       success: true, data: {project_ref, deleted: true}
 *   }>
 *
 * `sb3` for duplicateProject is the same ArrayBuffer shape the Phase 4 persistence contract
 * passes to `saveProject` — the current, possibly-unsaved, editor content at the moment Duplicate
 * was requested, not whatever was last persisted.
 *
 * duplicateProject always creates a new INDEPENDENT draft, regardless of the original project's
 * type or status — there is no `projectType` request field, because the caller cannot choose it.
 * A duplicate of a lesson project is not, and must not become, a second active lesson project
 * attached to the same assignment; it has no assignment/course/lesson association, the same as
 * any other independent project.
 */

const KidscodeProjectStatus = Object.freeze({
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHANGES_REQUESTED: 'changes_requested',
    APPROVED: 'approved'
});

// Established by the Phase 2 rename dialog's own input; kept here so the adapter enforces the
// same limit as the UI rather than trusting the input's maxLength alone.
const KIDSCODE_PROJECT_TITLE_MAX_LENGTH = 100;

const buildDuplicateProjectTitle = title => `${title} Copy`;

const projectManagementUnavailableError = () =>
    new Error('The Workspace project-management adapter is not configured.');

/**
 * An adapter that always rejects. Used when no real adapter is available for the current
 * environment (e.g. production, where the Laravel adapter does not exist yet). Production must
 * fail closed rather than silently falling back to development-only mock storage.
 * @returns {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}}
 *   a rejecting adapter
 */
const createUnavailableKidscodeWorkspaceProjectManagementAdapter = () => ({
    renameProject: () => Promise.reject(projectManagementUnavailableError()),
    duplicateProject: () => Promise.reject(projectManagementUnavailableError()),
    deleteDraftProject: () => Promise.reject(projectManagementUnavailableError())
});

export {
    KIDSCODE_PROJECT_TITLE_MAX_LENGTH,
    KidscodeProjectStatus,
    buildDuplicateProjectTitle,
    createUnavailableKidscodeWorkspaceProjectManagementAdapter
};
