import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import {useKidscodeWorkspaceSession} from '../../contexts/kidscode-workspace-session-context.jsx';
import {getIsShowingProject} from '../../reducers/project-state';
import {isKidscodeReadOnlyReviewSession, isKidscodeRealTutorReviewSession}
    from '../kidscode-workspace-launch';
import {KidscodeProjectStatus}
    from '../kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {KidscodeWorkspaceState} from '../kidscode-workspace-state';
import {applyKidscodeVmReadOnlyGuard} from '../kidscode-workspace-vm-read-only-guard';
import {createUnavailableKidscodeWorkspaceSubmissionReviewAdapter}
    from './kidscode-workspace-submission-review-contract';

const initialActionStatus = {
    isSubmitting: false,
    submissionFailed: false,
    isLoadingReview: false,
    isApproving: false,
    isRequestingChanges: false,
    reviewActionFailed: false
};

// Local alias: both the real tutor review shape and the pre-existing development-fixture/
// aspirational shape (`workspace_access_token`, `review: {submission_ref, ...}`) are review
// sessions (isKidscodeReadOnlyReviewSession is true for either), but they carry the review
// credential and submission identity under different fields, so call sites that need those fields
// branch on this.
const isRealTutorReviewSession = isKidscodeRealTutorReviewSession;

const projectStatusForSession = session => (session.project && session.project.status) ||
    (session.submission && session.submission.status) ||
    null;

const KidscodeWorkspaceSubmissionReviewHOC = WrappedComponent => {
    const KidscodeWorkspaceSubmissionReviewComponent = props => {
        const {
            isShowingProject,
            kidscodeLatestVersionRef,
            kidscodeWorkspaceState: launchWorkspaceState,
            kidscodeWorkspaceSubmissionReviewAdapter,
            vm,
            ...componentProps
        } = props;
        const session = useKidscodeWorkspaceSession();
        const adapter = kidscodeWorkspaceSubmissionReviewAdapter ||
            createUnavailableKidscodeWorkspaceSubmissionReviewAdapter();
        const reviewMode = isKidscodeReadOnlyReviewSession(session);
        const [projectStatus, setProjectStatus] = useState(null);
        const [latestWorkingVersionRef, setLatestWorkingVersionRef] = useState(kidscodeLatestVersionRef || null);
        const [reviewFeedback, setReviewFeedback] = useState(null);
        const [actionStatus, setActionStatus] = useState(initialActionStatus);
        const [reviewLoadState, setReviewLoadState] = useState(null);
        const submitInFlightRef = useRef(false);
        const reviewActionInFlightRef = useRef(false);
        const reviewLoadStartedRef = useRef(false);
        const activeSessionRef = useRef(null);

        useEffect(() => {
            const sessionRef = session && session.session_ref;
            if (activeSessionRef.current === sessionRef) return;
            activeSessionRef.current = sessionRef;
            reviewLoadStartedRef.current = false;
            setProjectStatus(session ? projectStatusForSession(session) : null);
            setLatestWorkingVersionRef(kidscodeLatestVersionRef || null);
            setReviewFeedback(session && session.review_feedback ? session.review_feedback.feedback : null);
            setActionStatus(initialActionStatus);
            setReviewLoadState(null);
        }, [kidscodeLatestVersionRef, session]);

        const submitProject = useCallback(() => {
            if (!session || reviewMode) return Promise.reject(new Error('No student project is available to submit.'));
            if (submitInFlightRef.current) return Promise.reject(new Error('A submission is already in progress.'));
            if (![KidscodeProjectStatus.DRAFT, KidscodeProjectStatus.CHANGES_REQUESTED].includes(projectStatus)) {
                return Promise.reject(new Error('This project cannot be submitted in its current status.'));
            }
            submitInFlightRef.current = true;
            setActionStatus(previous => Object.assign({}, previous, {
                isSubmitting: true,
                submissionFailed: false
            }));
            return vm.saveProjectSb3()
                .then(sb3Blob => sb3Blob.arrayBuffer())
                .then(sb3 => adapter.submitProject({
                    projectRef: session.project.project_ref,
                    workspaceAccessToken: session.workspace_access_token,
                    sb3,
                    baseVersionRef: latestWorkingVersionRef
                }))
                .then(result => {
                    submitInFlightRef.current = false;
                    setProjectStatus(result.data.status);
                    setLatestWorkingVersionRef(result.data.working_version_ref);
                    setActionStatus(previous => Object.assign({}, previous, {
                        isSubmitting: false,
                        submissionFailed: false,
                        submissionRef: result.data.submission_ref,
                        submittedVersionRef: result.data.submitted_version_ref,
                        submittedAt: result.data.submitted_at
                    }));
                    return result.data;
                })
                .catch(error => {
                    submitInFlightRef.current = false;
                    setActionStatus(previous => Object.assign({}, previous, {
                        isSubmitting: false,
                        submissionFailed: true
                    }));
                    throw error;
                });
        }, [adapter, latestWorkingVersionRef, projectStatus, reviewMode, session, vm]);

        useEffect(() => {
            if (!reviewMode || !session || !isShowingProject || launchWorkspaceState !== null ||
                reviewLoadStartedRef.current) return;
            reviewLoadStartedRef.current = true;
            setReviewLoadState(KidscodeWorkspaceState.LOADING_PROJECT);
            setActionStatus(previous => Object.assign({}, previous, {isLoadingReview: true}));

            const realTutorSession = isRealTutorReviewSession(session);
            adapter.loadSubmission(realTutorSession ? {
                submissionRef: session.submission_ref,
                workspaceAccessToken: session.review_access_token
            } : {
                submissionRef: session.review.submission_ref,
                workspaceAccessToken: session.workspace_access_token
            }).then(result => {
                if (realTutorSession) {
                    // The real GET .../submissions/{submission_ref}/file response carries no
                    // project_ref at all — the review session is scoped by submission_ref, not a
                    // mutable project_ref (kidscode-production-submission-review-adapter.js).
                    // version_ref is also checked against the launch response's own
                    // submission.version_ref, since that context is already trustworthy, even though
                    // the backend does not strictly require this second check.
                    if (result.submission_ref !== session.submission_ref ||
                        (session.submission.version_ref && result.submitted_version_ref &&
                            result.submitted_version_ref !== session.submission.version_ref)) {
                        throw new Error('The loaded submission does not match the authorised review context.');
                    }
                } else if (result.project_ref !== session.project.project_ref ||
                    result.submission_ref !== session.review.submission_ref ||
                    result.submitted_version_ref !== session.review.submitted_version_ref) {
                    throw new Error('The loaded submission does not match the authorised review context.');
                }
                return vm.loadProject(result.sb3).then(() => {
                    // The real file-load response has no status/feedback of its own (unlike the
                    // development adapter's response) — status was already set from the launch
                    // response's session.submission.status by the session-change effect above, and
                    // there is no feedback field anywhere in the real tutor review contract.
                    if (!realTutorSession) {
                        setProjectStatus(result.status);
                        setReviewFeedback(result.feedback || null);
                    }
                    setReviewLoadState(null);
                    setActionStatus(previous => Object.assign({}, previous, {isLoadingReview: false}));
                })
                    .catch(() => {
                        setReviewLoadState(KidscodeWorkspaceState.CORRUPTED_SUBMISSION);
                        setActionStatus(previous => Object.assign({}, previous, {isLoadingReview: false}));
                    });
            })
                .catch(() => {
                    setReviewLoadState(KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED);
                    setActionStatus(previous => Object.assign({}, previous, {isLoadingReview: false}));
                });
        }, [adapter, isShowingProject, launchWorkspaceState, reviewMode, session, vm]);

        const reviewSubmission = useCallback((action, feedback) => {
            if (!session || !reviewMode) {
                return Promise.reject(new Error('No authorised submission is available to review.'));
            }
            if (isRealTutorReviewSession(session)) {
                // Approve/Request Changes stay exclusively on the tutor's Sanctum-authenticated
                // Kidscode frontend routes; the Workspace has no credential that could ever call
                // them for a real review session (kidscode-production-submission-review-adapter.js
                // always rejects both). Rejecting here first avoids dereferencing session.review,
                // which a real tutor session never has.
                return Promise.reject(new Error(
                    'Approve and Request Changes are not available from the Workspace.'
                ));
            }
            if (!session.review) {
                return Promise.reject(new Error('No authorised submission is available to review.'));
            }
            if (reviewActionInFlightRef.current) {
                return Promise.reject(new Error('A review action is already in progress.'));
            }
            reviewActionInFlightRef.current = true;
            const isApprove = action === KidscodeProjectStatus.APPROVED;
            setActionStatus(previous => Object.assign({}, previous, {
                isApproving: isApprove,
                isRequestingChanges: !isApprove,
                reviewActionFailed: false
            }));
            const request = {
                submissionRef: session.review.submission_ref,
                submittedVersionRef: session.review.submitted_version_ref,
                workspaceAccessToken: session.workspace_access_token
            };
            if (!isApprove) request.feedback = feedback;
            const operation = isApprove ? adapter.approveSubmission : adapter.requestChanges;
            return operation(request).then(result => {
                reviewActionInFlightRef.current = false;
                setProjectStatus(result.data.status);
                if (result.data.feedback) setReviewFeedback(result.data.feedback);
                setActionStatus(previous => Object.assign({}, previous, {
                    isApproving: false,
                    isRequestingChanges: false,
                    reviewActionFailed: false
                }));
                return result.data;
            })
                .catch(error => {
                    reviewActionInFlightRef.current = false;
                    setActionStatus(previous => Object.assign({}, previous, {
                        isApproving: false,
                        isRequestingChanges: false,
                        reviewActionFailed: true
                    }));
                    throw error;
                });
        }, [adapter, reviewMode, session]);

        const approveSubmission = useCallback(() =>
            reviewSubmission(KidscodeProjectStatus.APPROVED), [reviewSubmission]);
        const requestChanges = useCallback(feedback =>
            reviewSubmission(KidscodeProjectStatus.CHANGES_REQUESTED, feedback), [reviewSubmission]);

        const effectiveProjectStatus = projectStatus || (session && projectStatusForSession(session)) || null;
        const projectReadOnly = reviewMode || [
            KidscodeProjectStatus.SUBMITTED,
            KidscodeProjectStatus.APPROVED
        ].includes(effectiveProjectStatus) || actionStatus.isSubmitting;
        const effectiveWorkspaceState = launchWorkspaceState === null ? reviewLoadState : launchWorkspaceState;

        // Genuinely blocks every non-Blockly project-content mutation path (sprite/costume/sound/
        // backdrop add/delete/edit, sprite properties, Stage dragging — see
        // kidscode-workspace-vm-read-only-guard.js) whenever the project is read-only, and lifts it
        // again the moment it isn't — covering both "launched already read-only" and a live
        // Submit/Approve transition mid-session, the same guarantee Blockly's own
        // workspace.setIsReadOnly() wiring already provides for blocks/scripts.
        useEffect(() => {
            applyKidscodeVmReadOnlyGuard(vm, projectReadOnly);
        }, [vm, projectReadOnly]);

        return (
            <WrappedComponent
                {...componentProps}
                // The vanilla File menu's "New"/"Load from your computer" both call vm.loadProject
                // to wholesale-replace the open project, a path the VM guard above deliberately
                // never touches (it would also block the Workspace's own legitimate project loads).
                // Closing the menu entries themselves via the same existing canManageFiles capability
                // flag (see components/menu-bar/menu-bar.jsx) is the only way to close that gap.
                canManageFiles={!projectReadOnly}
                kidscodeProjectReadOnly={projectReadOnly}
                kidscodeProjectStatus={effectiveProjectStatus}
                kidscodeReviewFeedback={reviewFeedback}
                kidscodeReviewMode={reviewMode}
                kidscodeSubmissionReviewStatus={actionStatus}
                kidscodeWorkspaceState={effectiveWorkspaceState}
                vm={vm}
                onKidscodeVersionChanged={setLatestWorkingVersionRef}
                onApproveSubmission={approveSubmission}
                onRequestChanges={requestChanges}
                onSubmitProject={submitProject}
            />
        );
    };

    KidscodeWorkspaceSubmissionReviewComponent.propTypes = {
        isShowingProject: PropTypes.bool,
        kidscodeLatestVersionRef: PropTypes.string,
        kidscodeWorkspaceState: PropTypes.string,
        kidscodeWorkspaceSubmissionReviewAdapter: PropTypes.shape({
            submitProject: PropTypes.func.isRequired,
            loadSubmission: PropTypes.func.isRequired,
            approveSubmission: PropTypes.func.isRequired,
            requestChanges: PropTypes.func.isRequired
        }),
        vm: PropTypes.instanceOf(VM).isRequired
    };
    KidscodeWorkspaceSubmissionReviewComponent.defaultProps = {
        kidscodeWorkspaceState: null
    };

    const mapStateToProps = state => ({
        isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
        vm: state.scratchGui.vm
    });
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign({}, stateProps, ownProps);

    return connect(mapStateToProps, null, mergeProps)(KidscodeWorkspaceSubmissionReviewComponent);
};

export default KidscodeWorkspaceSubmissionReviewHOC;
