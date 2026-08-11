import {
    KidscodeLaunchErrorCode,
    KidscodeLaunchType,
    createDevelopmentMockLaunchResolver,
    readKidscodeLaunchToken,
    removeKidscodeLaunchToken,
    validateKidscodeLaunchResponse
} from '../../../src/lib/kidscode-workspace-launch';

// Mirrors the in-memory fake store used by the development adapter tests: jsdom does not
// implement IndexedDB, and this also makes "no development record yet" explicit rather than
// relying on a real IndexedDB read failing.
const createInMemoryStore = () => {
    const records = new Map();
    const submissions = new Map();
    return {
        getProject: projectRef => Promise.resolve(records.get(projectRef)),
        getSubmission: submissionRef => Promise.resolve(submissions.get(submissionRef)),
        putProject: record => {
            records.set(record.projectRef, Object.assign({}, records.get(record.projectRef), record));
            return Promise.resolve();
        },
        records,
        submissions
    };
};

describe('Kidscode workspace launch resolver', () => {
    const resolveDevelopmentLaunch = createDevelopmentMockLaunchResolver({
        delay: 0,
        environment: 'test',
        store: createInMemoryStore()
    });

    test('reads only the launch token from the URL', () => {
        expect(readKidscodeLaunchToken({
            search: '?launch=demo-lesson&student=Untrusted&project=Untrusted'
        })).toBe('demo-lesson');
    });

    test('resolves the lesson fixture with the shared contract shape', async () => {
        const response = validateKidscodeLaunchResponse(await resolveDevelopmentLaunch('demo-lesson'));

        expect(response.success).toBe(true);
        expect(response.data.student.display_name).toBe('Adewale');
        expect(response.data.project.title).toBe('Make the Cat Walk');
        expect(response.data.project.project_type).toBe('lesson');
        expect(response.data.launch_type).toBe(KidscodeLaunchType.EXISTING_LESSON);
        expect(response.data.assignment.title).toBe('Make the Cat Walk');
        expect(response.data.course.title).toBe('Introduction to Scratch');
        expect(response.data.lesson.title).toBe('Motion');
    });

    test('resolves an independent project with nullable lesson context', async () => {
        const response = validateKidscodeLaunchResponse(await resolveDevelopmentLaunch('demo-independent'));

        expect(response.success).toBe(true);
        expect(response.data.project.title).toBe('My Space Animation');
        expect(response.data.project.project_type).toBe('independent');
        expect(response.data.launch_type).toBe(KidscodeLaunchType.EXISTING_INDEPENDENT);
        expect(response.data.assignment).toBeNull();
        expect(response.data.course).toBeNull();
        expect(response.data.lesson).toBeNull();
    });

    test.each([
        ['demo-new-lesson', KidscodeLaunchType.NEW_LESSON, 'Animate Your Name'],
        ['demo-new-independent', KidscodeLaunchType.NEW_INDEPENDENT, 'Untitled Scratch Project']
    ])('recognises %s', async (launchToken, expectedLaunchType, expectedTitle) => {
        const response = validateKidscodeLaunchResponse(await resolveDevelopmentLaunch(launchToken));

        expect(response.success).toBe(true);
        expect(response.data.launch_type).toBe(expectedLaunchType);
        expect(response.data.project.title).toBe(expectedTitle);
    });

    test.each([
        ['demo-expired', KidscodeLaunchErrorCode.SESSION_EXPIRED],
        ['demo-invalid', KidscodeLaunchErrorCode.INVALID_SESSION],
        ['demo-denied', KidscodeLaunchErrorCode.ACCESS_DENIED]
    ])('returns the expected error for %s', async (launchToken, expectedCode) => {
        const response = validateKidscodeLaunchResponse(await resolveDevelopmentLaunch(launchToken));

        expect(response.success).toBe(false);
        expect(response.error.code).toBe(expectedCode);
    });

    test('simulates a connection failure without returning a mock success', async () => {
        await expect(resolveDevelopmentLaunch('demo-offline')).rejects.toThrow('offline');
    });

    test('rejects an unsupported launch type during contract validation', () => {
        const response = validateKidscodeLaunchResponse({
            success: true,
            data: {
                session_ref: 'SCR-SESSION-TEST',
                expires_at: '2099-08-10T15:00:00Z',
                workspace_access_token: 'TEST_WORKSPACE_TOKEN',
                role: 'student',
                student: {display_name: 'Adewale'},
                project: {
                    project_ref: 'SCR-PROJ-TEST',
                    title: 'Test Project',
                    project_type: 'lesson',
                    status: 'draft'
                },
                assignment: null,
                course: null,
                lesson: null,
                launch_type: 'unsupported_launch',
                return_to: {type: 'lesson', url: '/lessons'}
            }
        });

        expect(response.success).toBe(false);
        expect(response.error.code).toBe(KidscodeLaunchErrorCode.INVALID_RESPONSE);
    });

    test('removes only the launch token after a successful resolution', () => {
        const historyObject = {
            state: {existing: true},
            replaceState: jest.fn()
        };
        removeKidscodeLaunchToken({
            href: 'http://localhost:8601/?launch=demo-lesson&locale=fr#editor'
        }, historyObject);

        expect(historyObject.replaceState).toHaveBeenCalledWith(
            {existing: true},
            '',
            '/?locale=fr#editor'
        );
    });

    test('development mock cannot be created in production', () => {
        expect(() => createDevelopmentMockLaunchResolver({environment: 'production'}))
            .toThrow('cannot run in production');
    });

    test('validates review launch context without changing the four student launch types', async () => {
        const response = validateKidscodeLaunchResponse(await resolveDevelopmentLaunch('demo-review-submitted'));

        expect(response.success).toBe(true);
        expect(response.data.role).toBe('tutor');
        expect(response.data.launch_type).toBe(KidscodeLaunchType.REVIEW);
        expect(response.data.review).toEqual({
            submission_ref: 'SCR-SUB-DEV-REVIEW-FIXTURE',
            submitted_version_ref: 'SCR-SUB-VER-DEV-REVIEW-FIXTURE',
            submitted_at: '2026-08-11T12:00:00Z'
        });
    });

    test('rejects a review launch with no exact submitted version context', async () => {
        const fixture = await resolveDevelopmentLaunch('demo-review-submitted');
        const response = validateKidscodeLaunchResponse({
            success: true,
            data: Object.assign({}, fixture.data, {review: null})
        });

        expect(response.success).toBe(false);
        expect(response.error.code).toBe(KidscodeLaunchErrorCode.INVALID_RESPONSE);
    });

    test('hydrates review-latest with the exact newest immutable submission record', async () => {
        const store = createInMemoryStore();
        store.records.set('SCR-PROJ-X82AB', {
            projectRef: 'SCR-PROJ-X82AB',
            status: 'submitted',
            latestSubmissionRef: 'SCR-DEV-SUB-SCR-PROJ-X82AB-2'
        });
        store.submissions.set('SCR-DEV-SUB-SCR-PROJ-X82AB-2', {
            submissionRef: 'SCR-DEV-SUB-SCR-PROJ-X82AB-2',
            submittedVersionRef: 'SCR-DEV-SUB-VER-SCR-PROJ-X82AB-2',
            submittedAt: '2026-08-11T13:00:00Z'
        });
        const resolver = createDevelopmentMockLaunchResolver({delay: 0, environment: 'test', store});

        const response = await resolver('demo-review-latest');
        expect(response.data.review).toEqual({
            submission_ref: 'SCR-DEV-SUB-SCR-PROJ-X82AB-2',
            submitted_version_ref: 'SCR-DEV-SUB-VER-SCR-PROJ-X82AB-2',
            submitted_at: '2026-08-11T13:00:00Z'
        });
    });

    describe('development title hydration from the project-management store', () => {
        test('reflects a title renamed earlier in the same browser session', async () => {
            const store = createInMemoryStore();
            store.records.set('SCR-PROJ-X82AB', {projectRef: 'SCR-PROJ-X82AB', title: 'My Walking Cat'});
            const resolveWithRenamedStore = createDevelopmentMockLaunchResolver({delay: 0, environment: 'test', store});

            const response = await resolveWithRenamedStore('demo-lesson');

            expect(response.data.project.title).toBe('My Walking Cat');
            // Only the title is overridden; nothing else about the launch fixture changes.
            expect(response.data.project.project_ref).toBe('SCR-PROJ-X82AB');
            expect(response.data.assignment.title).toBe('Make the Cat Walk');
        });

        test('does not mutate the shared static fixture for later, unrelated launches', async () => {
            const renamedStore = createInMemoryStore();
            renamedStore.records.set('SCR-PROJ-X82AB', {projectRef: 'SCR-PROJ-X82AB', title: 'My Walking Cat'});
            const resolveWithRenamedStore = createDevelopmentMockLaunchResolver({
                delay: 0, environment: 'test', store: renamedStore
            });
            await resolveWithRenamedStore('demo-lesson');

            const freshResponse = await resolveDevelopmentLaunch('demo-lesson');
            expect(freshResponse.data.project.title).toBe('Make the Cat Walk');
        });

        test('falls back to the fixture title when the development store read fails', async () => {
            const failingStore = {getProject: () => Promise.reject(new Error('IndexedDB unavailable'))};
            const resolveWithFailingStore = createDevelopmentMockLaunchResolver({
                delay: 0, environment: 'test', store: failingStore
            });

            const response = await resolveWithFailingStore('demo-lesson');
            expect(response.data.project.title).toBe('Make the Cat Walk');
        });

        test('does not consult the store for an error response', async () => {
            const store = {getProject: jest.fn(() => Promise.resolve())};
            const resolveWithStore = createDevelopmentMockLaunchResolver({delay: 0, environment: 'test', store});

            await resolveWithStore('demo-expired');
            expect(store.getProject).not.toHaveBeenCalled();
        });
    });
});
