const KidscodeWorkspaceState = Object.freeze({
    UNSAVED: 'unsaved',
    SAVING: 'saving',
    SAVED: 'saved',
    SAVE_FAILED: 'saveFailed',
    LOADING_PROJECT: 'loadingProject',
    SESSION_EXPIRED: 'sessionExpired',
    LAUNCH_CONNECTION_LOST: 'launchConnectionLost',
    ACCESS_BLOCKED: 'accessBlocked',
    CONNECTION_LOST: 'connectionLost',
    CORRUPTED_PROJECT: 'corruptedProject'
});

const KidscodeWorkspaceStates = Object.values(KidscodeWorkspaceState);

const controlledPriorityStates = [
    KidscodeWorkspaceState.SAVING,
    KidscodeWorkspaceState.SAVE_FAILED,
    KidscodeWorkspaceState.LOADING_PROJECT,
    KidscodeWorkspaceState.SESSION_EXPIRED,
    KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST,
    KidscodeWorkspaceState.ACCESS_BLOCKED,
    KidscodeWorkspaceState.CONNECTION_LOST,
    KidscodeWorkspaceState.CORRUPTED_PROJECT
];

// External transient, error, and blocking states take priority. Otherwise the
// existing Scratch state keeps local edits visible even if a host last reported
// the project as saved.
const resolveKidscodeWorkspaceState = ({workspaceState, projectChanged, isUpdating}) => {
    if (controlledPriorityStates.includes(workspaceState)) return workspaceState;
    if (isUpdating) return KidscodeWorkspaceState.SAVING;
    if (projectChanged) return KidscodeWorkspaceState.UNSAVED;
    return workspaceState;
};

export {
    KidscodeWorkspaceState,
    KidscodeWorkspaceStates,
    resolveKidscodeWorkspaceState
};
