import React from 'react';
import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import {render, waitFor} from '@testing-library/react';
import VM from '@scratch/scratch-vm';

import {KidscodeWorkspaceSessionProvider} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';
import KidscodeWorkspaceProjectManagementHOC
    from '../../../src/lib/kidscode-workspace-project-management/kidscode-workspace-project-management-hoc.jsx';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

// A minimal stand-in for the Blob that the real vm.saveProjectSb3() resolves with, matching the
// Phase 4 persistence HOC tests' own fake (jsdom's Blob does not reliably implement arrayBuffer()).
const fakeSb3Blob = text => ({
    arrayBuffer: () => Promise.resolve((() => {
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
        return bytes.buffer;
    })())
});

const buildSession = overrides => ({
    session_ref: 'SCR-SESSION-TEST',
    expires_at: '2099-08-10T15:00:00Z',
    workspace_access_token: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST',
    student: {display_name: 'Adewale'},
    project: {
        project_ref: 'SCR-PROJ-TEST',
        title: 'Test Project',
        project_type: 'independent',
        status: 'draft'
    },
    assignment: null,
    course: null,
    lesson: null,
    launch_type: 'existing_independent',
    return_to: {type: 'projects', url: '/scratch-projects'},
    ...overrides
});

describe('KidscodeWorkspaceProjectManagementHOC', () => {
    let store;
    let vm;
    let Probe;

    const mountComponent = ({session, adapter, launchWorkspaceState = null}) => {
        const KidscodeWorkspaceProjectManagement = KidscodeWorkspaceProjectManagementHOC(Probe);
        return render(
            <Provider store={store}>
                <KidscodeWorkspaceSessionProvider session={session}>
                    <KidscodeWorkspaceProjectManagement
                        kidscodeWorkspaceProjectManagementAdapter={adapter}
                        kidscodeWorkspaceState={launchWorkspaceState}
                    />
                </KidscodeWorkspaceSessionProvider>
            </Provider>
        );
    };

    beforeEach(() => {
        vm = new VM();
        vm.saveProjectSb3 = jest.fn(() => Promise.resolve(fakeSb3Blob('CURRENT_SB3_BYTES')));
        store = configureStore()({
            scratchGui: {
                projectTitle: 'Test Project',
                vm
            }
        });
        Probe = function ProbeComponent (props) {
            global.__lastProbeProps = props;
            return null;
        };
    });

    const createAdapter = ({renameResult, renameError, duplicateResult, duplicateError, deleteResult, deleteError} = {}) => ({
        renameProject: jest.fn(() => (renameError ? Promise.reject(renameError) : Promise.resolve(renameResult))),
        duplicateProject: jest.fn(() => (duplicateError ? Promise.reject(duplicateError) : Promise.resolve(duplicateResult))),
        deleteDraftProject: jest.fn(() => (deleteError ? Promise.reject(deleteError) : Promise.resolve(deleteResult)))
    });

    test('a successful rename dispatches the confirmed title onto Redux', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            renameResult: {success: true, data: {project_ref: session.project.project_ref, title: 'My Walking Cat', updated_at: 'x'}}
        });

        mountComponent({session, adapter});
        await global.__lastProbeProps.onRenameProject('My Walking Cat');

        expect(adapter.renameProject).toHaveBeenCalledWith({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token,
            title: 'My Walking Cat'
        });
        expect(store.getActions()).toContainEqual({type: 'projectTitle/SET_PROJECT_TITLE', title: 'My Walking Cat'});
    });

    test('a failed rename does not dispatch a title change', async () => {
        const session = buildSession();
        const adapter = createAdapter({renameError: new Error('adapter rejected')});

        mountComponent({session, adapter});
        await expect(global.__lastProbeProps.onRenameProject('New Title')).rejects.toThrow('adapter rejected');

        expect(store.getActions()).toEqual([]);
    });

    test('duplicate serialises the current (possibly unsaved) vm content before calling the adapter', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            duplicateResult: {
                success: true,
                data: {project_ref: 'SCR-PROJ-NEW', title: 'Test Project Copy', project_type: 'independent', status: 'draft', created_at: 'x'}
            }
        });

        mountComponent({session, adapter});
        const result = await global.__lastProbeProps.onDuplicateProject();

        expect(vm.saveProjectSb3).toHaveBeenCalled();
        expect(adapter.duplicateProject).toHaveBeenCalledWith({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token,
            sb3: expect.any(ArrayBuffer),
            title: 'Test Project'
        });
        // The request never carries a project_type at all — the adapter alone decides it is
        // always an independent draft, so a lesson original cannot produce a second active
        // lesson project for the same assignment.
        expect(adapter.duplicateProject.mock.calls[0][0]).not.toHaveProperty('projectType');
        // The Blob vm.saveProjectSb3() resolves with is converted to an ArrayBuffer before
        // reaching the adapter, matching the Phase 4 persistence HOC's own conversion.
        const sentSb3 = adapter.duplicateProject.mock.calls[0][0].sb3;
        expect(Buffer.from(sentSb3).toString()).toBe('CURRENT_SB3_BYTES');
        expect(result).toEqual({project_ref: 'SCR-PROJ-NEW', title: 'Test Project Copy', project_type: 'independent', status: 'draft', created_at: 'x'});
    });

    test('duplicating a lesson project produces an independent draft, not a second active lesson project', async () => {
        const session = buildSession({
            project: {
                project_ref: 'SCR-PROJ-LESSON',
                title: 'Make the Cat Walk',
                project_type: 'lesson',
                status: 'draft'
            }
        });
        const adapter = createAdapter({
            duplicateResult: {
                success: true,
                data: {
                    project_ref: 'SCR-PROJ-LESSON-COPY',
                    title: 'Make the Cat Walk Copy',
                    project_type: 'independent',
                    status: 'draft',
                    created_at: 'x'
                }
            }
        });

        mountComponent({session, adapter});
        const result = await global.__lastProbeProps.onDuplicateProject();

        expect(result.project_type).toBe('independent');
        expect(adapter.duplicateProject.mock.calls[0][0]).not.toHaveProperty('projectType');
        // The lesson original stays exactly as it was: still the active project, still a lesson.
        expect(global.__lastProbeProps.kidscodeProjectDeleted).toBe(false);
    });

    test('duplicate does not change the current Workspace kidscodeWorkspaceState or mark it deleted', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            duplicateResult: {success: true, data: {project_ref: 'SCR-PROJ-NEW', title: 'Copy'}}
        });

        mountComponent({session, adapter, launchWorkspaceState: null});
        await global.__lastProbeProps.onDuplicateProject();

        expect(global.__lastProbeProps.kidscodeWorkspaceState).toBeNull();
        expect(global.__lastProbeProps.kidscodeProjectDeleted).toBe(false);
    });

    test('a duplicate failure leaves the original project unaffected', async () => {
        const session = buildSession();
        const adapter = createAdapter({duplicateError: new Error('adapter rejected')});

        mountComponent({session, adapter});
        await expect(global.__lastProbeProps.onDuplicateProject()).rejects.toThrow('adapter rejected');

        expect(global.__lastProbeProps.kidscodeWorkspaceState).toBeNull();
        expect(global.__lastProbeProps.kidscodeProjectDeleted).toBe(false);
    });

    test('a successful delete marks the project deleted and forces PROJECT_DELETED', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            deleteResult: {success: true, data: {project_ref: session.project.project_ref, deleted: true}}
        });

        mountComponent({session, adapter});
        await global.__lastProbeProps.onDeleteDraft();

        await waitFor(() => expect(global.__lastProbeProps.kidscodeProjectDeleted).toBe(true));
        expect(global.__lastProbeProps.kidscodeWorkspaceState).toBe(KidscodeWorkspaceState.PROJECT_DELETED);
    });

    test('a failed delete leaves the project available', async () => {
        const session = buildSession();
        const adapter = createAdapter({deleteError: new Error('adapter rejected')});

        mountComponent({session, adapter});
        await expect(global.__lastProbeProps.onDeleteDraft()).rejects.toThrow('adapter rejected');

        expect(global.__lastProbeProps.kidscodeProjectDeleted).toBe(false);
        expect(global.__lastProbeProps.kidscodeWorkspaceState).toBeNull();
    });

    test('a second rename while one is already in flight is rejected rather than starting a concurrent request', async () => {
        const session = buildSession();
        let resolveFirst;
        const firstPromise = new Promise(resolve => {
            resolveFirst = resolve;
        });
        const adapter = {
            renameProject: jest.fn(() => firstPromise),
            duplicateProject: jest.fn(),
            deleteDraftProject: jest.fn()
        };

        mountComponent({session, adapter});
        const first = global.__lastProbeProps.onRenameProject('First');
        await flushPromises();

        await expect(global.__lastProbeProps.onRenameProject('Second')).rejects.toThrow('already in progress');
        expect(adapter.renameProject).toHaveBeenCalledTimes(1);

        resolveFirst({success: true, data: {project_ref: session.project.project_ref, title: 'First', updated_at: 'x'}});
        await first;
    });

    test('review mode rejects every project-management mutation before reaching the adapter', async () => {
        const session = buildSession({launch_type: 'review'});
        const adapter = createAdapter();
        mountComponent({session, adapter});

        await expect(global.__lastProbeProps.onRenameProject('Tutor edit')).rejects.toThrow('review mode');
        await expect(global.__lastProbeProps.onDuplicateProject()).rejects.toThrow('review mode');
        await expect(global.__lastProbeProps.onDeleteDraft()).rejects.toThrow('review mode');
        expect(adapter.renameProject).not.toHaveBeenCalled();
        expect(adapter.duplicateProject).not.toHaveBeenCalled();
        expect(adapter.deleteDraftProject).not.toHaveBeenCalled();
        expect(vm.saveProjectSb3).not.toHaveBeenCalled();
    });
});
