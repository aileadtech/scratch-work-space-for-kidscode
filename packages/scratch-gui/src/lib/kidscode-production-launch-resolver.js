import {isDevelopmentLaunchFixtureToken} from './kidscode-workspace-launch';

const KIDSCODE_DEVELOPMENT_API_BASE = 'http://127.0.0.1:8000/api';
const KIDSCODE_LAUNCH_RESOLVE_PATH = '/scratch/workspace/launch/resolve';

const normalizeApiBase = apiBase => {
    if (typeof apiBase !== 'string' || apiBase.trim().length === 0) return null;
    return apiBase.trim().replace(/\/+$/, '');
};

const getKidscodeWorkspaceApiBase = ({
    environment = process.env.NODE_ENV,
    configuredApiBase = process.env.KIDSCODE_WORKSPACE_API_BASE_URL
} = {}) => normalizeApiBase(configuredApiBase) ||
    (environment === 'production' ? null : KIDSCODE_DEVELOPMENT_API_BASE);

const mapLaravelLaunchResponse = response => {
    if (!response || response.success !== true || !response.data || typeof response.data !== 'object') {
        return response;
    }

    const {data} = response;
    const returnTo = data.return_to && data.return_to.type === 'project_details' ? {
        ...data.return_to,
        type: 'projects'
    } : data.return_to;

    return {
        ...response,
        data: {
            ...data,
            role: data.role || 'student',
            return_to: returnTo
        }
    };
};

/**
 * Resolve a one-time launch token against the Laravel Stage 1 endpoint. Browser credentials are
 * explicitly omitted because the launch token is the endpoint's only credential.
 * @param {object} options - resolver options
 * @param {string} options.apiBase - configured Laravel API base
 * @param {function(string, object): Promise<object>} [options.fetchImplementation] - fetch override for tests
 * @returns {function(string): Promise<object>} a launch resolver
 */
const createKidscodeProductionLaunchResolver = ({
    apiBase,
    fetchImplementation = fetch
}) => {
    const normalizedApiBase = normalizeApiBase(apiBase);
    if (!normalizedApiBase) {
        throw new Error('The Workspace API base is not configured.');
    }

    return async launchToken => {
        const response = await fetchImplementation(`${normalizedApiBase}${KIDSCODE_LAUNCH_RESOLVE_PATH}`, {
            method: 'POST',
            credentials: 'omit',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({launch_token: launchToken})
        });
        return mapLaravelLaunchResponse(await response.json());
    };
};

const createKidscodeLaunchResolver = ({
    developmentResolver,
    environment = process.env.NODE_ENV,
    productionResolver
}) => {
    if (environment === 'production') return productionResolver;
    return launchToken => {
        if (isDevelopmentLaunchFixtureToken(launchToken)) return developmentResolver(launchToken);
        return productionResolver(launchToken);
    };
};

export {
    createKidscodeLaunchResolver,
    createKidscodeProductionLaunchResolver,
    getKidscodeWorkspaceApiBase,
    mapLaravelLaunchResponse
};
