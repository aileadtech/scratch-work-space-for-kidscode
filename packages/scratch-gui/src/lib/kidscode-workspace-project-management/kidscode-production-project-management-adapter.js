import {normalizeApiBase} from '../kidscode-production-launch-resolver';
import {isDevelopmentWorkspaceAccessToken} from '../kidscode-workspace-launch';

const projectPath = projectRef => `/scratch/workspace/projects/${encodeURIComponent(projectRef)}`;
const projectDuplicatePath = projectRef => `${projectPath(projectRef)}/duplicate`;

const authorizationHeaders = workspaceAccessToken => ({Authorization: `Bearer ${workspaceAccessToken}`});

const parseJsonSafely = async response => {
    try {
        return await response.json();
    } catch {
        return null;
    }
};

const laravelErrorFromResponse = async (response, fallbackMessage) => {
    const body = await parseJsonSafely(response);
    const error = new Error((body && body.error && body.error.message) || fallbackMessage);
    error.code = body && body.error && body.error.code;
    error.status = response.status;
    return error;
};

/**
 * Create the production Kidscode project-management adapter, backed by the real Laravel Stage 3
 * rename/duplicate/delete endpoints (see docs/SHARED-API-CONTRACT.md, Workspace Project
 * Management). Every request authenticates with the runtime-only `workspaceAccessToken`; nothing
 * is cached or logged.
 * @param {object} options - adapter options
 * @param {string} options.apiBase - configured Laravel API base
 * @param {function(string, object): Promise<Response>} [options.fetchImplementation] - fetch override for tests
 * @returns {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}} the production
 *   project-management adapter
 */
const createKidscodeProductionProjectManagementAdapter = ({
    apiBase,
    fetchImplementation = fetch
}) => {
    const normalizedApiBase = normalizeApiBase(apiBase);
    if (!normalizedApiBase) {
        throw new Error('The Workspace API base is not configured.');
    }

    const renameProject = async ({projectRef, workspaceAccessToken, title}) => {
        const response = await fetchImplementation(`${normalizedApiBase}${projectPath(projectRef)}`, {
            method: 'PATCH',
            credentials: 'omit',
            headers: {
                ...authorizationHeaders(workspaceAccessToken),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({title})
        });

        if (!response.ok) {
            throw await laravelErrorFromResponse(response, 'Failed to rename the project.');
        }

        return response.json();
    };

    // The Stage 3 duplicate endpoint copies the project's latest persisted server-side file; it
    // takes no request body, unlike the development mock adapter's `sb3`/`title` params (which
    // exist only because the isolated local store has no server-stored file to copy from).
    const duplicateProject = async ({projectRef, workspaceAccessToken}) => {
        const response = await fetchImplementation(`${normalizedApiBase}${projectDuplicatePath(projectRef)}`, {
            method: 'POST',
            credentials: 'omit',
            headers: authorizationHeaders(workspaceAccessToken)
        });

        if (!response.ok) {
            throw await laravelErrorFromResponse(response, 'Failed to duplicate the project.');
        }

        return response.json();
    };

    const deleteDraftProject = async ({projectRef, workspaceAccessToken}) => {
        const response = await fetchImplementation(`${normalizedApiBase}${projectPath(projectRef)}`, {
            method: 'DELETE',
            credentials: 'omit',
            headers: authorizationHeaders(workspaceAccessToken)
        });

        if (!response.ok) {
            throw await laravelErrorFromResponse(response, 'Failed to delete the project.');
        }

        // A successful DELETE is authoritative regardless of body shape: some Laravel DELETE
        // routes return the DeleteResult envelope, others return an empty 204. Either way, a
        // non-error response means the backend already deleted the project.
        const body = await parseJsonSafely(response);
        if (body && body.data) return body;
        return {success: true, data: {project_ref: projectRef, deleted: true}};
    };

    return {
        renameProject,
        duplicateProject,
        deleteDraftProject
    };
};

/**
 * Route each project-management call between the development IndexedDB adapter and the real
 * Laravel adapter by inspecting the session's own `workspaceAccessToken`, the same way
 * `createKidscodeWorkspacePersistenceAdapter` routes Stage 2 persistence calls: exact development
 * fixtures keep working through their isolated local store, while a real TEST/production session
 * (any non-fixture token) reaches the real Stage 3 endpoints, regardless of the app's own build
 * mode. Production never selects the development adapter, matching every other Kidscode adapter's
 * fail-closed rule.
 * @param {object} options - router options
 * @param {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}}
 *   options.developmentAdapter - dev-only IndexedDB adapter
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}}
 *   options.productionAdapter - real Laravel adapter
 * @returns {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}} the routed
 *   project-management adapter
 */
const createKidscodeWorkspaceProjectManagementAdapter = ({
    developmentAdapter,
    environment = process.env.NODE_ENV,
    productionAdapter
}) => {
    if (environment === 'production') return productionAdapter;
    return {
        renameProject: params => (isDevelopmentWorkspaceAccessToken(params.workspaceAccessToken) ?
            developmentAdapter.renameProject(params) :
            productionAdapter.renameProject(params)),
        duplicateProject: params => (isDevelopmentWorkspaceAccessToken(params.workspaceAccessToken) ?
            developmentAdapter.duplicateProject(params) :
            productionAdapter.duplicateProject(params)),
        deleteDraftProject: params => (isDevelopmentWorkspaceAccessToken(params.workspaceAccessToken) ?
            developmentAdapter.deleteDraftProject(params) :
            productionAdapter.deleteDraftProject(params))
    };
};

export {
    createKidscodeProductionProjectManagementAdapter,
    createKidscodeWorkspaceProjectManagementAdapter
};
