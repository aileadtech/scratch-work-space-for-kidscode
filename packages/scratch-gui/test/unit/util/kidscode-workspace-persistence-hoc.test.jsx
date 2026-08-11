import React from 'react';
import configureStore from 'redux-mock-store';
import {act, render, waitFor} from '@testing-library/react';
import VM from '@scratch/scratch-vm';

import {KidscodeWorkspaceSessionProvider} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import {LoadingState} from '../../../src/reducers/project-state';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';
import KidscodeWorkspacePersistenceHOC
    from '../../../src/lib/kidscode-workspace-persistence/kidscode-workspace-persistence-hoc.jsx';

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// A minimal stand-in for the Blob that the real vm.saveProjectSb3() resolves with. jsdom's Blob
// does not reliably implement arrayBuffer() the way real browsers do, so tests fake just the
// interface the HOC actually depends on rather than exercising jsdom's Blob support.
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

const buildSaveResult = (session, versionRef) => ({
    success: true,
    data: {
        project_ref: session.project.project_ref,
        version_ref: versionRef,
        saved_at: 'x',
        status: 'draft'
    }
});

describe('KidscodeWorkspacePersistenceHOC', () => {
    let store;
    let vm;
    let observedStates;
    let Probe;

    const mountComponent = ({
        session,
        adapter,
        debounceMs = 20,
        projectDeleted = false,
        projectReadOnly = false,
        reviewMode = false,
        onVersionChanged
    }) => {
        const KidscodeWorkspacePersistence = KidscodeWorkspacePersistenceHOC(Probe);
        return render(
            <KidscodeWorkspaceSessionProvider session={session}>
                <KidscodeWorkspacePersistence
                    store={store}
                    vm={vm}
                    kidscodeAutosaveDebounceMs={debounceMs}
                    kidscodeProjectDeleted={projectDeleted}
                    kidscodeProjectReadOnly={projectReadOnly}
                    kidscodeReviewMode={reviewMode}
                    kidscodeWorkspacePersistenceAdapter={adapter}
                    kidscodeWorkspaceState={null}
                    onKidscodeVersionChanged={onVersionChanged}
                />
            </KidscodeWorkspaceSessionProvider>
        );
    };

    beforeEach(() => {
        store = configureStore()({
            scratchGui: {
                projectState: {loadingState: LoadingState.SHOWING_WITHOUT_ID},
                projectChanged: false
            }
        });
        vm = new VM();
        vm.loadProject = jest.fn(() => Promise.resolve());
        // A small real delay (rather than an immediately-resolved promise) gives React a chance
        // to commit the intermediate Saving render before Saved lands, so tests can observe it.
        vm.saveProjectSb3 = jest.fn(() => wait(5).then(() => fakeSb3Blob('SB3_BYTES')));
        observedStates = [];
        Probe = function ProbeComponent (props) {
            observedStates.push(props.kidscodeWorkspaceState);
            global.__lastProbeProps = props;
            return null;
        };
    });

    const createAdapter = ({loadResult, loadError, saveResults, saveError} = {}) => {
        let saveCall = 0;
        return {
            loadProject: jest.fn(() => (loadError ? Promise.reject(loadError) : Promise.resolve(loadResult))),
            saveProject: jest.fn(() => {
                if (saveError) return Promise.reject(saveError);
                const result = Array.isArray(saveResults) ? saveResults[saveCall] : saveResults;
                saveCall += 1;
                return Promise.resolve(result);
            })
        };
    };

    test('loads a saved project into the vm and reaches Saved', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {
                project_ref: session.project.project_ref,
                source: 'saved',
                version_ref: 'SCR-DEV-VER-1',
                saved_at: '2026-08-10T00:00:00Z',
                sb3: 'PERSISTED_SB3'
            }
        });

        mountComponent({session, adapter});

        await waitFor(() => expect(vm.loadProject).toHaveBeenCalledWith('PERSISTED_SB3'));
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));
        expect(adapter.loadProject).toHaveBeenCalledWith({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token,
            launchType: session.launch_type
        });
    });

    test('reports the loaded version_ref to the submission controller seam', async () => {
        const session = buildSession();
        const onVersionChanged = jest.fn();
        const adapter = createAdapter({loadResult: {
            project_ref: session.project.project_ref,
            source: 'saved',
            version_ref: 'SCR-DEV-VER-7',
            saved_at: 'x',
            sb3: null
        }});

        mountComponent({session, adapter, onVersionChanged});

        await waitFor(() => expect(onVersionChanged).toHaveBeenCalledWith('SCR-DEV-VER-7'));
        expect(global.__lastProbeProps.kidscodeLatestVersionRef).toBe('SCR-DEV-VER-7');
    });

    test('review mode never loads or saves the working project', async () => {
        const session = buildSession({launch_type: 'review'});
        const adapter = createAdapter();
        mountComponent({session, adapter, reviewMode: true, projectReadOnly: true});

        await flushPromises();
        expect(global.__lastProbeProps.kidscodeProjectReadOnly).toBe(true);
        expect(global.__lastProbeProps.kidscodeReviewMode).toBe(true);
        expect(adapter.loadProject).not.toHaveBeenCalled();
        global.__lastProbeProps.onSaveProject();
        vm.emit('PROJECT_CHANGED');
        await wait(30);
        expect(vm.saveProjectSb3).not.toHaveBeenCalled();
        expect(adapter.saveProject).not.toHaveBeenCalled();
    });

    test('a submitted or approved student project loads for inspection but cannot save or autosave', async () => {
        const session = buildSession({
            project: Object.assign({}, buildSession().project, {status: 'submitted'})
        });
        const adapter = createAdapter({loadResult: {
            project_ref: session.project.project_ref,
            source: 'saved',
            version_ref: 'SCR-DEV-VER-1',
            saved_at: 'x',
            sb3: null
        }});
        mountComponent({session, adapter, projectReadOnly: true});
        await waitFor(() => expect(adapter.loadProject).toHaveBeenCalled());
        expect(global.__lastProbeProps.kidscodeProjectReadOnly).toBe(true);

        global.__lastProbeProps.onSaveProject();
        vm.emit('PROJECT_CHANGED');
        await wait(30);
        expect(vm.saveProjectSb3).not.toHaveBeenCalled();
        expect(adapter.saveProject).not.toHaveBeenCalled();
    });

    test('a blank result does not call vm.loadProject and still reaches Saved', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {
                project_ref: session.project.project_ref,
                source: 'blank',
                version_ref: null,
                saved_at: null,
                sb3: null
            }
        });

        mountComponent({session, adapter});

        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));
        expect(vm.loadProject).not.toHaveBeenCalled();
    });

    test('a starter result loads the starter project into the vm', async () => {
        const session = buildSession({launch_type: 'new_lesson'});
        const adapter = createAdapter({
            loadResult: {
                project_ref: session.project.project_ref,
                source: 'starter',
                version_ref: null,
                saved_at: null,
                sb3: {targets: [], meta: {}}
            }
        });

        mountComponent({session, adapter});

        await waitFor(() => expect(vm.loadProject).toHaveBeenCalledWith({targets: [], meta: {}}));
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));
    });

    test('a corrupted saved project (vm.loadProject rejects) maps to Corrupted Project', async () => {
        vm.loadProject = jest.fn(() => Promise.reject(new Error('bad sb3')));
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {
                project_ref: session.project.project_ref,
                source: 'saved',
                version_ref: 'SCR-DEV-VER-1',
                saved_at: '2026-08-10T00:00:00Z',
                sb3: 'BROKEN_SB3'
            }
        });

        mountComponent({session, adapter});

        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.CORRUPTED_PROJECT));
    });

    test('an adapter load failure also maps to Corrupted Project rather than a blank project', async () => {
        const session = buildSession();
        const adapter = createAdapter({loadError: new Error('adapter unreachable')});

        mountComponent({session, adapter});

        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.CORRUPTED_PROJECT));
        expect(vm.loadProject).not.toHaveBeenCalled();
    });

    test('manual save goes Saving -> Saved and serialises via vm.saveProjectSb3', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null},
            saveResults: buildSaveResult(session, 'SCR-DEV-VER-1')
        });

        mountComponent({session, adapter});
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

        observedStates.length = 0;
        global.__lastProbeProps.onSaveProject();

        await waitFor(() => expect(observedStates).toContain(KidscodeWorkspaceState.SAVING));
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));
        expect(vm.saveProjectSb3).toHaveBeenCalled();
        expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token,
            sb3: expect.any(ArrayBuffer),
            reason: 'manual'
        }));
        // The Blob vm.saveProjectSb3() resolved with must be converted to an ArrayBuffer before
        // reaching the adapter, since vm.loadProject() cannot accept a raw Blob.
        const sentSb3 = adapter.saveProject.mock.calls[0][0].sb3;
        expect(Buffer.from(sentSb3).toString()).toBe('SB3_BYTES');
    });

    test('a failed save reaches Save failed, and the retry action tries again', async () => {
        const session = buildSession();
        let shouldFail = true;
        const adapter = {
            loadProject: jest.fn(() => Promise.resolve({
                project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null
            })),
            saveProject: jest.fn(() => (shouldFail ?
                Promise.reject(new Error('save rejected')) :
                Promise.resolve(buildSaveResult(session, 'SCR-DEV-VER-1'))))
        };

        mountComponent({session, adapter});
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

        global.__lastProbeProps.onSaveProject();
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVE_FAILED));

        shouldFail = false;
        global.__lastProbeProps.onWorkspaceStateAction(KidscodeWorkspaceState.SAVE_FAILED);
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));
        expect(adapter.saveProject).toHaveBeenCalledTimes(2);
    });

    test('autosave is debounced: a burst of project changes triggers exactly one save', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null},
            saveResults: buildSaveResult(session, 'SCR-DEV-VER-1')
        });

        mountComponent({session, adapter, debounceMs: 30});
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

        vm.emit('PROJECT_CHANGED');
        await wait(10);
        vm.emit('PROJECT_CHANGED');
        await wait(10);
        vm.emit('PROJECT_CHANGED');

        // Debounce window keeps resetting; no save yet shortly after the last change.
        await wait(15);
        expect(adapter.saveProject).not.toHaveBeenCalled();

        await waitFor(() => expect(adapter.saveProject).toHaveBeenCalledTimes(1));
        expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({reason: 'autosave'}));
    });

    test('entering submission read-only state cancels a pending autosave debounce', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null},
            saveResults: buildSaveResult(session, 'SCR-DEV-VER-1')
        });
        const KidscodeWorkspacePersistence = KidscodeWorkspacePersistenceHOC(Probe);
        let setReadOnly;
        const Harness = () => {
            const [readOnly, setReadOnlyState] = React.useState(false);
            setReadOnly = setReadOnlyState;
            return (
                <KidscodeWorkspacePersistence
                    store={store}
                    vm={vm}
                    kidscodeAutosaveDebounceMs={30}
                    kidscodeProjectReadOnly={readOnly}
                    kidscodeWorkspacePersistenceAdapter={adapter}
                    kidscodeWorkspaceState={null}
                />
            );
        };
        render(
            <KidscodeWorkspaceSessionProvider session={session}>
                <Harness />
            </KidscodeWorkspaceSessionProvider>
        );
        await waitFor(() => expect(global.__lastProbeProps.kidscodeWorkspaceState)
            .toBe(KidscodeWorkspaceState.SAVED));

        vm.emit('PROJECT_CHANGED');
        act(() => setReadOnly(true));
        await wait(40);

        expect(adapter.saveProject).not.toHaveBeenCalled();
    });

    test('concurrent saves are prevented: a manual save during an in-flight save is queued, not duplicated', async () => {
        const session = buildSession();
        let resolveFirstSave;
        const firstSavePromise = new Promise(resolve => {
            resolveFirstSave = resolve;
        });
        let saveCall = 0;
        const adapter = {
            loadProject: jest.fn(() => Promise.resolve({
                project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null
            })),
            saveProject: jest.fn(() => {
                saveCall += 1;
                if (saveCall === 1) return firstSavePromise;
                return Promise.resolve(buildSaveResult(session, `SCR-DEV-VER-${saveCall}`));
            })
        };

        mountComponent({session, adapter});
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

        global.__lastProbeProps.onSaveProject();
        await waitFor(() => expect(adapter.saveProject).toHaveBeenCalledTimes(1));

        // A second manual save while the first is still in flight must not start a second
        // concurrent request.
        global.__lastProbeProps.onSaveProject();
        await flushPromises();
        expect(adapter.saveProject).toHaveBeenCalledTimes(1);

        resolveFirstSave(buildSaveResult(session, 'SCR-DEV-VER-1'));

        // The queued manual save now runs.
        await waitFor(() => expect(adapter.saveProject).toHaveBeenCalledTimes(2));
    });

    test('an edit that lands during an in-flight save keeps the project Unsaved instead of a stale Saved', async () => {
        const session = buildSession();
        let resolveSave;
        const savePromise = new Promise(resolve => {
            resolveSave = resolve;
        });
        const adapter = {
            loadProject: jest.fn(() => Promise.resolve({
                project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null
            })),
            saveProject: jest.fn(() => savePromise)
        };

        mountComponent({session, adapter});
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

        global.__lastProbeProps.onSaveProject();
        await waitFor(() => expect(observedStates).toContain(KidscodeWorkspaceState.SAVING));

        // A new edit arrives while the save above is still in flight.
        vm.emit('PROJECT_CHANGED');

        observedStates.length = 0;
        resolveSave(buildSaveResult(session, 'SCR-DEV-VER-1'));

        await flushPromises();
        // The save that just completed did not cover the later edit, so it must not report
        // Saved for content that is now stale.
        expect(observedStates).not.toContain(KidscodeWorkspaceState.SAVED);
    });

    test('version_ref is retained and sent as baseVersionRef on the next save', async () => {
        const session = buildSession();
        const adapter = createAdapter({
            loadResult: {
                project_ref: session.project.project_ref,
                source: 'saved',
                version_ref: 'SCR-DEV-VER-5',
                sb3: 'EXISTING_SB3'
            },
            saveResults: buildSaveResult(session, 'SCR-DEV-VER-6')
        });

        mountComponent({session, adapter});
        await waitFor(() =>
            expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

        global.__lastProbeProps.onSaveProject();
        await waitFor(() => expect(adapter.saveProject).toHaveBeenCalledTimes(1));
        expect(adapter.saveProject).toHaveBeenCalledWith(expect.objectContaining({baseVersionRef: 'SCR-DEV-VER-5'}));
    });

    // Set by KidscodeWorkspaceProjectManagementHOC (Phase 5) once a delete succeeds; save and
    // autosave must both stop for the deleted project's remaining session lifetime.
    describe('kidscodeProjectDeleted', () => {
        test('blocks a manual save', async () => {
            const session = buildSession();
            const adapter = createAdapter({
                loadResult: {project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null}
            });

            mountComponent({session, adapter, projectDeleted: true});
            await waitFor(() =>
                expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

            global.__lastProbeProps.onSaveProject();
            await flushPromises();
            expect(adapter.saveProject).not.toHaveBeenCalled();
        });

        test('blocks autosave triggered by a VM project change', async () => {
            const session = buildSession();
            const adapter = createAdapter({
                loadResult: {project_ref: session.project.project_ref, source: 'blank', version_ref: null, sb3: null}
            });

            mountComponent({session, adapter, projectDeleted: true, debounceMs: 10});
            await waitFor(() =>
                expect(observedStates[observedStates.length - 1]).toBe(KidscodeWorkspaceState.SAVED));

            vm.emit('PROJECT_CHANGED');
            await wait(20);
            expect(adapter.saveProject).not.toHaveBeenCalled();
        });
    });
});
