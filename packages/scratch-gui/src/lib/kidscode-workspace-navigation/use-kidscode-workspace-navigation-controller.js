import {useCallback, useEffect, useRef, useState} from 'react';

import {KidscodeWorkspaceState} from '../kidscode-workspace-state';
import {
    KidscodeReturnDestinationType,
    createKidscodeWindowNavigationTransport,
    validateKidscodeReturnDestination
} from './kidscode-workspace-navigation-contract';

// Blocking content states that already have a validated session and a trusted return_to: safe to
// navigate to immediately (no editable content exists in any of these states) once the student or
// tutor asks to recover from them.
const SESSION_RECOVERY_STATES = [
    KidscodeWorkspaceState.CORRUPTED_PROJECT,
    KidscodeWorkspaceState.PROJECT_DELETED,
    KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED,
    KidscodeWorkspaceState.CORRUPTED_SUBMISSION
];

const defaultWindowTransport = createKidscodeWindowNavigationTransport();

/**
 * Kidscode Workspace Navigation Controller (Phase 7). Sits between the Return controls / recovery
 * UI and the Return Destination Validator + Navigation Transport (see
 * kidscode-workspace-navigation-contract.js): it never touches `window.location` itself and never
 * accepts a destination the caller did not derive from `session.return_to` or the injected
 * recovery URL.
 *
 * It also owns the Save-and-Leave confirmation flow: a requested return while the Workspace is
 * Unsaved, Saving, or Save failed opens a confirmation instead of navigating immediately, and reuses
 * the existing Phase 4 manual-save mechanism (`onSaveProject`) rather than saving a second way.
 * @param {object} options - controller options
 * @param {Array<string>} [options.allowedOrigins] - absolute-URL origins permitted in this
 *   environment; forwarded to the destination validator
 * @param {Function} options.onSaveProject - existing Phase 4 manual-save trigger
 * @param {string} [options.recoveryUrl] - injected/configured fallback destination for states with
 *   no validated session (e.g. Session Expired); `null` leaves recovery fail-closed
 * @param {object} options.session - the current Workspace session (or `null` before/without one)
 * @param {object} [options.transport] - navigation transport; defaults to the real browser one
 * @param {string} options.workspaceState - the fully resolved `kidscodeWorkspaceState`
 * @returns {object} navigation handlers and confirm-dialog state for the caller to render/wire
 */
const useKidscodeWorkspaceNavigationController = ({
    allowedOrigins = [],
    onSaveProject,
    recoveryUrl = null,
    session,
    transport = defaultWindowTransport,
    workspaceState
}) => {
    const [confirm, setConfirm] = useState(null);
    const pendingDestinationRef = useRef(null);

    const navigate = useCallback(destination => {
        const safeUrl = validateKidscodeReturnDestination(destination, {allowedOrigins});
        if (!safeUrl) return;
        transport.navigate(safeUrl);
    }, [allowedOrigins, transport]);

    const requestReturn = useCallback(destination => {
        if (!destination) return;
        if (workspaceState === KidscodeWorkspaceState.UNSAVED) {
            pendingDestinationRef.current = destination;
            setConfirm({destination, reason: 'unsaved'});
            return;
        }
        if (workspaceState === KidscodeWorkspaceState.SAVING) {
            pendingDestinationRef.current = destination;
            setConfirm({destination, reason: 'saving'});
            return;
        }
        if (workspaceState === KidscodeWorkspaceState.SAVE_FAILED) {
            pendingDestinationRef.current = destination;
            setConfirm({destination, reason: 'saveFailed'});
            return;
        }
        navigate(destination);
    }, [navigate, workspaceState]);

    // While the confirm dialog is waiting on an in-flight save (whether started by
    // "Save and Leave" or an autosave that happened to be running already), follow the Phase 4
    // state machine to its conclusion instead of guessing: Saved completes the pending navigation,
    // Save failed surfaces the retry/leave-without-saving choice, and a fresh Unsaved (a queued
    // edit that raced the save) returns to the ordinary unsaved confirmation.
    useEffect(() => {
        if (!confirm || confirm.reason !== 'saving') return;
        if (workspaceState === KidscodeWorkspaceState.SAVED) {
            const destination = pendingDestinationRef.current;
            pendingDestinationRef.current = null;
            setConfirm(null);
            navigate(destination);
        } else if (workspaceState === KidscodeWorkspaceState.SAVE_FAILED) {
            setConfirm(previous => (previous && Object.assign({}, previous, {reason: 'saveFailed'})));
        } else if (workspaceState === KidscodeWorkspaceState.UNSAVED) {
            setConfirm(previous => (previous && Object.assign({}, previous, {reason: 'unsaved'})));
        }
    }, [confirm, navigate, workspaceState]);

    const handleStay = useCallback(() => {
        pendingDestinationRef.current = null;
        setConfirm(null);
    }, []);

    const handleSaveAndLeave = useCallback(() => {
        setConfirm(previous => (previous && Object.assign({}, previous, {reason: 'saving'})));
        onSaveProject();
    }, [onSaveProject]);

    const handleLeaveWithoutSaving = useCallback(() => {
        const destination = pendingDestinationRef.current;
        pendingDestinationRef.current = null;
        setConfirm(null);
        navigate(destination);
    }, [navigate]);

    // Every Return control (Return to Lesson, Return to My Scratch Projects, Return to Tutor
    // Review, and the always-visible Back to Kidscode button) shares one destination: the current
    // session's own return_to. There is exactly one valid destination per session, so there is
    // nothing UI-specific left for each control to decide.
    const handleReturnToKidscode = useCallback(() => {
        const destination = (session && session.return_to) ?
            session.return_to :
            (recoveryUrl ? {type: KidscodeReturnDestinationType.RECOVERY, url: recoveryUrl} : null);
        requestReturn(destination);
    }, [recoveryUrl, requestReturn, session]);

    // Routes a blocking-state recovery action (the blocking dialog's own button) to the validated
    // destination for that state, without opening the unsaved-work confirmation: every state this
    // handles is a fully blocking state with no editable/mutable content to protect. Returns
    // whether it handled the action, so the caller can fall back to whatever retry behaviour
    // (Save failed, Launch Connection Lost) already existed for every other state.
    const handleRecoveryAction = useCallback(actionState => {
        if (actionState === KidscodeWorkspaceState.SESSION_EXPIRED) {
            if (!recoveryUrl) return false;
            navigate({type: KidscodeReturnDestinationType.RECOVERY, url: recoveryUrl});
            return true;
        }
        if (SESSION_RECOVERY_STATES.includes(actionState)) {
            if (!session || !session.return_to) return false;
            navigate(session.return_to);
            return true;
        }
        return false;
    }, [navigate, recoveryUrl, session]);

    return {
        confirm,
        handleLeaveWithoutSaving,
        handleRecoveryAction,
        handleReturnToKidscode,
        handleSaveAndLeave,
        handleStay
    };
};

export default useKidscodeWorkspaceNavigationController;
