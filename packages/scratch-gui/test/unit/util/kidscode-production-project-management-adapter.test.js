import {
    createKidscodeProductionProjectManagementAdapter,
    createKidscodeWorkspaceProjectManagementAdapter
} from '../../../src/lib/kidscode-workspace-project-management/kidscode-production-project-management-adapter';

const API_BASE = 'https://testing.aileadkidscode.com/api';
const PROJECT_REF = 'SCR-PROJ-REAL';
const TOKEN = 'REAL_RUNTIME_WORKSPACE_TOKEN';

const jsonResponse = (body, {ok = true, status = 200} = {}) => ({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body)
});

const emptyOkResponse = ({status = 204} = {}) => ({
    ok: true,
    status,
    json: jest.fn().mockRejectedValue(new Error('Unexpected end of JSON input'))
});

describe('Kidscode production project-management adapter', () => {
    test('requires an explicitly configured API base', () => {
        expect(() => createKidscodeProductionProjectManagementAdapter({apiBase: null, fetchImplementation: jest.fn()}))
            .toThrow('API base is not configured');
    });

    describe('renameProject', () => {
        test('PATCHes the real project endpoint with the new title and a Bearer header, no browser credentials', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {project_ref: PROJECT_REF, title: 'My Walking Cat', updated_at: '2026-08-17T10:00:00Z'}
            }));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.renameProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                title: 'My Walking Cat'
            });

            expect(fetchImplementation).toHaveBeenCalledWith(
                `${API_BASE}/scratch/workspace/projects/${PROJECT_REF}`,
                {
                    method: 'PATCH',
                    credentials: 'omit',
                    headers: {
                        'Authorization': `Bearer ${TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({title: 'My Walking Cat'})
                }
            );
            expect(result.data.title).toBe('My Walking Cat');
        });

        test('a rejected rename throws the Laravel error envelope and never resolves', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'PROJECT_STATUS_LOCKED', message: 'Only draft projects can be renamed.'}},
                {ok: false, status: 409}
            ));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.renameProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                title: 'New Title'
            })).rejects.toMatchObject({
                message: 'Only draft projects can be renamed.',
                code: 'PROJECT_STATUS_LOCKED',
                status: 409
            });
        });
    });

    describe('duplicateProject', () => {
        test('POSTs the real duplicate endpoint with only a Bearer header, no request body', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {
                    project_ref: 'SCR-PROJ-NEW123',
                    title: 'Make the Cat Walk Copy',
                    project_type: 'independent',
                    status: 'draft',
                    created_at: '2026-08-17T10:05:00Z'
                }
            }));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.duplicateProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: new ArrayBuffer(0),
                title: 'Make the Cat Walk'
            });

            expect(fetchImplementation).toHaveBeenCalledWith(
                `${API_BASE}/scratch/workspace/projects/${PROJECT_REF}/duplicate`,
                {
                    method: 'POST',
                    credentials: 'omit',
                    headers: {Authorization: `Bearer ${TOKEN}`}
                }
            );
            expect(result.data).toEqual({
                project_ref: 'SCR-PROJ-NEW123',
                title: 'Make the Cat Walk Copy',
                project_type: 'independent',
                status: 'draft',
                created_at: '2026-08-17T10:05:00Z'
            });
        });

        test('the original session project_ref/token are never sent as the duplicate target', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {project_ref: 'SCR-PROJ-NEW123', title: 'x Copy', project_type: 'independent', status: 'draft', created_at: 'x'}
            }));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.duplicateProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: new ArrayBuffer(0),
                title: 'x'
            });

            expect(result.data.project_ref).not.toBe(PROJECT_REF);
        });

        test('a rejected duplicate throws the Laravel error envelope', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'WORKSPACE_TOKEN_INVALID', message: 'This workspace session is invalid.'}},
                {ok: false, status: 401}
            ));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.duplicateProject({
                projectRef: PROJECT_REF,
                workspaceAccessToken: TOKEN,
                sb3: new ArrayBuffer(0),
                title: 'x'
            })).rejects.toThrow('This workspace session is invalid.');
        });
    });

    describe('deleteDraftProject', () => {
        test('DELETEs the real project endpoint with only a Bearer header', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse({
                success: true,
                data: {project_ref: PROJECT_REF, deleted: true}
            }));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.deleteDraftProject({projectRef: PROJECT_REF, workspaceAccessToken: TOKEN});

            expect(fetchImplementation).toHaveBeenCalledWith(
                `${API_BASE}/scratch/workspace/projects/${PROJECT_REF}`,
                {
                    method: 'DELETE',
                    credentials: 'omit',
                    headers: {Authorization: `Bearer ${TOKEN}`}
                }
            );
            expect(result).toEqual({success: true, data: {project_ref: PROJECT_REF, deleted: true}});
        });

        test('treats a successful empty-body response (e.g. 204) as deleted', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(emptyOkResponse());
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            const result = await adapter.deleteDraftProject({projectRef: PROJECT_REF, workspaceAccessToken: TOKEN});

            expect(result).toEqual({success: true, data: {project_ref: PROJECT_REF, deleted: true}});
        });

        test('a rejected delete (non-draft status) throws rather than silently succeeding', async () => {
            const fetchImplementation = jest.fn().mockResolvedValue(jsonResponse(
                {success: false, error: {code: 'PROJECT_STATUS_LOCKED', message: 'Only draft projects can be deleted.'}},
                {ok: false, status: 409}
            ));
            const adapter = createKidscodeProductionProjectManagementAdapter({apiBase: API_BASE, fetchImplementation});

            await expect(adapter.deleteDraftProject({projectRef: PROJECT_REF, workspaceAccessToken: TOKEN}))
                .rejects.toMatchObject({
                    message: 'Only draft projects can be deleted.',
                    code: 'PROJECT_STATUS_LOCKED',
                    status: 409
                });
        });
    });
});

describe('createKidscodeWorkspaceProjectManagementAdapter (dev/real routing)', () => {
    const developmentAdapter = {
        renameProject: jest.fn().mockResolvedValue({source: 'development'}),
        duplicateProject: jest.fn().mockResolvedValue({source: 'development'}),
        deleteDraftProject: jest.fn().mockResolvedValue({source: 'development'})
    };
    const productionAdapter = {
        renameProject: jest.fn().mockResolvedValue({source: 'laravel'}),
        duplicateProject: jest.fn().mockResolvedValue({source: 'laravel'}),
        deleteDraftProject: jest.fn().mockResolvedValue({source: 'laravel'})
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('sends a development-fixture session (DEVELOPMENT_WORKSPACE_TOKEN_ prefix) to the dev adapter', async () => {
        const adapter = createKidscodeWorkspaceProjectManagementAdapter({
            environment: 'development',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.renameProject({workspaceAccessToken: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST', title: 'x'}))
            .resolves.toEqual({source: 'development'});
        expect(developmentAdapter.renameProject).toHaveBeenCalledTimes(1);
        expect(productionAdapter.renameProject).not.toHaveBeenCalled();
    });

    test('sends a real (non-fixture) session to the real Laravel adapter even outside a production build', async () => {
        const adapter = createKidscodeWorkspaceProjectManagementAdapter({
            environment: 'development',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.duplicateProject({workspaceAccessToken: 'REAL_RUNTIME_TOKEN_ABC123'}))
            .resolves.toEqual({source: 'laravel'});
        expect(productionAdapter.duplicateProject).toHaveBeenCalledTimes(1);
        expect(developmentAdapter.duplicateProject).not.toHaveBeenCalled();

        await expect(adapter.deleteDraftProject({workspaceAccessToken: 'REAL_RUNTIME_TOKEN_ABC123'}))
            .resolves.toEqual({source: 'laravel'});
        expect(productionAdapter.deleteDraftProject).toHaveBeenCalledTimes(1);
        expect(developmentAdapter.deleteDraftProject).not.toHaveBeenCalled();
    });

    test('never selects the development adapter in production, even for a fixture-shaped token', async () => {
        const adapter = createKidscodeWorkspaceProjectManagementAdapter({
            environment: 'production',
            developmentAdapter,
            productionAdapter
        });

        await expect(adapter.renameProject({workspaceAccessToken: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST', title: 'x'}))
            .resolves.toEqual({source: 'laravel'});
        expect(developmentAdapter.renameProject).not.toHaveBeenCalled();
        expect(productionAdapter.renameProject).toHaveBeenCalledTimes(1);
    });
});
