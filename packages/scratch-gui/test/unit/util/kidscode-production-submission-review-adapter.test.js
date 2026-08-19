import {
    createKidscodeProductionSubmissionReviewAdapter,
    createKidscodeWorkspaceSubmissionReviewAdapter
} from '../../../src/lib/kidscode-workspace-submission-review/kidscode-production-submission-review-adapter';

const API_BASE = 'https://testing.aileadkidscode.com/api';
const PROJECT_REF = 'SCR-PROJ-REAL';
const SUBMISSION_REF = 'SCR-SUB-REAL001';
const TOKEN = 'REAL_RUNTIME_WORKSPACE_TOKEN';

const sb3ArrayBuffer = text => {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes.buffer;
};

const jsonResponse = (body, {ok = true, status = 200} = {}) => ({
    ok,
    status,
    headers: {get: () => null},
    json: jest.fn().mockResolvedValue(body)
});

const fileResponse = ({
    sb3 = sb3ArrayBuffer('submitted-sb3-bytes'),
    submissionRef = SUBMISSION_REF,
    versionRef = 'SCR-SUB-VER-001'
} = {}) => ({
    ok: true,
    status: 200,
    headers: {
        get: name => {
            if (name === 'X-Scratch-Submission-Ref') return submissionRef;
            if (name === 'X-Scratch-Version-Ref') return versionRef;
            return null;
        }
    },
    arrayBuffer: jest.fn().mockResolvedValue(sb3)
});

describe('Kidscode production submission/review adapter', () => {
    test('requires an explicitly configured API base', () => {
        expect(() => createKidscodeProductionSubmissionReviewAdapter({apiBase: null, fetchImplementation: jest.fn()}))
            .toThrow('API base is not configured');
    });

    describe('submitProject', () => {
        test('sends multipart project_file with a Bearer header, no browser credentials, omitting base_version_ref on first submit', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {
                    submission: {
                        submission_ref: SUBMISSION_REF,
                        project_ref: PROJECT_REF,
                        project_title: 'Make the Cat Walk',
                        version_ref: 'SCR-SUB-VER-001',
                        status: 'submitted',
                        feedback: null,
                        reviewer_ref: null,
                        submitted_at: '2026-08-18T10:00:00Z',
                        reviewed_at: null
                    }
                }
            }));
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.submitProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('first-submit'),
                baseVersionRef: null
            });

            expect(fetchImplementation).toHaveBeenCalledTimes(1);
            const [url, init] = fetchImplementation.mock.calls[0];
            expect(url).toBe(`${API_BASE}/scratch/workspace/projects/${PROJECT_REF}/submit`);
            expect(init.method).toBe('POST');
            expect(init.credentials).toBe('omit');
            expect(init.headers).toEqual({Authorization: `Bearer ${TOKEN}`});
            expect(init.body).toBeInstanceOf(FormData);
            expect(init.body.has('project_file')).toBe(true);
            expect(init.body.has('base_version_ref')).toBe(false);

            // The single real version_ref maps to both the submitted and working version, since
            // Submit is atomic save+submit on the backend.
            expect(result).toEqual({
                success: true,
                data: {
                    project_ref: PROJECT_REF,
                    submission_ref: SUBMISSION_REF,
                    submitted_version_ref: 'SCR-SUB-VER-001',
                    working_version_ref: 'SCR-SUB-VER-001',
                    submitted_at: '2026-08-18T10:00:00Z',
                    status: 'submitted'
                }
            });
        });

        test('sends the latest base_version_ref on a resubmit', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {
                    submission: {
                        submission_ref: 'SCR-SUB-REAL002',
                        project_ref: PROJECT_REF,
                        project_title: 'x',
                        version_ref: 'SCR-SUB-VER-002',
                        status: 'submitted',
                        feedback: null,
                        reviewer_ref: null,
                        submitted_at: '2026-08-18T11:00:00Z',
                        reviewed_at: null
                    }
                }
            }));
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            await adapter.submitProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('resubmit'),
                baseVersionRef: 'SCR-VER-001'
            });

            const [, init] = fetchImplementation.mock.calls[0];
            expect(init.body.get('base_version_ref')).toBe('SCR-VER-001');
        });

        test('a not-editable-status rejection is propagated, not silently accepted', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'PROJECT_NOT_EDITABLE', message: 'This project cannot be submitted in its current state.'}},
                {ok: false, status: 409}
            ));
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.submitProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('x'),
                baseVersionRef: null
            })).rejects.toMatchObject({
                message: 'This project cannot be submitted in its current state.',
                code: 'PROJECT_NOT_EDITABLE',
                status: 409
            });
        });

        test('a stale-version conflict is propagated', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'PROJECT_VERSION_CONFLICT', message: 'A newer version of this project already exists.'}},
                {ok: false, status: 409}
            ));
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.submitProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('x'),
                baseVersionRef: 'SCR-VER-STALE'
            })).rejects.toMatchObject({code: 'PROJECT_VERSION_CONFLICT', status: 409});
        });
    });

    describe('loadSubmission', () => {
        test('sends only a Bearer authorization header, no browser credentials', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(fileResponse());
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            await adapter.loadSubmission({submissionRef: SUBMISSION_REF, workspaceAccessToken: TOKEN});

            expect(fetchImplementation).toHaveBeenCalledWith(
                `${API_BASE}/scratch/workspace/submissions/${SUBMISSION_REF}/file`,
                {
                    method: 'GET',
                    credentials: 'omit',
                    headers: {Authorization: `Bearer ${TOKEN}`}
                }
            );
        });

        test('reads submission_ref/version_ref from response headers and the body as sb3 bytes', async () => {
            const sb3 = sb3ArrayBuffer('real-submitted-bytes');
            const fetchImplementation = jest.fn().mockResolvedValue(
                fileResponse({sb3, submissionRef: SUBMISSION_REF, versionRef: 'SCR-SUB-VER-007'})
            );
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.loadSubmission({submissionRef: SUBMISSION_REF, workspaceAccessToken: TOKEN});

            // The real endpoint has no project_ref/status/feedback in its response at all (unlike
            // the development adapter) — only what the headers and body actually carry.
            expect(result).toEqual({
                submission_ref: SUBMISSION_REF,
                submitted_version_ref: 'SCR-SUB-VER-007',
                sb3
            });
        });

        test('a missing-submission response is rejected with the Laravel error envelope', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'SUBMISSION_NOT_FOUND', message: 'The Scratch submission could not be found.'}},
                {ok: false, status: 404}
            ));
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.loadSubmission({submissionRef: SUBMISSION_REF, workspaceAccessToken: TOKEN}))
                .rejects.toMatchObject({code: 'SUBMISSION_NOT_FOUND', status: 404});
        });

        test('an invalid review token is rejected rather than falling back to any cached content', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'REVIEW_TOKEN_INVALID', message: 'This review session is invalid.'}},
                {ok: false, status: 401}
            ));
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.loadSubmission({submissionRef: SUBMISSION_REF, workspaceAccessToken: 'BAD_TOKEN'}))
                .rejects.toMatchObject({code: 'REVIEW_TOKEN_INVALID', status: 401});
        });
    });

    describe('approveSubmission / requestChanges', () => {
        test('both are unavailable from the Workspace — Approve/Request Changes stay on the tutor Sanctum routes', async () => {
            const adapter = createKidscodeProductionSubmissionReviewAdapter({apiBase: API_BASE, fetchImplementation: jest.fn()});

            await expect(adapter.approveSubmission({submissionRef: SUBMISSION_REF})).rejects.toThrow();
            await expect(adapter.requestChanges({submissionRef: SUBMISSION_REF, feedback: 'x'})).rejects.toThrow();
        });
    });
});

describe('createKidscodeWorkspaceSubmissionReviewAdapter (dev/real routing)', () => {
    const developmentAdapter = {
        submitProject: jest.fn().mockResolvedValue({source: 'development'}),
        loadSubmission: jest.fn().mockResolvedValue({source: 'development'}),
        approveSubmission: jest.fn().mockResolvedValue({source: 'development'}),
        requestChanges: jest.fn().mockResolvedValue({source: 'development'})
    };
    const productionAdapter = {
        submitProject: jest.fn().mockResolvedValue({source: 'laravel'}),
        loadSubmission: jest.fn().mockResolvedValue({source: 'laravel'}),
        approveSubmission: jest.fn().mockResolvedValue({source: 'laravel'}),
        requestChanges: jest.fn().mockResolvedValue({source: 'laravel'})
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('sends a development-fixture session (DEVELOPMENT_WORKSPACE_TOKEN_ prefix) to the dev adapter', async () => {
        const adapter = createKidscodeWorkspaceSubmissionReviewAdapter({
            environment: 'development',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.submitProject({workspaceAccessToken: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST'}))
            .resolves.toEqual({source: 'development'});
        expect(developmentAdapter.submitProject).toHaveBeenCalledTimes(1);
        expect(productionAdapter.submitProject).not.toHaveBeenCalled();
    });

    test('sends a real (non-fixture) session to the real Laravel adapter even outside a production build', async () => {
        const adapter = createKidscodeWorkspaceSubmissionReviewAdapter({
            environment: 'development',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.loadSubmission({workspaceAccessToken: 'REAL_RUNTIME_TOKEN_ABC123'}))
            .resolves.toEqual({source: 'laravel'});
        expect(productionAdapter.loadSubmission).toHaveBeenCalledTimes(1);
        expect(developmentAdapter.loadSubmission).not.toHaveBeenCalled();
    });

    test('never selects the development adapter in production, even for a fixture-shaped token', async () => {
        const adapter = createKidscodeWorkspaceSubmissionReviewAdapter({
            environment: 'production',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.submitProject({workspaceAccessToken: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST'}))
            .resolves.toEqual({source: 'laravel'});
        expect(developmentAdapter.submitProject).not.toHaveBeenCalled();
        expect(productionAdapter.submitProject).toHaveBeenCalledTimes(1);
    });
});
