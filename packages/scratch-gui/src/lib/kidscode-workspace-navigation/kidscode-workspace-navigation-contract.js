/**
 * Shared contract for Kidscode Workspace navigation and recovery (Phase 7). See
 * docs/SHARED-API-CONTRACT.md for the full navigation/recovery section.
 *
 * Navigation never accepts a destination from the browser URL (query params such as
 * `?return=`/`?lessonUrl=`/`?redirect=` are never read for this purpose). The only trusted
 * destination is `session.return_to`, set once by the validated Phase 3 launch response; the only
 * exception is the session-less recovery fallback (see `kidscodeWorkspaceRecoveryUrl`), which is an
 * injected/configured seam, never a value read from the page URL.
 */

const KidscodeReturnDestinationType = Object.freeze({
    LESSON: 'lesson',
    PROJECTS: 'projects',
    REVIEW: 'review',
    RECOVERY: 'recovery'
});

const KidscodeReturnDestinationTypes = Object.values(KidscodeReturnDestinationType);

const ABSOLUTE_HTTP_URL_PATTERN = /^https?:\/\//i;

// The Workspace's own dev-server origin, so purely local fixture-driven Return testing (an absolute
// http://localhost:8601/... return_to.url) keeps working without any configuration.
const KIDSCODE_DEVELOPMENT_RETURN_ORIGIN = 'http://localhost:8601';

const parseKidscodeAllowedReturnOrigins = configuredOrigins => {
    if (typeof configuredOrigins !== 'string' || configuredOrigins.trim().length === 0) return [];
    return configuredOrigins
        .split(',')
        .map(origin => origin.trim())
        .filter(origin => origin.length > 0);
};

/**
 * Resolve the absolute-URL origins the Return Destination Validator should accept, from the
 * environment-configured `KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS` (comma-separated) build-time
 * setting — the same "injected/configured seam" pattern as `getKidscodeWorkspaceApiBase`, rather
 * than a fixed value baked into `render-gui.jsx`. A real Workspace session's `return_to.url` points
 * at the real Kidscode frontend's own absolute origin (see docs/SHARED-API-CONTRACT.md), which is
 * unknown at this repository's build time and differs per deployment target (TEST/production), so it
 * must come from configuration, not a guessed literal.
 * @param {object} [options] - resolver options
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {string} [options.configuredOrigins] - override for
 *   `process.env.KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS`, for tests
 * @returns {Array<string>} the allowed absolute-URL origins for this environment
 */
const getKidscodeWorkspaceAllowedReturnOrigins = ({
    environment = process.env.NODE_ENV,
    configuredOrigins = process.env.KIDSCODE_WORKSPACE_ALLOWED_RETURN_ORIGINS
} = {}) => {
    const configured = parseKidscodeAllowedReturnOrigins(configuredOrigins);
    if (environment === 'production') return configured;
    return configured.includes(KIDSCODE_DEVELOPMENT_RETURN_ORIGIN) ?
        configured :
        [...configured, KIDSCODE_DEVELOPMENT_RETURN_ORIGIN];
};

// A same-origin, path-only URL (e.g. "/lessons") is inherently safe: the browser resolves it
// against the current origin, so it can never redirect off Kidscode/Scratch. A leading "//" is
// excluded because browsers treat a protocol-relative URL as absolute (it inherits the current
// scheme but an attacker-chosen host), so it must go through the same allowlist check as any
// other absolute URL instead of being trusted as "relative".
const isSafeRelativePath = url => url.startsWith('/') && !url.startsWith('//');

/**
 * Validates a candidate Workspace return destination and returns the safe URL string to navigate
 * to, or `null` if the destination must be rejected. This is the sole place that decides whether a
 * navigation is allowed to happen; callers must not navigate on a `null` result.
 * @param {{url: string, type?: string}} destination - candidate destination, normally
 *   `session.return_to` or an injected recovery URL wrapped the same way
 * @param {object} [options] - validation options
 * @param {Array<string>} [options.allowedOrigins] - absolute-URL origins permitted in this
 *   environment (e.g. `["https://kidscode.example"]`); empty by default, which rejects every
 *   absolute URL until an environment explicitly configures its own trusted origin(s)
 * @returns {string|null} the safe URL to navigate to, or `null` to reject the navigation
 */
const validateKidscodeReturnDestination = (destination, {allowedOrigins = []} = {}) => {
    if (!destination || typeof destination.url !== 'string') return null;
    const url = destination.url.trim();
    if (url.length === 0) return null;

    if (isSafeRelativePath(url)) return url;

    if (!ABSOLUTE_HTTP_URL_PATTERN.test(url)) {
        // Rejects javascript:, data:, mailto:, bare hostnames, and any other scheme/shape that
        // isn't an explicit same-origin path or an explicit http(s) absolute URL.
        return null;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!allowedOrigins.includes(parsed.origin)) return null;

    return url;
};

/**
 * Production/real navigation transport: assigns the browser location. Kept isolated so UI and
 * controller code never touch `window.location` directly, and so tests can inject
 * `createKidscodeMockNavigationTransport` instead.
 * @param {object} [options] - transport options
 * @param {object} [options.locationObject] - override for `window.location`, for tests
 * @returns {{navigate: Function}} a navigation transport
 */
const createKidscodeWindowNavigationTransport = ({
    locationObject = (typeof window === 'object' ? window.location : null)
} = {}) => ({
    navigate: url => {
        if (!locationObject) return;
        locationObject.href = url;
    }
});

/**
 * Development/test navigation transport: records the URLs it was asked to navigate to instead of
 * actually leaving the page, so unit tests and local browser verification can assert on the
 * pending navigation without losing the test harness.
 * @returns {{navigate: Function, calls: Array<string>}} a navigation transport plus its call log
 */
const createKidscodeMockNavigationTransport = () => {
    const calls = [];
    return {
        calls,
        navigate: url => {
            calls.push(url);
        }
    };
};

export {
    KidscodeReturnDestinationType,
    KidscodeReturnDestinationTypes,
    createKidscodeMockNavigationTransport,
    createKidscodeWindowNavigationTransport,
    getKidscodeWorkspaceAllowedReturnOrigins,
    validateKidscodeReturnDestination
};
