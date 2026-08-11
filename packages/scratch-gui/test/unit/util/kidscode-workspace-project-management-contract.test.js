import {
    KIDSCODE_PROJECT_TITLE_MAX_LENGTH,
    KidscodeProjectStatus,
    buildDuplicateProjectTitle,
    createUnavailableKidscodeWorkspaceProjectManagementAdapter
} from '../../../src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-contract';

describe('Kidscode workspace project-management contract', () => {
    test('the unavailable adapter rejects rename, duplicate, and delete', async () => {
        const adapter = createUnavailableKidscodeWorkspaceProjectManagementAdapter();

        await expect(adapter.renameProject({})).rejects.toThrow('not configured');
        await expect(adapter.duplicateProject({})).rejects.toThrow('not configured');
        await expect(adapter.deleteDraftProject({})).rejects.toThrow('not configured');
    });

    test('buildDuplicateProjectTitle appends the established "Copy" suffix', () => {
        expect(buildDuplicateProjectTitle('Make the Cat Walk')).toBe('Make the Cat Walk Copy');
    });

    test('exposes the four documented project statuses', () => {
        expect(KidscodeProjectStatus).toEqual({
            DRAFT: 'draft',
            SUBMITTED: 'submitted',
            CHANGES_REQUESTED: 'changes_requested',
            APPROVED: 'approved'
        });
    });

    test('exposes the title length limit already established by the rename dialog', () => {
        expect(KIDSCODE_PROJECT_TITLE_MAX_LENGTH).toBe(100);
    });
});
