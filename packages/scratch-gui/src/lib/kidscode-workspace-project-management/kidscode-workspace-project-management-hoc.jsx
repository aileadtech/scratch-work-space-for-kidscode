import PropTypes from 'prop-types';
import React, {useCallback} from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import {useKidscodeWorkspaceSession} from '../../contexts/kidscode-workspace-session-context.jsx';
import {setProjectTitle} from '../../reducers/project-title';
import {KidscodeWorkspaceState} from '../kidscode-workspace-state';
import {createUnavailableKidscodeWorkspaceProjectManagementAdapter}
    from './kidscode-workspace-project-management-contract';
import useKidscodeProjectManagementController from './use-kidscode-project-management-controller';

/**
 * Higher Order Component that mounts the Kidscode Project Management Controller (see
 * use-kidscode-project-management-controller.js) and wires its Rename/Duplicate/Delete actions
 * onto the props the Project menu already expects (onRenameProject, onDuplicateProject,
 * onDeleteDraft), replacing the render-gui.jsx no-ops those props previously carried.
 *
 * Mounted above KidscodeWorkspacePersistenceHOC so that once a delete succeeds it can force the
 * launch-priority kidscodeWorkspaceState to PROJECT_DELETED (reusing the existing blocking-state
 * modal) and set kidscodeProjectDeleted, which the persistence HOC checks before every manual
 * save and autosave attempt.
 * @param {React.Component} WrappedComponent - component to receive project-management behaviour
 * @returns {React.Component} WrappedComponent with Kidscode project management wired in
 */
const KidscodeWorkspaceProjectManagementHOC = WrappedComponent => {
    const KidscodeWorkspaceProjectManagementComponent = props => {
        const {
            confirmedProjectTitle,
            kidscodeWorkspaceProjectManagementAdapter,
            kidscodeWorkspaceState: launchWorkspaceState,
            onSetProjectTitle,
            vm,
            ...componentProps
        } = props;

        const session = useKidscodeWorkspaceSession();
        const adapter = kidscodeWorkspaceProjectManagementAdapter ||
            createUnavailableKidscodeWorkspaceProjectManagementAdapter();

        const handleProjectRenamed = useCallback(title => {
            onSetProjectTitle(title);
        }, [onSetProjectTitle]);

        const {renameProject, duplicateProject, deleteDraftProject, status} =
            useKidscodeProjectManagementController({
                adapter,
                session,
                projectTitle: confirmedProjectTitle,
                vm,
                onProjectRenamed: handleProjectRenamed
            });

        const effectiveWorkspaceState = status.deleted ?
            KidscodeWorkspaceState.PROJECT_DELETED :
            launchWorkspaceState;

        return (
            <WrappedComponent
                {...componentProps}
                kidscodeProjectDeleted={status.deleted}
                kidscodeProjectManagementStatus={status}
                kidscodeWorkspaceState={effectiveWorkspaceState}
                onDeleteDraft={deleteDraftProject}
                onDuplicateProject={duplicateProject}
                onRenameProject={renameProject}
            />
        );
    };

    KidscodeWorkspaceProjectManagementComponent.propTypes = {
        confirmedProjectTitle: PropTypes.string,
        kidscodeWorkspaceProjectManagementAdapter: PropTypes.shape({
            renameProject: PropTypes.func.isRequired,
            duplicateProject: PropTypes.func.isRequired,
            deleteDraftProject: PropTypes.func.isRequired
        }),
        kidscodeWorkspaceState: PropTypes.string,
        onSetProjectTitle: PropTypes.func.isRequired,
        vm: PropTypes.instanceOf(VM).isRequired
    };
    KidscodeWorkspaceProjectManagementComponent.defaultProps = {
        kidscodeWorkspaceState: null
    };

    // Named confirmedProjectTitle (not projectTitle) so it cannot collide with — and silently
    // swallow — the `projectTitle` ownProp the launch HOC threads through this component to
    // TitledHOC further down (which seeds Redux's projectTitle from the Kidscode session). This
    // component only reads the confirmed value for its own use (the duplicate title base); it
    // does not forward it, and must not intercept the one already flowing through.
    const mapStateToProps = state => ({
        confirmedProjectTitle: state.scratchGui.projectTitle,
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onSetProjectTitle: title => dispatch(setProjectTitle(title))
    });
    // Allow incoming props (kidscodeWorkspaceState and projectTitle from the launch HOC, plus
    // everything else meant for components further down the tree) to reach this component and
    // continue past it under their own names.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );

    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(KidscodeWorkspaceProjectManagementComponent);
};

export default KidscodeWorkspaceProjectManagementHOC;
