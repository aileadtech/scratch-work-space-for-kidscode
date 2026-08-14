import {KidscodeLaunchType} from '../../../src/lib/kidscode-workspace-launch';
import {KidscodeProjectSource}
    from '../../../src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract';
import {
    createKidscodeProductionPersistenceAdapter,
    createKidscodeWorkspacePersistenceAdapter
} from '../../../src/lib/kidscode-workspace-persistence/kidscode-production-persistence-adapter';

const API_BASE = 'https://testing.aileadkidscode.com/api';
const PROJECT_REF = 'SCR-PROJ-REAL';
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
    sb3 = sb3ArrayBuffer('sb3-bytes'),
    versionRef = 'SCR-VER-002',
    savedAt = '2026-08-14T10:00:00Z'
} = {}) => ({
    ok: true,
    status: 200,
    headers: {
        get: name => {
            if (name === 'X-Scratch-Version-Ref') return versionRef;
            if (name === 'X-Scratch-Saved-At') return savedAt;
            return null;
        }
    },
    arrayBuffer: jest.fn().mockResolvedValue(sb3)
});

describe('Kidscode production persistence adapter', () => {
    test('requires an explicitly configured API base', () => {
        expect(() => createKidscodeProductionPersistenceAdapter({apiBase: null, fetchImplementation: jest.fn()}))
            .toThrow('API base is not configured');
    });

    describe('loadProject', () => {
        test('sends only a Bearer authorization header, no browser credentials', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(fileResponse());
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            await adapter.loadProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                launchType: KidscodeLaunchType.EXISTING_INDEPENDENT
            });

            expect(fetchImplementation).toHaveBeenCalledWith(
                `${API_BASE}/scratch/workspace/projects/${PROJECT_REF}/file`,
                {
                    method: 'GET',
                    credentials: 'omit',
                    headers: {Authorization: `Bearer ${TOKEN}`}
                }
            );
        });

        test('reads version_ref/saved_at from response headers and the body as the sb3 bytes', async () => {
            const sb3 = sb3ArrayBuffer('real-sb3-bytes');
            const fetchImplementation = jest.fn().mockResolvedValue(
                fileResponse({sb3, versionRef: 'SCR-VER-007', savedAt: '2026-08-14T12:30:00Z'})
            );
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.loadProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                launchType: KidscodeLaunchType.EXISTING_INDEPENDENT
            });

            expect(result).toEqual({
                project_ref: PROJECT_REF,
                source: KidscodeProjectSource.SAVED,
                version_ref: 'SCR-VER-007',
                saved_at: '2026-08-14T12:30:00Z',
                sb3
            });
        });

        test('a 200 response missing the version headers is rejected rather than silently accepted', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(fileResponse({versionRef: null}));
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.loadProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                launchType: KidscodeLaunchType.EXISTING_INDEPENDENT
            })).rejects.toThrow('missing required version metadata');
        });

        test('a 404 (no saved file yet) on a new_lesson launch falls back to the starter project', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(
                {ok: false, status: 404, headers: {get: () => null}}
            );
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.loadProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                launchType: KidscodeLaunchType.NEW_LESSON
            });

            expect(result.source).toBe(KidscodeProjectSource.STARTER);
            expect(result.version_ref).toBeNull();
            expect(result.sb3).toBeTruthy();
        });

        test('a 404 (no saved file yet) on any other launch falls back to blank', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(
                {ok: false, status: 404, headers: {get: () => null}}
            );
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.loadProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                launchType: KidscodeLaunchType.NEW_INDEPENDENT
            });

            expect(result).toEqual({
                project_ref: PROJECT_REF,
                source: KidscodeProjectSource.BLANK,
                version_ref: null,
                saved_at: null,
                sb3: null
            });
        });

        test('a non-404 error response is rejected with the Laravel error envelope', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {
                    success: false,
                    error: {code: 'WORKSPACE_TOKEN_INVALID', message: 'This workspace session is invalid.'}
                },
                {ok: false, status: 401}
            ));
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.loadProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                launchType: KidscodeLaunchType.EXISTING_INDEPENDENT
            })).rejects.toThrow('This workspace session is invalid.');
        });
    });

    describe('saveProject', () => {
        test('sends multipart project_file/save_reason with a Bearer header, omitting base_version_ref on first save', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {
                    project_ref: PROJECT_REF,
                    version_ref: 'SCR-VER-001',
                    saved_at: '2026-08-14T10:00:00Z',
                    status: 'draft'
                }
            }));
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.saveProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('first-save'),
                baseVersionRef: null,
                reason: 'manual'
            });

            expect(fetchImplementation).toHaveBeenCalledTimes(1);
            const [url, init] = fetchImplementation.mock.calls[0];
            expect(url).toBe(`${API_BASE}/scratch/workspace/projects/${PROJECT_REF}/save`);
            expect(init.method).toBe('POST');
            expect(init.credentials).toBe('omit');
            expect(init.headers).toEqual({Authorization: `Bearer ${TOKEN}`});
            expect(init.body).toBeInstanceOf(FormData);
            expect(init.body.has('project_file')).toBe(true);
            expect(init.body.has('base_version_ref')).toBe(false);
            expect(init.body.get('save_reason')).toBe('manual');
            expect(result.data.version_ref).toBe('SCR-VER-001');
        });

        test('sends the latest base_version_ref on a subsequent save', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {project_ref: PROJECT_REF, version_ref: 'SCR-VER-002', saved_at: 'x', status: 'draft'}
            }));
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            await adapter.saveProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('second-save'),
                baseVersionRef: 'SCR-VER-001',
                reason: 'autosave'
            });

            const [, init] = fetchImplementation.mock.calls[0];
            expect(init.body.get('base_version_ref')).toBe('SCR-VER-001');
            expect(init.body.get('save_reason')).toBe('autosave');
        });

        test('a 409 stale-version conflict is rejected with PROJECT_VERSION_CONFLICT, not silently accepted', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {
                    success: false,
                    error: {
                        code: 'PROJECT_VERSION_CONFLICT',
                        message: 'A newer version of this project already exists.'
                    }
                },
                {ok: false, status: 409}
            ));
            const adapter = createKidscodeProductionPersistenceAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.saveProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: sb3ArrayBuffer('stale'),
                baseVersionRef: 'SCR-VER-001',
                reason: 'manual'
            })).rejects.toMatchObject({
                message: 'A newer version of this project already exists.',
                code: 'PROJECT_VERSION_CONFLICT',
                status: 409
            });
        });
    });
});

describe('createKidscodeWorkspacePersistenceAdapter (dev/real routing)', () => {
    const developmentAdapter = {
        loadProject: jest.fn().mockResolvedValue({source: 'development'}),
        saveProject: jest.fn().mockResolvedValue({source: 'development'})
    };
    const productionAdapter = {
        loadProject: jest.fn().mockResolvedValue({source: 'laravel'}),
        saveProject: jest.fn().mockResolvedValue({source: 'laravel'})
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('sends a development-fixture session (DEVELOPMENT_WORKSPACE_TOKEN_ prefix) to the dev adapter', async () => {
        const adapter = createKidscodeWorkspacePersistenceAdapter({
            environment: 'development',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.loadProject({workspaceAccessToken: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST'}))
            .resolves.toEqual({source: 'development'});
        expect(developmentAdapter.loadProject).toHaveBeenCalledTimes(1);
        expect(productionAdapter.loadProject).not.toHaveBeenCalled();
    });

    test('sends a real (non-fixture) session to the real Laravel adapter even outside a production build', async () => {
        const adapter = createKidscodeWorkspacePersistenceAdapter({
            environment: 'development',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.saveProject({workspaceAccessToken: 'REAL_RUNTIME_TOKEN_ABC123'}))
            .resolves.toEqual({source: 'laravel'});
        expect(productionAdapter.saveProject).toHaveBeenCalledTimes(1);
        expect(developmentAdapter.saveProject).not.toHaveBeenCalled();
    });

    test('never selects the development adapter in production, even for a fixture-shaped token', async () => {
        const adapter = createKidscodeWorkspacePersistenceAdapter({
            environment: 'production',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.loadProject({workspaceAccessToken: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST'}))
            .resolves.toEqual({source: 'laravel'});
        expect(developmentAdapter.loadProject).not.toHaveBeenCalled();
        expect(productionAdapter.loadProject).toHaveBeenCalledTimes(1);
    });
});
