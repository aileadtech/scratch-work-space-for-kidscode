import {
    createKidscodeLaunchResolver,
    createKidscodeProductionLaunchResolver,
    getKidscodeWorkspaceApiBase
} from '../../../src/lib/kidscode-production-launch-resolver';
import {validateKidscodeLaunchResponse} from '../../../src/lib/kidscode-workspace-launch';

const createLaravelSuccessResponse = (overrides = {}) => ({
    success: true,
    data: {
        session_ref: 'SCR-SESSION-REAL',
        expires_at: '2026-08-12T15:00:00+00:00',
        workspace_access_token: 'RUNTIME_ONLY_TOKEN',
        student: {display_name: 'Adewale Student'},
        project: {
            project_ref: 'SCR-PROJ-REAL',
            title: 'Real Project',
            project_type: 'independent',
            status: 'draft'
        },
        assignment: null,
        course: null,
        lesson: null,
        launch_type: 'existing_independent',
        return_to: {
            type: 'project_details',
            url: 'http://localhost:3000/student-home/scratch/projects/SCR-PROJ-REAL'
        },
        ...overrides
    }
});

describe('Kidscode production launch resolver', () => {
    test('posts only the launch token without browser credentials or a Sanctum token', async () => {
        const laravelResponse = createLaravelSuccessResponse();
        const fetchImplementation = jest.fn().mockResolvedValue({
            json: jest.fn().mockResolvedValue(laravelResponse)
        });
        const resolver = createKidscodeProductionLaunchResolver({
            apiBase: 'http://127.0.0.1:8000/api/',
            fetchImplementation
        });

        await resolver('OPAQUE_LAUNCH_TOKEN');

        expect(fetchImplementation).toHaveBeenCalledWith(
            'http://127.0.0.1:8000/api/scratch/workspace/launch/resolve',
            {
                method: 'POST',
                credentials: 'omit',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({launch_token: 'OPAQUE_LAUNCH_TOKEN'})
            }
        );
    });

    test('maps the real Stage 1 response into the existing student session shape', async () => {
        const resolver = createKidscodeProductionLaunchResolver({
            apiBase: 'http://127.0.0.1:8000/api',
            fetchImplementation: jest.fn().mockResolvedValue({
                json: jest.fn().mockResolvedValue(createLaravelSuccessResponse())
            })
        });

        const response = validateKidscodeLaunchResponse(await resolver('OPAQUE_LAUNCH_TOKEN'));

        expect(response.success).toBe(true);
        expect(response.data.role).toBe('student');
        expect(response.data.return_to).toEqual({
            type: 'projects',
            url: 'http://localhost:3000/student-home/scratch/projects/SCR-PROJ-REAL'
        });
        expect(response.data.workspace_access_token).toBe('RUNTIME_ONLY_TOKEN');
    });

    test.each([
        ['LAUNCH_SESSION_EXPIRED', 410],
        ['INVALID_LAUNCH_SESSION', 404],
        ['WORKSPACE_ACCESS_DENIED', 403]
    ])('returns the Laravel %s error envelope from an HTTP %s response', async (code, status) => {
        const errorResponse = {
            success: false,
            error: {code, message: 'Launch failed.'}
        };
        const resolver = createKidscodeProductionLaunchResolver({
            apiBase: 'http://127.0.0.1:8000/api',
            fetchImplementation: jest.fn().mockResolvedValue({
                ok: false,
                status,
                json: jest.fn().mockResolvedValue(errorResponse)
            })
        });

        await expect(resolver('OPAQUE_LAUNCH_TOKEN')).resolves.toEqual(errorResponse);
    });

    test('preserves transport failures for the launch HOC connection-lost state', async () => {
        const networkError = new TypeError('Failed to fetch');
        const resolver = createKidscodeProductionLaunchResolver({
            apiBase: 'http://127.0.0.1:8000/api',
            fetchImplementation: jest.fn().mockRejectedValue(networkError)
        });

        await expect(resolver('OPAQUE_LAUNCH_TOKEN')).rejects.toBe(networkError);
    });

    test('requires an explicitly configured production API base', () => {
        expect(getKidscodeWorkspaceApiBase({environment: 'production', configuredApiBase: ''})).toBeNull();
        expect(() => createKidscodeProductionLaunchResolver({apiBase: null, fetchImplementation: jest.fn()}))
            .toThrow('API base is not configured');
    });

    test('uses the local Laravel API base only outside production', () => {
        expect(getKidscodeWorkspaceApiBase({environment: 'development', configuredApiBase: ''}))
            .toBe('http://127.0.0.1:8000/api');
        expect(getKidscodeWorkspaceApiBase({
            environment: 'production',
            configuredApiBase: 'https://api.example.com/api/'
        })).toBe('https://api.example.com/api');
    });

    test('preserves exact development fixtures while sending real tokens to Laravel', async () => {
        const developmentResolver = jest.fn().mockResolvedValue({source: 'fixture'});
        const productionResolver = jest.fn().mockResolvedValue({source: 'laravel'});
        const resolver = createKidscodeLaunchResolver({
            environment: 'development',
            developmentResolver,
            productionResolver
        });

        await expect(resolver('demo-lesson')).resolves.toEqual({source: 'fixture'});
        await expect(resolver('REAL_OPAQUE_TOKEN')).resolves.toEqual({source: 'laravel'});
        expect(developmentResolver).toHaveBeenCalledTimes(1);
        expect(productionResolver).toHaveBeenCalledTimes(1);
    });

    test('never selects a development fixture resolver in production', async () => {
        const developmentResolver = jest.fn();
        const productionResolver = jest.fn().mockResolvedValue({source: 'laravel'});
        const resolver = createKidscodeLaunchResolver({
            environment: 'production',
            developmentResolver,
            productionResolver
        });

        await expect(resolver('demo-lesson')).resolves.toEqual({source: 'laravel'});
        expect(developmentResolver).not.toHaveBeenCalled();
    });
});
