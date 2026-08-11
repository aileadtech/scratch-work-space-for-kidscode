import {
    KidscodeDevelopmentPersistenceFixtureProjectRef,
    KidscodeLaunchType
} from '../../../src/lib/kidscode-workspace-launch';
import {
    KidscodeProjectSource,
    KidscodeSaveReason
} from '../../../src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract';
import {createKidscodeDevelopmentPersistenceAdapter}
    from '../../../src/lib/kidscode-workspace-persistence/kidscode-development-persistence-adapter';

// An in-memory stand-in for the IndexedDB-backed store, since jsdom does not implement
// IndexedDB. The real store (kidscode-development-project-store.js) is a thin wrapper with the
// same {getProject, putProject} shape and is exercised by the adapter tests below through this
// fake rather than duplicating IndexedDB plumbing in tests.
const createInMemoryStore = () => {
    const records = new Map();
    return {
        getProject: projectRef => Promise.resolve(records.get(projectRef)),
        putProject: record => {
            records.set(record.projectRef, record);
            return Promise.resolve();
        },
        records
    };
};

const createAdapter = store =>
    createKidscodeDevelopmentPersistenceAdapter({environment: 'test', store: store || createInMemoryStore()});

describe('Kidscode development persistence adapter', () => {
    const workspaceAccessToken = 'DEVELOPMENT_WORKSPACE_TOKEN_TEST';

    test('cannot be created in production', () => {
        expect(() => createKidscodeDevelopmentPersistenceAdapter({environment: 'production'}))
            .toThrow('cannot run in production');
    });

    test('loadProject rejects without a workspace access token', async () => {
        const adapter = createAdapter();
        await expect(adapter.loadProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken: ''}))
            .rejects.toThrow('Missing workspace access token');
    });

    test('saveProject rejects without a workspace access token', async () => {
        const adapter = createAdapter();
        await expect(adapter.saveProject({projectRef: 'SCR-PROJ-X', workspaceAccessToken: null, sb3: {}}))
            .rejects.toThrow('Missing workspace access token');
    });

    test('loading a project with no saved record and a non-lesson launch returns blank', async () => {
        const adapter = createAdapter();
        const result = await adapter.loadProject({
            projectRef: 'SCR-PROJ-NEW',
            workspaceAccessToken,
            launchType: KidscodeLaunchType.NEW_INDEPENDENT
        });

        expect(result.source).toBe(KidscodeProjectSource.BLANK);
        expect(result.sb3).toBeNull();
        expect(result.version_ref).toBeNull();
    });

    test('loading a project with no saved record and a new_lesson launch returns the starter project', async () => {
        const adapter = createAdapter();
        const result = await adapter.loadProject({
            projectRef: 'SCR-PROJ-NEW-LESSON',
            workspaceAccessToken,
            launchType: KidscodeLaunchType.NEW_LESSON
        });

        expect(result.source).toBe(KidscodeProjectSource.STARTER);
        expect(result.sb3).toBeTruthy();
        expect(result.sb3.targets).toBeDefined();
    });

    test('loading the reserved corrupted-project fixture returns unparsable bytes', async () => {
        const adapter = createAdapter();
        const result = await adapter.loadProject({
            projectRef: KidscodeDevelopmentPersistenceFixtureProjectRef.CORRUPTED_PROJECT,
            workspaceAccessToken,
            launchType: KidscodeLaunchType.EXISTING_INDEPENDENT
        });

        expect(result.source).toBe(KidscodeProjectSource.SAVED);
        expect(result.sb3).toBeInstanceOf(ArrayBuffer);
    });

    test('saveProject persists a record that a later loadProject returns as saved', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter(store);
        const projectRef = 'SCR-PROJ-ROUNDTRIP';
        const sb3 = {targets: [], meta: {}};

        const saveResult = await adapter.saveProject({
            projectRef,
            workspaceAccessToken,
            sb3,
            baseVersionRef: null,
            reason: KidscodeSaveReason.MANUAL
        });

        expect(saveResult.success).toBe(true);
        expect(saveResult.data.project_ref).toBe(projectRef);
        expect(saveResult.data.version_ref).toBe('SCR-DEV-VER-1');
        expect(saveResult.data.status).toBe('draft');

        const loadResult = await adapter.loadProject({
            projectRef,
            workspaceAccessToken,
            launchType: KidscodeLaunchType.EXISTING_INDEPENDENT
        });
        expect(loadResult.source).toBe(KidscodeProjectSource.SAVED);
        expect(loadResult.version_ref).toBe('SCR-DEV-VER-1');
        expect(loadResult.sb3).toBe(sb3);
    });

    test('version_ref increments monotonically across repeated saves', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter(store);
        const projectRef = 'SCR-PROJ-VERSIONS';
        const saveOnce = baseVersionRef => adapter.saveProject({
            projectRef,
            workspaceAccessToken,
            sb3: {},
            baseVersionRef,
            reason: KidscodeSaveReason.MANUAL
        });

        const first = await saveOnce(null);
        const second = await saveOnce(first.data.version_ref);
        const third = await saveOnce(second.data.version_ref);

        expect([first.data.version_ref, second.data.version_ref, third.data.version_ref]).toEqual([
            'SCR-DEV-VER-1', 'SCR-DEV-VER-2', 'SCR-DEV-VER-3'
        ]);
    });

    test('the reserved save-failure fixture project always rejects saves', async () => {
        const adapter = createAdapter();
        await expect(adapter.saveProject({
            projectRef: KidscodeDevelopmentPersistenceFixtureProjectRef.SAVE_FAILURE,
            workspaceAccessToken,
            sb3: {},
            baseVersionRef: null,
            reason: KidscodeSaveReason.MANUAL
        })).rejects.toThrow();
    });

    test('does not persist the workspace access token in the stored record', async () => {
        const store = createInMemoryStore();
        const adapter = createAdapter(store);
        await adapter.saveProject({
            projectRef: 'SCR-PROJ-NO-TOKEN',
            workspaceAccessToken,
            sb3: {},
            baseVersionRef: null,
            reason: KidscodeSaveReason.MANUAL
        });

        const stored = JSON.stringify(store.records.get('SCR-PROJ-NO-TOKEN'));
        expect(stored).not.toContain(workspaceAccessToken);
    });
});
