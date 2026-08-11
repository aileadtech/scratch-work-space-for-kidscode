/**
 * Shared contract between the Workspace and the submission/review backend boundary.
 * Development uses an IndexedDB-backed adapter; production receives the rejecting adapter below
 * until Laravel implements the same four operations.
 */

const KidscodeReviewAction = Object.freeze({
    APPROVED: 'approved',
    CHANGES_REQUESTED: 'changes_requested'
});

const submissionReviewUnavailableError = () =>
    new Error('The Workspace submission/review adapter is not configured.');

const createUnavailableKidscodeWorkspaceSubmissionReviewAdapter = () => ({
    submitProject: () => Promise.reject(submissionReviewUnavailableError()),
    loadSubmission: () => Promise.reject(submissionReviewUnavailableError()),
    approveSubmission: () => Promise.reject(submissionReviewUnavailableError()),
    requestChanges: () => Promise.reject(submissionReviewUnavailableError())
});

export {
    KidscodeReviewAction,
    createUnavailableKidscodeWorkspaceSubmissionReviewAdapter
};
