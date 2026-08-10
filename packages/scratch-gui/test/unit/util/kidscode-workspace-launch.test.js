import {
    KidscodeLaunchErrorCode,
    KidscodeLaunchType,
    createDevelopmentMockLaunchResolver,
    readKidscodeLaunchToken,
    removeKidscodeLaunchToken,
    validateKidscodeLaunchResponse
} from '../../../src/lib/kidscode-workspace-launch';

describe('Kidscode workspace launch resolver', () => {
    const resolveDevelopmentLaunch = createDevelopmentMockLaunchResolver({delay: 0, environment: 'test'});

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
});
