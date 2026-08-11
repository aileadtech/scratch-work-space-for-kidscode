import {KidscodeDevelopmentProjectManagementFixtureProjectRef} from '../../../src/lib/kidscode-workspace-launch';
import {KidscodeProjectStatus} from '../../../src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {createKidscodeDevelopmentProjectManagementAdapter}
    from '../../../src/lib/kidscode-workspace-project-management/kidscode-development-project-management-adapter';

// Mirrors the in-memory fake store used by the Phase 4 persistence adapter tests: jsdom does not
// implement IndexedDB, so the real store (kidscode-development-project-store.js) is exercised
// through this {getProject, putProject} stand-in instead. putProject merges onto any existing
// record, matching the real store's merge-put behaviour (see that file's header comment).
const createInMemoryStore = () => {
    const records = new Map();
    return {
        getProject: projectRef => Promise.resolve(records.get(projectRef)),
        putProject: record => {
            records.set(record.projectRef, Object.assign({}, records.get(record.projectRef), record));
            return Promise.resolve();
        },
        records
    };
};

const createAdapter = (store, generateProjectRef) => createKidscodeDevelopmentProjectManagementAdapter({
    environment: 'test',
    store: store || createInMemoryStore(),
    generateProjectRef
});

describe('Kidscode development project-management adapter', () => {
    const workspaceAccessToken = 'DEVELOPMENT_WORKSPACE_TOKEN_TEST';

    test('cannot be created in production', () => {
        expect(() => createKidscodeDevelopmentProjectManagementAdapter({environment: 'production'}))
            .toThrow('cannot run in production');
    });

    describe('renameProject', () => {
        test('rejects without a workspace access token', async () => {
            const adapter = createAdapter();
            await expect(adapter.renameProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken: '', title: 'x'}))
                .rejects.toThrow('Missing workspace access token');
        });

        test('trims whitespace and persists the new title', async () => {
            const store = createInMemoryStore();
            const adapter = createAdapter(store);
            const result = await adapter.renameProject({
                projectRef: 'SCR-PROJ-RENAME',
                workspaceAccessToken,
                title: '  My Walking Cat  '
            });

            expect(result).toEqual({
                success: true,
                data: {
                    project_ref: 'SCR-PROJ-RENAME',
                    title: 'My Walking Cat',
                    updated_at: expect.any(String)
                }
            });
            expect(store.records.get('SCR-PROJ-RENAME').title).toBe('My Walking Cat');
        });

        test('rejects an empty or whitespace-only title', async () => {
            const adapter = createAdapter();
            await expect(adapter.renameProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken, title: '   '}))
                .rejects.toThrow('cannot be empty');
        });

        test('rejects a title longer than the established limit', async () => {
            const adapter = createAdapter();
            await expect(adapter.renameProject({
                projectRef: 'SCR-PROJ-X',
                workspaceAccessToken,
                title: 'x'.repeat(101)
            })).rejects.toThrow('cannot be longer than');
        });

        test('a failed rename does not change the stored record', async () => {
            const store = createInMemoryStore();
            store.putProject({projectRef: 'SCR-PROJ-X', title: 'Original', status: KidscodeProjectStatus.DRAFT});
            const adapter = createAdapter(store);

            await expect(adapter.renameProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken, title: ''}))
                .rejects.toThrow();
            expect(store.records.get('SCR-PROJ-X').title).toBe('Original');
        });

        test('is blocked for a non-draft project', async () => {
            const store = createInMemoryStore();
            store.putProject({projectRef: 'SCR-PROJ-SUBMITTED', status: KidscodeProjectStatus.SUBMITTED});
            const adapter = createAdapter(store);

            await expect(adapter.renameProject({projectRef: 'SCR-PROJ-SUBMITTED', workspaceAccessToken, title: 'x'}))
                .rejects.toThrow('Only draft projects can be renamed');
        });

        test('the reserved rename-failure fixture project always rejects', async () => {
            const adapter = createAdapter();
            await expect(adapter.renameProject({
                projectRef: KidscodeDevelopmentProjectManagementFixtureProjectRef.RENAME_FAILURE,
                workspaceAccessToken,
                title: 'x'
            })).rejects.toThrow();
        });
    });

    describe('duplicateProject', () => {
        test('rejects without a workspace access token', async () => {
            const adapter = createAdapter();
            await expect(adapter.duplicateProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken: '', sb3: {}}))
                .rejects.toThrow('Missing workspace access token');
        });

        test('creates a new independent draft project_ref containing the given sb3 and a "Copy" title', async () => {
            const store = createInMemoryStore();
            const adapter = createAdapter(store, () => 'SCR-PROJ-DUPLICATE');
            const sb3 = {targets: [], meta: {}};

            const result = await adapter.duplicateProject({
                projectRef: 'SCR-PROJ-ORIGINAL',
                workspaceAccessToken,
                sb3,
                title: 'Make the Cat Walk'
            });

            expect(result).toEqual({
                success: true,
                data: {
                    project_ref: 'SCR-PROJ-DUPLICATE',
                    title: 'Make the Cat Walk Copy',
                    project_type: 'independent',
                    status: KidscodeProjectStatus.DRAFT,
                    created_at: expect.any(String)
                }
            });
            const record = store.records.get('SCR-PROJ-DUPLICATE');
            expect(record.sb3).toBe(sb3);
            expect(record.status).toBe(KidscodeProjectStatus.DRAFT);
            // The original project's own record is untouched by duplicating it.
            expect(store.records.has('SCR-PROJ-ORIGINAL')).toBe(false);
        });

        test('duplicating a lesson project still produces an independent draft, not a second lesson project', async () => {
            // A student must not end up with two active lesson projects for the same assignment.
            // project_type is not caller-supplied at all — this proves it can't be overridden even
            // if a future caller mistakenly tried to pass one through.
            const store = createInMemoryStore();
            const adapter = createAdapter(store, () => 'SCR-PROJ-DUPLICATE-FROM-LESSON');

            const result = await adapter.duplicateProject({
                projectRef: 'SCR-PROJ-LESSON-ORIGINAL',
                workspaceAccessToken,
                sb3: {},
                title: 'Make the Cat Walk',
                projectType: 'lesson'
            });

            expect(result.data.project_type).toBe('independent');
            expect(result.data.status).toBe(KidscodeProjectStatus.DRAFT);
            expect(store.records.get('SCR-PROJ-DUPLICATE-FROM-LESSON').projectType).toBe('independent');
        });

        test('a duplicate failure does not create or change any record', async () => {
            const store = createInMemoryStore();
            const adapter = createAdapter(store);

            await expect(adapter.duplicateProject({
                projectRef: KidscodeDevelopmentProjectManagementFixtureProjectRef.DUPLICATE_FAILURE,
                workspaceAccessToken,
                sb3: {},
                title: 'x'
            })).rejects.toThrow();
            expect(store.records.size).toBe(0);
        });
    });

    describe('deleteDraftProject', () => {
        test('rejects without a workspace access token', async () => {
            const adapter = createAdapter();
            await expect(adapter.deleteDraftProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken: ''}))
                .rejects.toThrow('Missing workspace access token');
        });

        test('marks a draft project as deleted', async () => {
            const store = createInMemoryStore();
            store.putProject({projectRef: 'SCR-PROJ-DELETE', status: KidscodeProjectStatus.DRAFT});
            const adapter = createAdapter(store);

            const result = await adapter.deleteDraftProject({projectRef: 'SCR-PROJ-DELETE', workspaceAccessToken});

            expect(result).toEqual({success: true, data: {project_ref: 'SCR-PROJ-DELETE', deleted: true}});
            expect(store.records.get('SCR-PROJ-DELETE').deletedAt).toEqual(expect.any(String));
        });

        test('a project with no existing record is treated as an untouched draft and can be deleted', async () => {
            const store = createInMemoryStore();
            const adapter = createAdapter(store);

            const result = await adapter.deleteDraftProject({projectRef: 'SCR-PROJ-NEVER-SAVED', workspaceAccessToken});
            expect(result.data.deleted).toBe(true);
        });

        test('is blocked for a non-draft project', async () => {
            const store = createInMemoryStore();
            store.putProject({projectRef: 'SCR-PROJ-APPROVED', status: KidscodeProjectStatus.APPROVED});
            const adapter = createAdapter(store);

            await expect(adapter.deleteDraftProject({projectRef: 'SCR-PROJ-APPROVED', workspaceAccessToken}))
                .rejects.toThrow('Only draft projects can be deleted');
        });

        test('a second delete of an already-deleted project is rejected', async () => {
            const store = createInMemoryStore();
            const adapter = createAdapter(store);
            await adapter.deleteDraftProject({projectRef: 'SCR-PROJ-TWICE', workspaceAccessToken});

            await expect(adapter.deleteDraftProject({projectRef: 'SCR-PROJ-TWICE', workspaceAccessToken}))
                .rejects.toThrow('already been deleted');
        });

        test('the reserved delete-failure fixture project always rejects, leaving the project available', async () => {
            const store = createInMemoryStore();
            const adapter = createAdapter(store);
            const projectRef = KidscodeDevelopmentProjectManagementFixtureProjectRef.DELETE_FAILURE;

            await expect(adapter.deleteDraftProject({projectRef, workspaceAccessToken})).rejects.toThrow();
            expect(store.records.has(projectRef)).toBe(false);
        });
    });

    test('does not persist the workspace access token in any stored record', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter(store);
        await adapter.renameProject({projectRef: 'SCR-PROJ-TOKEN', workspaceAccessToken, title: 'x'});

        const stored = JSON.stringify(store.records.get('SCR-PROJ-TOKEN'));
        expect(stored).not.toContain(workspaceAccessToken);
    });
});
