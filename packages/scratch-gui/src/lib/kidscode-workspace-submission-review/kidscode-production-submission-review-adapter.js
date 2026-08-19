import {normalizeApiBase} from '../kidscode-production-launch-resolver';
import {isDevelopmentWorkspaceAccessToken} from '../kidscode-workspace-launch';

const KIDSCODE_SUBMISSION_REF_HEADER = 'X-Scratch-Submission-Ref';
const KIDSCODE_VERSION_REF_HEADER = 'X-Scratch-Version-Ref';
const KIDSCODE_SB3_MIME_TYPE = 'application/x.scratch.sb3';

const projectSubmitPath = projectRef => `/scratch/workspace/projects/${encodeURIComponent(projectRef)}/submit`;
const submissionFilePath = submissionRef => `/scratch/workspace/submissions/${encodeURIComponent(submissionRef)}/file`;

const authorizationHeaders = accessToken => ({Authorization: `Bearer ${accessToken}`});

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
 * Create the production Kidscode submission/review adapter, backed by the real Laravel Stage 4
 * endpoints (see docs/SHARED-API-CONTRACT.md, Workspace Submission and Tutor Review). Every request
 * authenticates with a runtime-only access token (the student's `workspaceAccessToken` for submit,
 * or a tutor review session's `review_access_token` for loadSubmission — this adapter treats
 * whatever string it is given as an opaque Bearer credential and never inspects it); nothing is
 * cached or logged.
 *
 * `approveSubmission`/`requestChanges` are intentionally left unavailable: the real Stage 4 backend
 * keeps Approve and Request Changes on the tutor's Sanctum-authenticated routes in the Kidscode
 * frontend (`/api/tutor/scratch/submissions/{submission_ref}/approve|request-changes`), not on any
 * workspace_access_token- or review_access_token-authenticated route. The Workspace has no
 * credential that could ever call them, so this adapter must not invent a call path for them.
 * @param {object} options - adapter options
 * @param {string} options.apiBase - configured Laravel API base
 * @param {function(string, object): Promise<Response>} [options.fetchImplementation] - fetch override for tests
 * @returns {{submitProject: Function, loadSubmission: Function, approveSubmission: Function,
 *   requestChanges: Function}} the production submission/review adapter
 */
const createKidscodeProductionSubmissionReviewAdapter = ({
    apiBase,
    fetchImplementation = fetch
}) => {
    const normalizedApiBase = normalizeApiBase(apiBase);
    if (!normalizedApiBase) {
        throw new Error('The Workspace API base is not configured.');
    }

    const submitProject = async ({projectRef, workspaceAccessToken, sb3, baseVersionRef}) => {
        const body = new FormData();
        body.append('project_file', new Blob([sb3], {type: KIDSCODE_SB3_MIME_TYPE}), 'project.sb3');
        // First submit (a draft that was never saved through Stage 2 yet) has no prior version; the
        // field is omitted entirely rather than sent empty, matching the Stage 2 save endpoint.
        if (baseVersionRef) {
            body.append('base_version_ref', baseVersionRef);
        }

        const response = await fetchImplementation(`${normalizedApiBase}${projectSubmitPath(projectRef)}`, {
            method: 'POST',
            credentials: 'omit',
            headers: authorizationHeaders(workspaceAccessToken),
            body
        });

        if (!response.ok) {
            throw await laravelErrorFromResponse(
                response,
                response.status === 409 ?
                    'This project cannot be submitted right now.' :
                    'Failed to submit the project.'
            );
        }

        const parsed = await response.json();
        const submission = parsed.data.submission;
        // Submit is atomic save+submit on the backend (see ScratchWorkspaceSubmissionController):
        // the same bytes are written to the new working copy and the immutable snapshot inside one
        // locked transaction, so the submission's single version_ref is correct as both the
        // Workspace-internal submitted_version_ref and working_version_ref — there is no window in
        // which those two could disagree.
        return {
            success: true,
            data: {
                project_ref: submission.project_ref,
                submission_ref: submission.submission_ref,
                submitted_version_ref: submission.version_ref,
                working_version_ref: submission.version_ref,
                submitted_at: submission.submitted_at,
                status: submission.status
            }
        };
    };

    // The real GET .../submissions/{submission_ref}/file response carries only submission_ref and
    // version_ref as headers (see ScratchWorkspaceReviewController) — no project_ref, status, or
    // feedback. Callers that need those must get them from the tutor review launch context, not from
    // this call: see the file-level note in kidscode-workspace-submission-review-hoc.jsx about the
    // resulting gap against that HOC's current cross-check.
    const loadSubmission = async ({submissionRef, workspaceAccessToken}) => {
        const response = await fetchImplementation(`${normalizedApiBase}${submissionFilePath(submissionRef)}`, {
            method: 'GET',
            credentials: 'omit',
            headers: authorizationHeaders(workspaceAccessToken)
        });

        if (!response.ok) {
            throw await laravelErrorFromResponse(response, 'Failed to load the submitted project file.');
        }

        return {
            submission_ref: response.headers.get(KIDSCODE_SUBMISSION_REF_HEADER),
            submitted_version_ref: response.headers.get(KIDSCODE_VERSION_REF_HEADER),
            sb3: await response.arrayBuffer()
        };
    };

    const reviewActionUnavailable = () => Promise.reject(new Error(
        'Approve and Request Changes are not available from the Workspace; they remain in the tutor Kidscode frontend.'
    ));

    return {
        submitProject,
        loadSubmission,
        approveSubmission: reviewActionUnavailable,
        requestChanges: reviewActionUnavailable
    };
};

/**
 * Route each submission/review call between the development IndexedDB adapter and the real Laravel
 * adapter by inspecting the caller's own access token, the same way
 * `createKidscodeWorkspacePersistenceAdapter`/`createKidscodeWorkspaceProjectManagementAdapter` route
 * Stage 2/3 calls: exact development fixtures keep working through their isolated local store, while
 * a real TEST/production session (any non-fixture token) reaches the real Stage 4 endpoints,
 * regardless of the app's own build mode. Production never selects the development adapter.
 * @param {object} options - router options
 * @param {{submitProject: Function, loadSubmission: Function, approveSubmission: Function,
 *   requestChanges: Function}} options.developmentAdapter - dev-only IndexedDB adapter
 * @param {string} [options.environment] - override for `process.env.NODE_ENV`, for tests
 * @param {{submitProject: Function, loadSubmission: Function, approveSubmission: Function,
 *   requestChanges: Function}} options.productionAdapter - real Laravel adapter
 * @returns {{submitProject: Function, loadSubmission: Function, approveSubmission: Function,
 *   requestChanges: Function}} the routed submission/review adapter
 */
const createKidscodeWorkspaceSubmissionReviewAdapter = ({
    developmentAdapter,
    environment = process.env.NODE_ENV,
    productionAdapter
}) => {
    if (environment === 'production') return productionAdapter;
    const routeByToken = (params, method) => (isDevelopmentWorkspaceAccessToken(params.workspaceAccessToken) ?
        developmentAdapter[method](params) :
        productionAdapter[method](params));
    return {
        submitProject: params => routeByToken(params, 'submitProject'),
        loadSubmission: params => routeByToken(params, 'loadSubmission'),
        approveSubmission: params => routeByToken(params, 'approveSubmission'),
        requestChanges: params => routeByToken(params, 'requestChanges')
    };
};

export {
    createKidscodeProductionSubmissionReviewAdapter,
    createKidscodeWorkspaceSubmissionReviewAdapter
};
