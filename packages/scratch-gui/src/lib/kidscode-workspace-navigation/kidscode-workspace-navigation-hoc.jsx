import PropTypes from 'prop-types';
import React, {useCallback} from 'react';
import {connect} from 'react-redux';

import {useKidscodeWorkspaceSession} from '../../contexts/kidscode-workspace-session-context.jsx';
import {getIsUpdating} from '../../reducers/project-state';
import {resolveKidscodeWorkspaceState} from '../kidscode-workspace-state';
import useKidscodeWorkspaceBeforeUnload from './use-kidscode-workspace-before-unload';
import useKidscodeWorkspaceNavigationController from './use-kidscode-workspace-navigation-controller';

/**
 * Higher Order Component that mounts the Kidscode Workspace Navigation Controller (Phase 7) and
 * wires its Return/recovery navigation onto the props the menu bar and blocking-state UI already
 * expect (onBackToKidscode, onReturnToLesson, onReturnToMyScratchProjects, onReturnToTutorReview),
 * replacing the render-gui.jsx no-ops those props previously carried, plus intercepting recovery
 * actions (Session Expired, Project Deleted, Corrupted Project, Review Access Blocked, Corrupted
 * Submission) dispatched through the existing onWorkspaceStateAction seam. Every other
 * onWorkspaceStateAction value (Save failed, Launch Connection Lost) passes straight through to the
 * retry behaviour already implemented above this HOC.
 *
 * Mounted innermost, wrapping GUI directly, so it receives the fully resolved kidscodeWorkspaceState
 * (launch state while one is active, otherwise Phase 4 content state) rather than reimplementing
 * that resolution itself. That raw value is never actually `unsaved` though — Persistence only ever
 * sets its own content state to saving/saved/save-failed; "Unsaved" is a display-time overlay that
 * `resolveKidscodeWorkspaceState` (the same helper menu-bar.jsx uses) applies from Redux's
 * `projectChanged` flag. Navigation/Save-and-Leave decisions need that same resolved value — a
 * pending edit must block navigation whether or not it happens to be visible on screen yet — so this
 * HOC applies the identical resolution itself rather than trusting the raw prop.
 *
 * The confirmation dialog itself is NOT rendered here: `<IntlProvider>` is created inside GUI's own
 * render tree (`containers/gui.jsx`'s `injectIntl`), so anything rendered as a sibling of
 * `<WrappedComponent>` at this level sits outside it and cannot call `useIntl()`. Instead this HOC
 * exposes the confirm state and its three handlers as props (`kidscodeNavigationConfirm`,
 * `onKidscodeNavigationSaveAndLeave`, `onKidscodeNavigationLeaveWithoutSaving`,
 * `onKidscodeNavigationStay`) for `components/gui/gui.jsx` to render, the same way it already renders
 * `KidscodeWorkspaceBlockingState`.
 * @param {React.Component} WrappedComponent - component to receive navigation/recovery behaviour
 * @returns {React.Component} WrappedComponent with Kidscode navigation/recovery wired in
 */
const KidscodeWorkspaceNavigationHOC = WrappedComponent => {
    const KidscodeWorkspaceNavigationComponent = props => {
        const {
            isUpdating,
            kidscodeReviewMode,
            kidscodeWorkspaceAllowedReturnOrigins,
            kidscodeWorkspaceNavigationTransport,
            kidscodeWorkspaceRecoveryUrl,
            kidscodeWorkspaceState,
            onSaveProject,
            onWorkspaceStateAction,
            projectChanged,
            ...componentProps
        } = props;

        const session = useKidscodeWorkspaceSession();
        const resolvedWorkspaceState = resolveKidscodeWorkspaceState({
            isUpdating,
            projectChanged,
            workspaceState: kidscodeWorkspaceState
        });

        const nav = useKidscodeWorkspaceNavigationController({
            allowedOrigins: kidscodeWorkspaceAllowedReturnOrigins,
            onSaveProject,
            recoveryUrl: kidscodeWorkspaceRecoveryUrl,
            session,
            transport: kidscodeWorkspaceNavigationTransport,
            workspaceState: resolvedWorkspaceState
        });

        useKidscodeWorkspaceBeforeUnload({
            reviewMode: kidscodeReviewMode,
            workspaceState: resolvedWorkspaceState
        });

        const handleWorkspaceStateAction = useCallback(actionState => {
            if (nav.handleRecoveryAction(actionState)) return;
            if (onWorkspaceStateAction) onWorkspaceStateAction(actionState);
        }, [nav, onWorkspaceStateAction]);

        return (
            <WrappedComponent
                {...componentProps}
                kidscodeNavigationConfirm={nav.confirm}
                kidscodeReviewMode={kidscodeReviewMode}
                kidscodeWorkspaceState={kidscodeWorkspaceState}
                onBackToKidscode={nav.handleReturnToKidscode}
                onKidscodeNavigationLeaveWithoutSaving={nav.handleLeaveWithoutSaving}
                onKidscodeNavigationSaveAndLeave={nav.handleSaveAndLeave}
                onKidscodeNavigationStay={nav.handleStay}
                onReturnToLesson={nav.handleReturnToKidscode}
                onReturnToMyScratchProjects={nav.handleReturnToKidscode}
                onReturnToTutorReview={nav.handleReturnToKidscode}
                onSaveProject={onSaveProject}
                onWorkspaceStateAction={handleWorkspaceStateAction}
            />
        );
    };

    KidscodeWorkspaceNavigationComponent.propTypes = {
        isUpdating: PropTypes.bool,
        kidscodeReviewMode: PropTypes.bool,
        kidscodeWorkspaceAllowedReturnOrigins: PropTypes.arrayOf(PropTypes.string),
        kidscodeWorkspaceNavigationTransport: PropTypes.shape({
            navigate: PropTypes.func.isRequired
        }),
        kidscodeWorkspaceRecoveryUrl: PropTypes.string,
        kidscodeWorkspaceState: PropTypes.string,
        onSaveProject: PropTypes.func,
        onWorkspaceStateAction: PropTypes.func,
        projectChanged: PropTypes.bool
    };
    KidscodeWorkspaceNavigationComponent.defaultProps = {
        isUpdating: false,
        kidscodeReviewMode: false,
        kidscodeWorkspaceAllowedReturnOrigins: [],
        kidscodeWorkspaceRecoveryUrl: null,
        kidscodeWorkspaceState: null,
        onSaveProject: () => {},
        projectChanged: false
    };

    // Reads the same Redux fields menu-bar.jsx reads (state.scratchGui.projectChanged and the
    // updating flag derived from loadingState) so this HOC can resolve the identical effective
    // workspace state, without owning or duplicating that state itself.
    const mapStateToProps = state => ({
        isUpdating: getIsUpdating(state.scratchGui.projectState.loadingState),
        projectChanged: state.scratchGui.projectChanged
    });
    // Allow incoming props (kidscodeWorkspaceState, onWorkspaceStateAction, onSaveProject, etc. from
    // the persistence HOC above) to reach this component and continue past it under their own names.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );

    return connect(mapStateToProps, null, mergeProps)(KidscodeWorkspaceNavigationComponent);
};

export default KidscodeWorkspaceNavigationHOC;
