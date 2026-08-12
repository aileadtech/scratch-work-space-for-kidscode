import {useEffect} from 'react';

import {KidscodeWorkspaceState} from '../kidscode-workspace-state';

const WARN_ON_CLOSE_STATES = [
    KidscodeWorkspaceState.UNSAVED,
    KidscodeWorkspaceState.SAVING,
    KidscodeWorkspaceState.SAVE_FAILED
];

/**
 * Warns before an in-page browser close/reload while the Workspace has content that is not safely
 * persisted. Modern browsers show their own fixed warning text regardless of what this handler
 * sets, so it only ever decides whether to warn, never what the warning says.
 *
 * Only enabled for the three states that mean there is real editable content at risk: Tutor Review
 * Mode has no mutable working copy (never warns), and every blocking/read-only state (Session
 * Expired, Project Deleted, Corrupted Project, etc.) has nothing left to lose either.
 * @param {object} options - hook options
 * @param {boolean} [options.reviewMode] - true while the Workspace is in read-only Tutor Review Mode
 * @param {string} [options.workspaceState] - the fully resolved `kidscodeWorkspaceState`
 * @param {object} [options.windowObject] - override for `window`, for tests
 * @returns {void}
 */
const useKidscodeWorkspaceBeforeUnload = ({
    reviewMode = false,
    workspaceState,
    windowObject = (typeof window === 'object' ? window : null)
} = {}) => {
    useEffect(() => {
        if (!windowObject) return;
        const shouldWarn = !reviewMode && WARN_ON_CLOSE_STATES.includes(workspaceState);
        if (!shouldWarn) return;

        const handleBeforeUnload = event => {
            event.preventDefault();
            // Required for the prompt to appear in every browser that still honours a value here;
            // the actual displayed text is controlled by the browser, not this string.
            event.returnValue = '';
            return '';
        };

        windowObject.addEventListener('beforeunload', handleBeforeUnload);
        return () => windowObject.removeEventListener('beforeunload', handleBeforeUnload);
    }, [reviewMode, windowObject, workspaceState]);
};

export default useKidscodeWorkspaceBeforeUnload;
