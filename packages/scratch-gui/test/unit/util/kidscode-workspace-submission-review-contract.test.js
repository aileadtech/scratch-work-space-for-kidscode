import {
    KidscodeReviewAction,
    createUnavailableKidscodeWorkspaceSubmissionReviewAdapter
} from '../../../src/lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-contract';

describe('Kidscode Workspace submission/review contract', () => {
    test('declares the review actions used by the controller and adapters', () => {
        expect(KidscodeReviewAction).toEqual({
            APPROVED: 'approved',
            CHANGES_REQUESTED: 'changes_requested'
        });
    });

    test('the unavailable adapter fails closed for every operation', async () => {
        const adapter = createUnavailableKidscodeWorkspaceSubmissionReviewAdapter();

        await expect(adapter.submitProject({})).rejects.toThrow('not configured');
        await expect(adapter.loadSubmission({})).rejects.toThrow('not configured');
        await expect(adapter.approveSubmission({})).rejects.toThrow('not configured');
        await expect(adapter.requestChanges({})).rejects.toThrow('not configured');
    });
});
