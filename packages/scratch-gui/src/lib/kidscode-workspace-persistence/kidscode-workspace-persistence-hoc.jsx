import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import {useKidscodeWorkspaceSession} from '../../contexts/kidscode-workspace-session-context.jsx';
import {getIsShowingProject} from '../../reducers/project-state';
import {setProjectUnchanged} from '../../reducers/project-changed';
import {KidscodeWorkspaceState} from '../kidscode-workspace-state';
import {
    KIDSCODE_AUTOSAVE_DEBOUNCE_MS,
    KidscodeSaveReason,
    createUnavailableKidscodeWorkspacePersistenceAdapter
} from './kidscode-workspace-persistence-contract';

/**
 * Higher Order Component that drives Kidscode project content loading and save/autosave once a
 * Workspace launch session has been validated by KidscodeWorkspaceLaunchHOC.
 *
 * It owns the "content" half of kidscodeWorkspaceState (LOADING_PROJECT while the saved/starter/
 * blank project decision is being made, SAVING, SAVE_FAILED, SAVED, CORRUPTED_PROJECT). The launch
 * HOC above it still owns the "launch" half (LOADING_PROJECT while resolving the launch itself,
 * SESSION_EXPIRED, ACCESS_BLOCKED, LAUNCH_CONNECTION_LOST). Whichever is active takes priority:
 * this component only starts acting once the incoming kidscodeWorkspaceState prop is null, i.e.
 * the launch has already resolved.
 * @param {React.Component} WrappedComponent - component to receive persistence behaviour
 * @returns {React.Component} WrappedComponent with Kidscode project persistence wired in
 */
const KidscodeWorkspacePersistenceHOC = WrappedComponent => {
    const KidscodeWorkspacePersistenceComponent = props => {
        const {
            isShowingProject,
            kidscodeAutosaveDebounceMs,
            kidscodeWorkspacePersistenceAdapter,
            kidscodeWorkspaceState: launchWorkspaceState,
            onSaveProject: fallbackOnSaveProject,
            onSetProjectUnchanged,
            onWorkspaceStateAction: launchOnWorkspaceStateAction,
            vm,
            ...componentProps
        } = props;

        const session = useKidscodeWorkspaceSession();
        const adapter = kidscodeWorkspacePersistenceAdapter || createUnavailableKidscodeWorkspacePersistenceAdapter();

        const [contentState, setContentState] = useState(null);
        const latestVersionRef = useRef(null);
        const hasLoadedContentRef = useRef(false);
        const loadStartedRef = useRef(false);
        const saveInFlightRef = useRef(false);
        const pendingSaveReasonRef = useRef(null);
        const changeGenerationRef = useRef(0);
        const autoSaveTimerRef = useRef(null);

        const clearAutoSaveTimer = useCallback(() => {
            if (autoSaveTimerRef.current !== null) {
                clearTimeout(autoSaveTimerRef.current);
                autoSaveTimerRef.current = null;
            }
        }, []);

        // Saves the current project via the official VM exporter, then hands the bytes to the
        // persistence adapter. Concurrent saves are prevented (a save already in flight just
        // queues the newest reason); an edit that lands while the save is in flight is detected
        // via changeGenerationRef and keeps the Workspace at Unsaved instead of a stale Saved.
        const attemptSave = useCallback(reason => {
            if (!hasLoadedContentRef.current || !session) return;
            if (saveInFlightRef.current) {
                pendingSaveReasonRef.current = reason === KidscodeSaveReason.MANUAL ?
                    KidscodeSaveReason.MANUAL :
                    (pendingSaveReasonRef.current || reason);
                return;
            }
            clearAutoSaveTimer();
            saveInFlightRef.current = true;
            const startGeneration = changeGenerationRef.current;
            setContentState(KidscodeWorkspaceState.SAVING);

            vm.saveProjectSb3()
                // vm.saveProjectSb3() resolves with a Blob; vm.loadProject() does not accept one
                // (it only handles ArrayBuffer/string/plain object), so this converts to an
                // ArrayBuffer here, once, rather than requiring every adapter to know that.
                .then(sb3Blob => sb3Blob.arrayBuffer())
                .then(sb3 => adapter.saveProject({
                    projectRef: session.project.project_ref,
                    workspaceAccessToken: session.workspace_access_token,
                    sb3,
                    baseVersionRef: latestVersionRef.current,
                    reason
                }))
                .then(result => {
                    saveInFlightRef.current = false;
                    latestVersionRef.current = result.data.version_ref;
                    if (changeGenerationRef.current === startGeneration) {
                        onSetProjectUnchanged();
                        setContentState(KidscodeWorkspaceState.SAVED);
                    } else {
                        // A newer edit arrived while this save was in flight; it was not part of
                        // what just got persisted, so leave projectChanged alone. The resolver
                        // will show Unsaved until the queued save below covers it.
                        setContentState(null);
                    }
                    if (pendingSaveReasonRef.current) {
                        const nextReason = pendingSaveReasonRef.current;
                        pendingSaveReasonRef.current = null;
                        attemptSave(nextReason);
                    }
                })
                .catch(() => {
                    saveInFlightRef.current = false;
                    pendingSaveReasonRef.current = null;
                    setContentState(KidscodeWorkspaceState.SAVE_FAILED);
                });
        }, [adapter, clearAutoSaveTimer, onSetProjectUnchanged, session, vm]);

        const markLoaded = useCallback(versionRef => {
            latestVersionRef.current = versionRef;
            hasLoadedContentRef.current = true;
            setContentState(KidscodeWorkspaceState.SAVED);
            // Wrapped in a setTimeout because asset/skin loading in the renderer can finish
            // asynchronously, mirroring the standard VM manager's own post-load handling.
            setTimeout(() => onSetProjectUnchanged());
        }, [onSetProjectUnchanged]);

        // Loads the saved/starter/blank project exactly once, after the launch session is
        // validated and the editor's own initial (blank) project has finished loading.
        useEffect(() => {
            if (loadStartedRef.current || !session || !isShowingProject || launchWorkspaceState !== null) {
                return;
            }
            loadStartedRef.current = true;
            setContentState(KidscodeWorkspaceState.LOADING_PROJECT);

            adapter.loadProject({
                projectRef: session.project.project_ref,
                workspaceAccessToken: session.workspace_access_token,
                launchType: session.launch_type
            }).then(result => {
                if (!result.sb3) {
                    markLoaded(result.version_ref);
                    return;
                }
                return vm.loadProject(result.sb3)
                    .then(() => markLoaded(result.version_ref))
                    .catch(() => setContentState(KidscodeWorkspaceState.CORRUPTED_PROJECT));
            })
                .catch(() => setContentState(KidscodeWorkspaceState.CORRUPTED_PROJECT));
        }, [adapter, isShowingProject, launchWorkspaceState, markLoaded, session, vm]);

        // Debounced autosave: every VM project change resets the timer, so a burst of edits (e.g.
        // dragging a block) coalesces into a single save once edits pause.
        useEffect(() => {
            if (!vm) {
                return () => {};
            }
            const handleProjectChanged = () => {
                changeGenerationRef.current += 1;
                if (!hasLoadedContentRef.current) return;
                clearAutoSaveTimer();
                autoSaveTimerRef.current = setTimeout(() => {
                    autoSaveTimerRef.current = null;
                    attemptSave(KidscodeSaveReason.AUTOSAVE);
                }, kidscodeAutosaveDebounceMs);
            };
            vm.on('PROJECT_CHANGED', handleProjectChanged);
            return () => {
                vm.removeListener('PROJECT_CHANGED', handleProjectChanged);
                clearAutoSaveTimer();
            };
        }, [attemptSave, clearAutoSaveTimer, kidscodeAutosaveDebounceMs, vm]);

        const handleManualSave = useCallback(() => {
            if (!session) {
                fallbackOnSaveProject();
                return;
            }
            // Manual save takes priority over a pending autosave debounce.
            clearAutoSaveTimer();
            attemptSave(KidscodeSaveReason.MANUAL);
        }, [attemptSave, clearAutoSaveTimer, fallbackOnSaveProject, session]);

        const handleWorkspaceStateAction = useCallback(actionState => {
            if (actionState === KidscodeWorkspaceState.SAVE_FAILED) {
                attemptSave(KidscodeSaveReason.MANUAL);
                return;
            }
            if (launchOnWorkspaceStateAction) {
                launchOnWorkspaceStateAction(actionState);
            }
        }, [attemptSave, launchOnWorkspaceStateAction]);

        const effectiveWorkspaceState = launchWorkspaceState === null ? contentState : launchWorkspaceState;

        return (
            <WrappedComponent
                {...componentProps}
                kidscodeWorkspaceState={effectiveWorkspaceState}
                vm={vm}
                onSaveProject={handleManualSave}
                onWorkspaceStateAction={handleWorkspaceStateAction}
            />
        );
    };

    KidscodeWorkspacePersistenceComponent.propTypes = {
        isShowingProject: PropTypes.bool,
        kidscodeAutosaveDebounceMs: PropTypes.number,
        kidscodeWorkspacePersistenceAdapter: PropTypes.shape({
            loadProject: PropTypes.func.isRequired,
            saveProject: PropTypes.func.isRequired
        }),
        kidscodeWorkspaceState: PropTypes.string,
        onSaveProject: PropTypes.func,
        onSetProjectUnchanged: PropTypes.func.isRequired,
        onWorkspaceStateAction: PropTypes.func,
        vm: PropTypes.instanceOf(VM).isRequired
    };
    KidscodeWorkspacePersistenceComponent.defaultProps = {
        kidscodeAutosaveDebounceMs: KIDSCODE_AUTOSAVE_DEBOUNCE_MS,
        kidscodeWorkspaceState: null,
        onSaveProject: () => {}
    };

    const mapStateToProps = state => ({
        isShowingProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
        vm: state.scratchGui.vm
    });
    const mapDispatchToProps = dispatch => ({
        onSetProjectUnchanged: () => dispatch(setProjectUnchanged())
    });
    // Allow incoming props (kidscodeWorkspaceState, onWorkspaceStateAction, onSaveProject from the
    // launch HOC above) to reach this component under their own names; this component then
    // supplies its own values of those same names to WrappedComponent below it.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );

    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(KidscodeWorkspacePersistenceComponent);
};

export default KidscodeWorkspacePersistenceHOC;
