import {useCallback, useRef, useState} from 'react';

const initialActionState = {
    isRenaming: false,
    isDuplicating: false,
    isDeleting: false,
    deleted: false
};

/**
 * The "Kidscode Project Management Controller": the only place that knows how to turn a Rename/
 * Duplicate/Delete request from the Project menu into a call against the project-management
 * adapter interface, and how to reflect the result back (confirmed title update, in-flight state,
 * the "this project is deleted" flag). Neither the adapter's identity (development vs. Laravel)
 * nor its storage details are visible past this hook.
 *
 * Each returned action resolves with the adapter's `data` payload on success or rejects with the
 * adapter's error on failure, so callers (the Rename/Duplicate/Delete dialogs) can use ordinary
 * `.then`/`.catch` to decide when to close and what error to show, while `status` tracks
 * cross-cutting in-flight/deleted flags used to grey out the menu as a whole.
 * @param {object} params - controller inputs
 * @param {{renameProject: Function, duplicateProject: Function, deleteDraftProject: Function}}
 *   params.adapter - the active project-management adapter
 * @param {?object} params.session - the current Kidscode workspace session (project_ref,
 *   workspace_access_token), or null before launch resolves
 * @param {string} params.projectTitle - the current confirmed project title, used as the base for
 *   the duplicate's title so a rename made earlier in the same session is reflected
 * @param {object} params.vm - the Scratch VM, used to serialise the current editor content before
 *   duplicating it
 * @param {Function} params.onProjectRenamed - called with the confirmed new title once rename
 *   succeeds, so the caller can update the visible/Redux title
 * @returns {object} the controller's callbacks and status
 */
const useKidscodeProjectManagementController = ({adapter, session, projectTitle, readOnly, vm, onProjectRenamed}) => {
    const [status, setStatus] = useState(initialActionState);
    const renameInFlightRef = useRef(false);
    const duplicateInFlightRef = useRef(false);
    const deleteInFlightRef = useRef(false);

    const missingSessionError = actionName => {
        // eslint-disable-next-line no-console
        console.error(`useKidscodeProjectManagementController.${actionName}: no active workspace session.`);
        return Promise.reject(new Error('No active workspace session.'));
    };

    const renameProject = useCallback(title => {
        if (!session) return missingSessionError('renameProject');
        if (readOnly) return Promise.reject(new Error('Project management is unavailable in review mode.'));
        if (renameInFlightRef.current) return Promise.reject(new Error('A rename is already in progress.'));
        renameInFlightRef.current = true;
        setStatus(previous => Object.assign({}, previous, {isRenaming: true}));

        return adapter.renameProject({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token,
            title
        })
            .then(result => {
                renameInFlightRef.current = false;
                setStatus(previous => Object.assign({}, previous, {isRenaming: false}));
                onProjectRenamed(result.data.title);
                return result.data;
            })
            .catch(error => {
                renameInFlightRef.current = false;
                setStatus(previous => Object.assign({}, previous, {isRenaming: false}));
                throw error;
            });
    }, [adapter, onProjectRenamed, readOnly, session]);

    const duplicateProject = useCallback(() => {
        if (!session) return missingSessionError('duplicateProject');
        if (readOnly) return Promise.reject(new Error('Project management is unavailable in review mode.'));
        if (duplicateInFlightRef.current) return Promise.reject(new Error('A duplicate is already in progress.'));
        duplicateInFlightRef.current = true;
        setStatus(previous => Object.assign({}, previous, {isDuplicating: true}));

        return vm.saveProjectSb3()
            // vm.saveProjectSb3() resolves with a Blob; the adapter (and vm.loadProject(), when the
            // duplicate is later opened) expects an ArrayBuffer, matching the Phase 4 persistence
            // HOC's own conversion.
            .then(sb3Blob => sb3Blob.arrayBuffer())
            .then(sb3 => adapter.duplicateProject({
                projectRef: session.project.project_ref,
                workspaceAccessToken: session.workspace_access_token,
                sb3,
                title: projectTitle
            }))
            .then(result => {
                duplicateInFlightRef.current = false;
                setStatus(previous => Object.assign({}, previous, {isDuplicating: false}));
                return result.data;
            })
            .catch(error => {
                duplicateInFlightRef.current = false;
                setStatus(previous => Object.assign({}, previous, {isDuplicating: false}));
                throw error;
            });
    }, [adapter, projectTitle, readOnly, session, vm]);

    const deleteDraftProject = useCallback(() => {
        if (!session) return missingSessionError('deleteDraftProject');
        if (readOnly) return Promise.reject(new Error('Project management is unavailable in review mode.'));
        if (deleteInFlightRef.current) return Promise.reject(new Error('A delete is already in progress.'));
        deleteInFlightRef.current = true;
        setStatus(previous => Object.assign({}, previous, {isDeleting: true}));

        return adapter.deleteDraftProject({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token
        })
            .then(result => {
                deleteInFlightRef.current = false;
                setStatus(previous => Object.assign({}, previous, {isDeleting: false, deleted: true}));
                return result.data;
            })
            .catch(error => {
                deleteInFlightRef.current = false;
                setStatus(previous => Object.assign({}, previous, {isDeleting: false}));
                throw error;
            });
    }, [adapter, readOnly, session]);

    return {
        renameProject,
        duplicateProject,
        deleteDraftProject,
        status
    };
};

export default useKidscodeProjectManagementController;
