import {
    KidscodeDevelopmentSubmissionFixtureProjectRef,
    KidscodeDevelopmentSubmissionFixtureSubmissionRef
} from '../kidscode-workspace-launch';
import {KidscodeProjectStatus}
    from '../kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {createIndexedDbProjectStore}
    from '../kidscode-workspace-persistence/kidscode-development-project-store';
import {buildKidscodeWorkspaceStarterProject}
    from '../kidscode-workspace-persistence/kidscode-workspace-starter-project';

const requireWorkspaceAccessToken = workspaceAccessToken => {
    if (!workspaceAccessToken) throw new Error('Missing workspace access token.');
};

const copySb3 = sb3 => (sb3 instanceof ArrayBuffer ? sb3.slice(0) : sb3);
const submissionRefFor = (projectRef, number) => `SCR-DEV-SUB-${projectRef}-${number}`;
const submittedVersionRefFor = (projectRef, number) => `SCR-DEV-SUB-VER-${projectRef}-${number}`;
const workingVersionRefFor = versionNumber => `SCR-DEV-VER-${versionNumber}`;

const fixtureSubmission = submissionRef => {
    const fixtureVersionRef = 'SCR-SUB-VER-DEV-REVIEW-FIXTURE';
    if ([
        KidscodeDevelopmentSubmissionFixtureSubmissionRef.SUBMITTED,
        KidscodeDevelopmentSubmissionFixtureSubmissionRef.APPROVE_FAILURE,
        KidscodeDevelopmentSubmissionFixtureSubmissionRef.REQUEST_CHANGES_FAILURE
    ].includes(submissionRef)) {
        return {
            projectRef: 'SCR-PROJ-DEVREVIEW',
            submissionRef,
            submittedVersionRef: fixtureVersionRef,
            submittedAt: '2026-08-11T12:00:00Z',
            status: KidscodeProjectStatus.SUBMITTED,
            feedback: null,
            sb3: buildKidscodeWorkspaceStarterProject()
        };
    }
    if (submissionRef === KidscodeDevelopmentSubmissionFixtureSubmissionRef.CORRUPTED_FILE) {
        return {
            projectRef: 'SCR-PROJ-DEVCORRUPTREVIEW',
            submissionRef,
            submittedVersionRef: fixtureVersionRef,
            submittedAt: '2026-08-11T12:00:00Z',
            status: KidscodeProjectStatus.SUBMITTED,
            feedback: null,
            sb3: new Uint8Array([1, 2, 3]).buffer
        };
    }
    return null;
};

const requireReviewableSubmission = ({submission, submittedVersionRef, project}) => {
    if (!submission) throw new Error('The submitted project file is unavailable.');
    if (submission.submittedVersionRef !== submittedVersionRef) {
        throw new Error('The reviewed submitted version does not match this submission.');
    }
    if (!project || project.latestSubmissionRef !== submission.submissionRef) {
        throw new Error('Only the latest submitted version can be reviewed.');
    }
    if (submission.status !== KidscodeProjectStatus.SUBMITTED) {
        throw new Error('This submission has already been reviewed.');
    }
};

const createKidscodeDevelopmentSubmissionReviewAdapter = ({
    environment = process.env.NODE_ENV,
    store = createIndexedDbProjectStore(),
    now = () => new Date().toISOString()
} = {}) => {
    if (environment === 'production') {
        throw new Error('The development workspace submission/review adapter cannot run in production.');
    }

    const submitProject = ({projectRef, workspaceAccessToken, sb3, baseVersionRef}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);
            if (projectRef === KidscodeDevelopmentSubmissionFixtureProjectRef.SUBMIT_FAILURE) {
                throw new Error('The development submission-failure fixture always rejects submissions.');
            }
            return store.getProject(projectRef).then(existing => {
                if (existing && existing.deletedAt) throw new Error('A deleted project cannot be submitted.');
                const status = (existing && existing.status) || KidscodeProjectStatus.DRAFT;
                if (![KidscodeProjectStatus.DRAFT, KidscodeProjectStatus.CHANGES_REQUESTED].includes(status)) {
                    throw new Error('Only draft or changes-requested projects can be submitted.');
                }
                if (existing && existing.versionRef && baseVersionRef !== existing.versionRef) {
                    throw new Error('The base project version does not match the latest working version.');
                }

                const submissionNumber = ((existing && existing.submissionNumber) || 0) + 1;
                const workingVersionNumber = ((existing && existing.versionNumber) || 0) + 1;
                const submissionRef = submissionRefFor(projectRef, submissionNumber);
                const submittedVersionRef = submittedVersionRefFor(projectRef, submissionNumber);
                const workingVersionRef = workingVersionRefFor(workingVersionNumber);
                const submittedAt = now();
                const submission = {
                    submissionRef,
                    projectRef,
                    submittedVersionRef,
                    submittedAt,
                    submissionNumber,
                    status: KidscodeProjectStatus.SUBMITTED,
                    sb3: copySb3(sb3),
                    feedback: null,
                    reviewedAt: null,
                    reviewHistory: []
                };

                return store.commitSubmission({
                    projectRef,
                    baseVersionRef,
                    allowedStatuses: [KidscodeProjectStatus.DRAFT, KidscodeProjectStatus.CHANGES_REQUESTED],
                    submission,
                    projectRecord: {
                        projectRef,
                        versionRef: workingVersionRef,
                        versionNumber: workingVersionNumber,
                        savedAt: submittedAt,
                        sb3: copySb3(sb3),
                        lastSaveReason: 'submission',
                        status: KidscodeProjectStatus.SUBMITTED,
                        latestSubmissionRef: submissionRef,
                        submissionNumber,
                        submittedAt,
                        updatedAt: submittedAt
                    }
                })
                    .then(() => ({
                        success: true,
                        data: {
                            project_ref: projectRef,
                            submission_ref: submissionRef,
                            submitted_version_ref: submittedVersionRef,
                            working_version_ref: workingVersionRef,
                            submitted_at: submittedAt,
                            status: KidscodeProjectStatus.SUBMITTED
                        }
                    }));
            });
        });

    const loadSubmission = ({submissionRef, workspaceAccessToken}) => Promise.resolve()
        .then(() => {
            requireWorkspaceAccessToken(workspaceAccessToken);
            if ([
                KidscodeDevelopmentSubmissionFixtureSubmissionRef.FILE_UNAVAILABLE,
                KidscodeDevelopmentSubmissionFixtureSubmissionRef.ACCESS_DENIED
            ].includes(submissionRef)) {
                throw new Error('The submitted project file is unavailable or access was denied.');
            }
            return store.getSubmission(submissionRef).then(storedSubmission => {
                const submission = storedSubmission || fixtureSubmission(submissionRef);
                if (!submission) throw new Error('The submitted project file is unavailable.');
                return {
                    project_ref: submission.projectRef,
                    submission_ref: submission.submissionRef,
                    submitted_version_ref: submission.submittedVersionRef,
                    submitted_at: submission.submittedAt,
                    status: submission.status,
                    feedback: submission.feedback,
                    sb3: copySb3(submission.sb3)
                };
            });
        });

    const reviewSubmission = ({
        submissionRef,
        submittedVersionRef,
        workspaceAccessToken,
        action,
        feedback
    }) => Promise.resolve().then(() => {
        requireWorkspaceAccessToken(workspaceAccessToken);
        if (action === KidscodeProjectStatus.APPROVED &&
            submissionRef === KidscodeDevelopmentSubmissionFixtureSubmissionRef.APPROVE_FAILURE) {
            throw new Error('The development approve-failure fixture always rejects approval.');
        }
        if (action === KidscodeProjectStatus.CHANGES_REQUESTED &&
            submissionRef === KidscodeDevelopmentSubmissionFixtureSubmissionRef.REQUEST_CHANGES_FAILURE) {
            throw new Error('The development request-changes-failure fixture always rejects feedback.');
        }
        const trimmedFeedback = action === KidscodeProjectStatus.CHANGES_REQUESTED ? (feedback || '').trim() : null;
        if (action === KidscodeProjectStatus.CHANGES_REQUESTED && !trimmedFeedback) {
            throw new Error('Feedback is required when requesting changes.');
        }

        return store.getSubmission(submissionRef).then(submission =>
            store.getProject(submission && submission.projectRef).then(project => {
                requireReviewableSubmission({submission, submittedVersionRef, project});
                const reviewedAt = now();
                const historyEntry = {
                    action,
                    feedback: trimmedFeedback,
                    reviewedAt
                };
                const reviewHistory = (submission.reviewHistory || []).concat(historyEntry);
                const reviewFeedback = trimmedFeedback ? {
                    submission_ref: submissionRef,
                    submitted_version_ref: submittedVersionRef,
                    feedback: trimmedFeedback,
                    reviewed_at: reviewedAt
                } : null;
                return store.updateSubmissionReview(submissionRef, {
                    status: action,
                    feedback: trimmedFeedback,
                    reviewedAt,
                    reviewHistory
                }).then(() => store.putProject({
                    projectRef: submission.projectRef,
                    status: action,
                    reviewFeedback,
                    updatedAt: reviewedAt
                }))
                    .then(() => ({
                        success: true,
                        data: {
                            project_ref: submission.projectRef,
                            submission_ref: submissionRef,
                            submitted_version_ref: submittedVersionRef,
                            status: action,
                            feedback: trimmedFeedback,
                            reviewed_at: reviewedAt
                        }
                    }));
            })
        );
    });

    return {
        submitProject,
        loadSubmission,
        approveSubmission: args => reviewSubmission(Object.assign({}, args, {
            action: KidscodeProjectStatus.APPROVED
        })),
        requestChanges: args => reviewSubmission(Object.assign({}, args, {
            action: KidscodeProjectStatus.CHANGES_REQUESTED
        }))
    };
};

export {
    createKidscodeDevelopmentSubmissionReviewAdapter
};
