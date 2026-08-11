import {createUnavailableKidscodeWorkspacePersistenceAdapter}
    from '../../../src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-contract';

describe('Kidscode unavailable workspace persistence adapter', () => {
    test('loadProject and saveProject both reject rather than silently succeeding', async () => {
        const adapter = createUnavailableKidscodeWorkspacePersistenceAdapter();

        await expect(adapter.loadProject({})).rejects.toThrow('not configured');
        await expect(adapter.saveProject({})).rejects.toThrow('not configured');
    });
});
