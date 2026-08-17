import log from '../log.js';
import {normalizeApiBase} from '../kidscode-production-launch-resolver';
import {KidscodeLaunchType, isDevelopmentWorkspaceAccessToken} from '../kidscode-workspace-launch';
import {KidscodeProjectSource} from './kidscode-workspace-persistence-contract';
import {buildKidscodeWorkspaceStarterProject} from './kidscode-workspace-starter-project';

// The GET .../file endpoint returns the raw .sb3 bytes as the response body (not a JSON envelope),
// so version/save-time metadata travels as response headers instead.
const KIDSCODE_VERSION_REF_HEADER = 'X-Scratch-Version-Ref';
const KIDSCODE_SAVED_AT_HEADER = 'X-Scratch-Saved-At';
const KIDSCODE_SB3_MIME_TYPE = 'application/x.scratch.sb3';

const projectFilePath = projectRef => `/scratch/workspace/projects/${encodeURIComponent(projectRef)}/file`;
const projectSavePath = projectRef => `/scratch/workspace/projects/${encodeURIComponent(projectRef)}/save`;

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
 * Create the production Kidscode persistence adapter, backed by the real Laravel Stage 2
 * save/load endpoints (see docs/SHARED-API-CONTRACT.md, Workspace Persistence). Every request
 * authenticates with the runtime-only `workspaceAccessToken`; nothing is cached or logged.
 * @param {object} options - adapter options
 * @param {string} options.apiBase - configured Laravel API base
 * @param {function(string, object): Promise<Response>} [options.fetchImplementation] - fetch override for tests
 * @returns {{loadProject: Function, saveProject: Function}} the production persistence adapter
 */
const createKidscodeProductionPersistenceAdapter = ({
    apiBase,
    fetchImplementation = fetch
}) => {
    const normalizedApiBase = normalizeApiBase(apiBase);
    if (!normalizedApiBase) {
        throw new Error('The Workspace API base is not configured.');
    }

    const loadProject = async ({projectRef, workspaceAccessToken, launchType}) => {
        const response = await fetchImplementation(`${normalizedApiBase}${projectFilePath(projectRef)}`, {
            method: 'GET',
            credentials: 'omit',
            headers: authorizationHeaders(workspaceAccessToken)
        });

        // No saved file yet is not an error: a new/never-saved project falls back to the same
        // starter/blank decision the development adapter makes for an unrecorded project_ref.
        if (response.status === 404) {
            return launchType === KidscodeLaunchType.NEW_LESSON ? {
                project_ref: projectRef,
                source: KidscodeProjectSource.STARTER,
                version_ref: null,
                saved_at: null,
                sb3: buildKidscodeWorkspaceStarterProject()
            } : {
                project_ref: projectRef,
                source: KidscodeProjectSource.BLANK,
                version_ref: null,
                saved_at: null,
                sb3: null
            };
        }

        if (!response.ok) {
            throw await laravelErrorFromResponse(response, 'Failed to load the project file.');
        }

        const versionRef = response.headers.get(KIDSCODE_VERSION_REF_HEADER);
        const savedAt = response.headers.get(KIDSCODE_SAVED_AT_HEADER);
        if (!versionRef || !savedAt) {
            log.error(
                'createKidscodeProductionPersistenceAdapter.loadProject: response is missing ' +
                    `${KIDSCODE_VERSION_REF_HEADER}/${KIDSCODE_SAVED_AT_HEADER} headers`,
                {projectRef}
            );
            throw new Error('The project file response is missing required version metadata.');
        }

        return {
            project_ref: projectRef,
            source: KidscodeProjectSource.SAVED,
            version_ref: versionRef,
            saved_at: savedAt,
            sb3: await response.arrayBuffer()
        };
    };

    const saveProject = async ({projectRef, workspaceAccessToken, sb3, baseVersionRef, reason}) => {
        const body = new FormData();
        body.append('project_file', new Blob([sb3], {type: KIDSCODE_SB3_MIME_TYPE}), 'project.sb3');
        // First save has no prior version; the field is omitted entirely rather than sent empty.
        if (baseVersionRef) {
            body.append('base_version_ref', baseVersionRef);
        }
        body.append('save_reason', reason);

        const response = await fetchImplementation(`${normalizedApiBase}${projectSavePath(projectRef)}`, {
            method: 'POST',
            credentials: 'omit',
            headers: authorizationHeaders(workspaceAccessToken),
            body
        });

        if (!response.ok) {
            throw await laravelErrorFromResponse(
                response,
                response.status === 409 ?
                    'A newer version of this project already exists.' :
                    'Failed to save the project.'
            );
        }

        return response.json();
    };

    return {
        loadProject,
        saveProject
    };
};

/**
 * Route each persistence call between the development IndexedDB adapter and the real Laravel
 * adapter by inspecting the session's own `workspaceAccessToken`, the same way
 * `createKidscodeLaunchResolver` routes launch resolution by launch token: exact development
 * fixtures keep working through their isolated local store, while a real TEST/production session
 * (any non-fixture token) reaches the real Stage 2 endpoints, regardless of the app's own build
 * mode. Production never selects the development adapter, matching every other Kidscode adapter's
 * fail-closed rule.
 * @param {object} options - router options
 * @param {{loadProject: Function, saveProject: Function}} options.developmentAdapter - dev-only IndexedDB adapter
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {{loadProject: Function, saveProject: Function}} options.productionAdapter - real Laravel adapter
 * @returns {{loadProject: Function, saveProject: Function}} the routed persistence adapter
 */
const createKidscodeWorkspacePersistenceAdapter = ({
    developmentAdapter,
    environment = process.env.NODE_ENV,
    productionAdapter
}) => {
    if (environment === 'production') return productionAdapter;
    return {
        loadProject: params => (isDevelopmentWorkspaceAccessToken(params.workspaceAccessToken) ?
            developmentAdapter.loadProject(params) :
            productionAdapter.loadProject(params)),
        saveProject: params => (isDevelopmentWorkspaceAccessToken(params.workspaceAccessToken) ?
            developmentAdapter.saveProject(params) :
            productionAdapter.saveProject(params))
    };
};

export {
    createKidscodeProductionPersistenceAdapter,
    createKidscodeWorkspacePersistenceAdapter
};
