import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import {useKidscodeWorkspaceSession} from '../../contexts/kidscode-workspace-session-context.jsx';
import {getIsShowingProject} from '../../reducers/project-state';
import {KidscodeLaunchType} from '../kidscode-workspace-launch';
import {KidscodeProjectStatus}
    from '../kidscode-workspace-project-management/kidscode-workspace-project-management-contract';
import {KidscodeWorkspaceState} from '../kidscode-workspace-state';
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
        const reviewMode = Boolean(session && session.launch_type === KidscodeLaunchType.REVIEW);
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
            setProjectStatus(session ? session.project.status : null);
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

            adapter.loadSubmission({
                submissionRef: session.review.submission_ref,
                workspaceAccessToken: session.workspace_access_token
            }).then(result => {
                if (result.project_ref !== session.project.project_ref ||
                    result.submission_ref !== session.review.submission_ref ||
                    result.submitted_version_ref !== session.review.submitted_version_ref) {
                    throw new Error('The loaded submission does not match the authorised review context.');
                }
                return vm.loadProject(result.sb3).then(() => {
                    setProjectStatus(result.status);
                    setReviewFeedback(result.feedback || null);
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
            if (!session || !reviewMode || !session.review) {
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

        const effectiveProjectStatus = projectStatus || (session && session.project.status) || null;
        const projectReadOnly = reviewMode || [
            KidscodeProjectStatus.SUBMITTED,
            KidscodeProjectStatus.APPROVED
        ].includes(effectiveProjectStatus) || actionStatus.isSubmitting;
        const effectiveWorkspaceState = launchWorkspaceState === null ? reviewLoadState : launchWorkspaceState;

        return (
            <WrappedComponent
                {...componentProps}
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
