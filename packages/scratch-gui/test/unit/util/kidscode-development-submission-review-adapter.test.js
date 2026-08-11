import {
    KidscodeDevelopmentSubmissionFixtureProjectRef,
    KidscodeDevelopmentSubmissionFixtureSubmissionRef
} from '../../../src/lib/kidscode-workspace-launch';
import {KidscodeProjectStatus}
    from '../../../src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {createKidscodeDevelopmentSubmissionReviewAdapter}
    from '../../../src/lib/kidscode-workspace-submission-review/kidscode-development-submission-review-adapter';
import {createKidscodeDevelopmentPersistenceAdapter}
    from '../../../src/lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter';

const clone = value => value && Object.assign({}, value);

const createInMemoryStore = () => {
    const projects = new Map();
    const submissions = new Map();
    return {
        getProject: projectRef => Promise.resolve(projects.get(projectRef)),
        putProject: (record, {expectedVersionRef, allowedStatuses} = {}) => {
            const existing = projects.get(record.projectRef);
            const existingVersionRef = (existing && existing.versionRef) || null;
            const existingStatus = (existing && existing.status) || KidscodeProjectStatus.DRAFT;
            if (typeof expectedVersionRef !== 'undefined' && expectedVersionRef !== existingVersionRef) {
                return Promise.reject(new Error('Project version conflict.'));
            }
            if (allowedStatuses && !allowedStatuses.includes(existingStatus)) {
                return Promise.reject(new Error('Project status conflict.'));
            }
            projects.set(record.projectRef, Object.assign({}, projects.get(record.projectRef), record));
            return Promise.resolve();
        },
        getSubmission: submissionRef => Promise.resolve(submissions.get(submissionRef)),
        updateSubmissionReview: (submissionRef, review) => {
            const existing = submissions.get(submissionRef);
            if (!existing) return Promise.reject(new Error('Submission not found.'));
            submissions.set(submissionRef, Object.assign({}, existing, review, {sb3: existing.sb3}));
            return Promise.resolve();
        },
        commitSubmission: ({projectRef, baseVersionRef, allowedStatuses, projectRecord, submission}) => {
            const existing = projects.get(projectRef);
            const existingVersionRef = (existing && existing.versionRef) || null;
            const existingStatus = (existing && existing.status) || KidscodeProjectStatus.DRAFT;
            if (existing && existing.deletedAt) return Promise.reject(new Error('Project deleted.'));
            if (baseVersionRef !== existingVersionRef) return Promise.reject(new Error('Project version conflict.'));
            if (!allowedStatuses.includes(existingStatus)) {
                return Promise.reject(new Error('Project status conflict.'));
            }
            if (submissions.has(submission.submissionRef)) {
                return Promise.reject(new Error('Submission already exists.'));
            }
            submissions.set(submission.submissionRef, clone(submission));
            projects.set(projectRef, Object.assign({}, existing, projectRecord));
            return Promise.resolve();
        },
        projects,
        submissions
    };
};

const bytes = text => {
    const result = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) result[i] = text.charCodeAt(i);
    return result.buffer;
};

describe('Kidscode development submission/review adapter', () => {
    const workspaceAccessToken = 'DEVELOPMENT_WORKSPACE_TOKEN_TEST';
    const projectRef = 'SCR-PROJ-SUBMISSION-TEST';
    const createAdapter = options => createKidscodeDevelopmentSubmissionReviewAdapter(Object.assign({
        environment: 'test',
        now: () => '2026-08-11T12:00:00.000Z'
    }, options));

    test('cannot be created in production', () => {
        expect(() => createKidscodeDevelopmentSubmissionReviewAdapter({environment: 'production'}))
            .toThrow('cannot run in production');
    });

    test.each(['submitProject', 'loadSubmission', 'approveSubmission', 'requestChanges'])(
        '%s rejects without a workspace access token',
        async operation => {
            const adapter = createAdapter({store: createInMemoryStore()});
            await expect(adapter[operation]({
                projectRef,
                submissionRef: 'SCR-SUB-X',
                submittedVersionRef: 'SCR-SUB-VER-X',
                workspaceAccessToken: '',
                sb3: bytes('A'),
                feedback: 'Please revise.'
            })).rejects.toThrow('Missing workspace access token');
        }
    );

    test('submit captures the supplied current bytes and updates the project to submitted', async () => {
        const store = createInMemoryStore();
        store.projects.set(projectRef, {
            projectRef,
            status: KidscodeProjectStatus.DRAFT,
            versionRef: 'SCR-DEV-VER-4',
            versionNumber: 4,
            sb3: bytes('PERSISTED WORKING STATE')
        });
        const adapter = createAdapter({store});
        const currentSb3 = bytes('CURRENT UNSAVED EDITOR STATE');

        const result = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: currentSb3,
            baseVersionRef: 'SCR-DEV-VER-4'
        });

        expect(result.data.status).toBe(KidscodeProjectStatus.SUBMITTED);
        expect(result.data.submission_ref).toBe('SCR-DEV-SUB-SCR-PROJ-SUBMISSION-TEST-1');
        expect(result.data.submitted_version_ref).toBe('SCR-DEV-SUB-VER-SCR-PROJ-SUBMISSION-TEST-1');
        expect(store.projects.get(projectRef)).toMatchObject({
            status: KidscodeProjectStatus.SUBMITTED,
            latestSubmissionRef: result.data.submission_ref,
            submissionNumber: 1,
            versionRef: 'SCR-DEV-VER-5',
            versionNumber: 5
        });
        expect(result.data.working_version_ref).toBe('SCR-DEV-VER-5');
        expect(Buffer.from(store.projects.get(projectRef).sb3).toString()).toBe('CURRENT UNSAVED EDITOR STATE');
        expect(Buffer.from(store.submissions.get(result.data.submission_ref).sb3).toString())
            .toBe('CURRENT UNSAVED EDITOR STATE');
    });

    test('reopens the submitted state as the working copy after changes are requested', async () => {
        const store = createInMemoryStore();
        store.projects.set(projectRef, {
            projectRef,
            status: KidscodeProjectStatus.DRAFT,
            versionRef: 'SCR-DEV-VER-1',
            versionNumber: 1,
            sb3: bytes('WORKING X')
        });
        const submissionAdapter = createAdapter({store});
        const persistenceAdapter = createKidscodeDevelopmentPersistenceAdapter({environment: 'test', store});

        const first = await submissionAdapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED A'),
            baseVersionRef: 'SCR-DEV-VER-1'
        });
        expect(Buffer.from(store.submissions.get(first.data.submission_ref).sb3).toString()).toBe('SUBMITTED A');

        await submissionAdapter.requestChanges({
            submissionRef: first.data.submission_ref,
            submittedVersionRef: first.data.submitted_version_ref,
            workspaceAccessToken,
            feedback: 'Please revise.'
        });
        const reopened = await persistenceAdapter.loadProject({
            projectRef,
            workspaceAccessToken,
            launchType: 'existing_independent'
        });
        expect(reopened.version_ref).toBe('SCR-DEV-VER-2');
        expect(Buffer.from(reopened.sb3).toString()).toBe('SUBMITTED A');

        const savedC = await persistenceAdapter.saveProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('WORKING C'),
            baseVersionRef: reopened.version_ref,
            reason: 'manual'
        });
        const second = await submissionAdapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED C'),
            baseVersionRef: savedC.data.version_ref
        });

        expect(Buffer.from(store.submissions.get(first.data.submission_ref).sb3).toString()).toBe('SUBMITTED A');
        expect(Buffer.from(store.submissions.get(second.data.submission_ref).sb3).toString()).toBe('SUBMITTED C');
        expect(Buffer.from(store.projects.get(projectRef).sb3).toString()).toBe('SUBMITTED C');
    });

    test('a stale autosave cannot overwrite a successful submission working copy', async () => {
        const store = createInMemoryStore();
        store.projects.set(projectRef, {
            projectRef,
            status: KidscodeProjectStatus.DRAFT,
            versionRef: 'SCR-DEV-VER-1',
            versionNumber: 1,
            sb3: bytes('WORKING X')
        });
        const submissionAdapter = createAdapter({store});
        const persistenceAdapter = createKidscodeDevelopmentPersistenceAdapter({environment: 'test', store});
        const originalPutProject = store.putProject;
        let releaseAutosave;
        let markAutosaveReady;
        const autosaveReady = new Promise(resolve => {
            markAutosaveReady = resolve;
        });
        store.putProject = (record, options) => new Promise((resolve, reject) => {
            releaseAutosave = () => originalPutProject(record, options).then(resolve, reject);
            markAutosaveReady();
        });

        const autosave = persistenceAdapter.saveProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('STALE AUTOSAVE'),
            baseVersionRef: 'SCR-DEV-VER-1',
            reason: 'autosave'
        });
        await autosaveReady;

        const submitted = await submissionAdapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED A'),
            baseVersionRef: 'SCR-DEV-VER-1'
        });
        releaseAutosave();
        await expect(autosave).rejects.toThrow('version conflict');

        expect(store.projects.get(projectRef).versionRef).toBe(submitted.data.working_version_ref);
        expect(store.projects.get(projectRef).status).toBe(KidscodeProjectStatus.SUBMITTED);
        expect(Buffer.from(store.projects.get(projectRef).sb3).toString()).toBe('SUBMITTED A');
    });

    test('an autosave that advances first makes a stale submission fail without partial state', async () => {
        const store = createInMemoryStore();
        store.projects.set(projectRef, {
            projectRef,
            status: KidscodeProjectStatus.DRAFT,
            versionRef: 'SCR-DEV-VER-1',
            versionNumber: 1,
            sb3: bytes('WORKING X')
        });
        const submissionAdapter = createAdapter({store});
        const persistenceAdapter = createKidscodeDevelopmentPersistenceAdapter({environment: 'test', store});

        const autosave = await persistenceAdapter.saveProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('AUTOSAVED A'),
            baseVersionRef: 'SCR-DEV-VER-1',
            reason: 'autosave'
        });
        await expect(submissionAdapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED A'),
            baseVersionRef: 'SCR-DEV-VER-1'
        })).rejects.toThrow('base project version');

        expect(store.submissions.size).toBe(0);
        expect(store.projects.get(projectRef)).toMatchObject({
            status: KidscodeProjectStatus.DRAFT,
            versionRef: autosave.data.version_ref
        });
        expect(Buffer.from(store.projects.get(projectRef).sb3).toString()).toBe('AUTOSAVED A');
    });

    test('a failed atomic submission leaves both working and submitted records unchanged', async () => {
        const store = createInMemoryStore();
        const workingX = {
            projectRef,
            status: KidscodeProjectStatus.DRAFT,
            versionRef: 'SCR-DEV-VER-1',
            versionNumber: 1,
            sb3: bytes('WORKING X')
        };
        store.projects.set(projectRef, workingX);
        store.commitSubmission = jest.fn(() => Promise.reject(new Error('transaction failed')));
        const adapter = createAdapter({store});

        await expect(adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED A'),
            baseVersionRef: 'SCR-DEV-VER-1'
        })).rejects.toThrow('transaction failed');

        expect(store.submissions.size).toBe(0);
        expect(store.projects.get(projectRef)).toBe(workingX);
    });

    test('submitted snapshots remain immutable while the working project changes and after resubmit', async () => {
        const store = createInMemoryStore();
        store.projects.set(projectRef, {
            projectRef,
            status: KidscodeProjectStatus.DRAFT,
            versionRef: 'SCR-DEV-VER-1',
            sb3: bytes('WORKING A')
        });
        const adapter = createAdapter({store});

        const first = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED A'),
            baseVersionRef: 'SCR-DEV-VER-1'
        });
        store.projects.set(projectRef, Object.assign({}, store.projects.get(projectRef), {
            sb3: bytes('WORKING B')
        }));

        const loadedA = await adapter.loadSubmission({
            submissionRef: first.data.submission_ref,
            workspaceAccessToken
        });
        expect(Buffer.from(loadedA.sb3).toString()).toBe('SUBMITTED A');

        await adapter.requestChanges({
            submissionRef: first.data.submission_ref,
            submittedVersionRef: first.data.submitted_version_ref,
            workspaceAccessToken,
            feedback: 'Add another movement.'
        });
        store.projects.set(projectRef, Object.assign({}, store.projects.get(projectRef), {
            versionRef: 'SCR-DEV-VER-2',
            sb3: bytes('WORKING C')
        }));
        const second = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('SUBMITTED C'),
            baseVersionRef: 'SCR-DEV-VER-2'
        });

        expect(second.data.submission_ref).not.toBe(first.data.submission_ref);
        expect(store.submissions.size).toBe(2);
        expect(Buffer.from(store.submissions.get(first.data.submission_ref).sb3).toString()).toBe('SUBMITTED A');
        expect(Buffer.from(store.submissions.get(second.data.submission_ref).sb3).toString()).toBe('SUBMITTED C');
        expect(store.submissions.get(first.data.submission_ref).feedback).toBe('Add another movement.');
    });

    test('approve and request changes are bound to the exact latest submitted version', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter({store});
        const first = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('A'),
            baseVersionRef: null
        });

        await expect(adapter.approveSubmission({
            submissionRef: first.data.submission_ref,
            submittedVersionRef: 'WRONG-VERSION',
            workspaceAccessToken
        })).rejects.toThrow('version');

        const changed = await adapter.requestChanges({
            submissionRef: first.data.submission_ref,
            submittedVersionRef: first.data.submitted_version_ref,
            workspaceAccessToken,
            feedback: '  Add a loop.  '
        });
        expect(changed.data.status).toBe(KidscodeProjectStatus.CHANGES_REQUESTED);
        expect(changed.data.feedback).toBe('Add a loop.');
        expect(store.projects.get(projectRef)).toMatchObject({
            status: KidscodeProjectStatus.CHANGES_REQUESTED,
            reviewFeedback: expect.objectContaining({feedback: 'Add a loop.'})
        });
    });

    test('approval marks both the reviewed submission and project approved', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter({store});
        const submitted = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('A'),
            baseVersionRef: null
        });

        const approved = await adapter.approveSubmission({
            submissionRef: submitted.data.submission_ref,
            submittedVersionRef: submitted.data.submitted_version_ref,
            workspaceAccessToken
        });

        expect(approved.data.status).toBe(KidscodeProjectStatus.APPROVED);
        expect(store.projects.get(projectRef).status).toBe(KidscodeProjectStatus.APPROVED);
        expect(store.submissions.get(submitted.data.submission_ref).status).toBe(KidscodeProjectStatus.APPROVED);
    });

    test('rejects empty review feedback', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter({store});
        const submitted = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('A'),
            baseVersionRef: null
        });
        await expect(adapter.requestChanges({
            submissionRef: submitted.data.submission_ref,
            submittedVersionRef: submitted.data.submitted_version_ref,
            workspaceAccessToken,
            feedback: '   '
        })).rejects.toThrow('Feedback');
    });

    test('reserved development failures reject without falling back', async () => {
        const adapter = createAdapter({store: createInMemoryStore()});
        await expect(adapter.submitProject({
            projectRef: KidscodeDevelopmentSubmissionFixtureProjectRef.SUBMIT_FAILURE,
            workspaceAccessToken,
            sb3: bytes('A')
        })).rejects.toThrow();
        await expect(adapter.loadSubmission({
            submissionRef: KidscodeDevelopmentSubmissionFixtureSubmissionRef.FILE_UNAVAILABLE,
            workspaceAccessToken
        })).rejects.toThrow();
        await expect(adapter.loadSubmission({
            submissionRef: KidscodeDevelopmentSubmissionFixtureSubmissionRef.ACCESS_DENIED,
            workspaceAccessToken
        })).rejects.toThrow();
        await expect(adapter.approveSubmission({
            submissionRef: KidscodeDevelopmentSubmissionFixtureSubmissionRef.APPROVE_FAILURE,
            submittedVersionRef: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            workspaceAccessToken
        })).rejects.toThrow();
        await expect(adapter.requestChanges({
            submissionRef: KidscodeDevelopmentSubmissionFixtureSubmissionRef.REQUEST_CHANGES_FAILURE,
            submittedVersionRef: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            workspaceAccessToken,
            feedback: 'Please revise.'
        })).rejects.toThrow();
    });

    test('never persists workspace credentials', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter({store});
        const submitted = await adapter.submitProject({
            projectRef,
            workspaceAccessToken,
            sb3: bytes('A'),
            baseVersionRef: null
        });

        expect(JSON.stringify(store.projects.get(projectRef))).not.toContain(workspaceAccessToken);
        expect(JSON.stringify(store.submissions.get(submitted.data.submission_ref))).not.toContain(workspaceAccessToken);
    });
});
