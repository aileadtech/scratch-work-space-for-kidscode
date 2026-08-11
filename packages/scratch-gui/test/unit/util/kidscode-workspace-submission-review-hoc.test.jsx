import React from 'react';
import configureStore from 'redux-mock-store';
import {render, waitFor} from '@testing-library/react';
import VM from '@scratch/scratch-vm';

import {KidscodeWorkspaceSessionProvider} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import {LoadingState} from '../../../src/reducers/project-state';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';
import KidscodeWorkspaceSubmissionReviewHOC
    from '../../../src/lib/kidscode-workspace-submission-review/kidscode-workspace-submission-review-hoc.jsx';

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
    role: 'student',
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

describe('KidscodeWorkspaceSubmissionReviewHOC', () => {
    let store;
    let vm;
    let Probe;

    const mountComponent = ({session, adapter, workspaceState = null, latestVersionRef = 'SCR-DEV-VER-3'}) => {
        const Component = KidscodeWorkspaceSubmissionReviewHOC(Probe);
        return render(
            <KidscodeWorkspaceSessionProvider session={session}>
                <Component
                    store={store}
                    vm={vm}
                    kidscodeLatestVersionRef={latestVersionRef}
                    kidscodeWorkspaceState={workspaceState}
                    kidscodeWorkspaceSubmissionReviewAdapter={adapter}
                />
            </KidscodeWorkspaceSessionProvider>
        );
    };

    beforeEach(() => {
        store = configureStore()({
            scratchGui: {
                projectState: {loadingState: LoadingState.SHOWING_WITHOUT_ID}
            }
        });
        vm = new VM();
        vm.saveProjectSb3 = jest.fn(() => Promise.resolve(fakeSb3Blob('CURRENT UNSAVED SB3')));
        vm.loadProject = jest.fn(() => Promise.resolve());
        Probe = function ProbeComponent (props) {
            global.__lastSubmissionProbeProps = props;
            return null;
        };
    });

    const createAdapter = overrides => Object.assign({
        submitProject: jest.fn(() => Promise.resolve({
            success: true,
            data: {
                project_ref: 'SCR-PROJ-TEST',
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                working_version_ref: 'SCR-DEV-VER-4',
                submitted_at: '2026-08-11T12:00:00Z',
                status: 'submitted'
            }
        })),
        loadSubmission: jest.fn(),
        approveSubmission: jest.fn(),
        requestChanges: jest.fn()
    }, overrides);

    test('Submit serialises the current unsaved editor and sends the latest working version', async () => {
        const session = buildSession();
        const adapter = createAdapter();
        mountComponent({session, adapter});

        await global.__lastSubmissionProbeProps.onSubmitProject();

        expect(vm.saveProjectSb3).toHaveBeenCalledTimes(1);
        expect(adapter.submitProject).toHaveBeenCalledWith({
            projectRef: session.project.project_ref,
            workspaceAccessToken: session.workspace_access_token,
            sb3: expect.any(ArrayBuffer),
            baseVersionRef: 'SCR-DEV-VER-3'
        });
        expect(Buffer.from(adapter.submitProject.mock.calls[0][0].sb3).toString()).toBe('CURRENT UNSAVED SB3');
        await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeProjectStatus).toBe('submitted'));
        expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly).toBe(true);
    });

    test('prevents a second Submit while one is in flight', async () => {
        let resolveSubmission;
        const adapter = createAdapter({
            submitProject: jest.fn(() => new Promise(resolve => {
                resolveSubmission = resolve;
            }))
        });
        mountComponent({session: buildSession(), adapter});

        const first = global.__lastSubmissionProbeProps.onSubmitProject();
        await expect(global.__lastSubmissionProbeProps.onSubmitProject()).rejects.toThrow('already in progress');
        await waitFor(() => expect(adapter.submitProject).toHaveBeenCalledTimes(1));
        resolveSubmission({
            success: true,
            data: {
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                working_version_ref: 'SCR-DEV-VER-4',
                status: 'submitted'
            }
        });
        await first;
    });

    test('a submission failure is exposed without changing the project status', async () => {
        const adapter = createAdapter({submitProject: jest.fn(() => Promise.reject(new Error('failed')))});
        mountComponent({session: buildSession(), adapter});

        await expect(global.__lastSubmissionProbeProps.onSubmitProject()).rejects.toThrow('failed');
        await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeSubmissionReviewStatus.submissionFailed)
            .toBe(true));
        expect(global.__lastSubmissionProbeProps.kidscodeProjectStatus).toBe('draft');
    });

    test('review mode loads only the exact submitted version into the VM', async () => {
        const session = buildSession({
            role: 'tutor',
            launch_type: 'review',
            project: {
                project_ref: 'SCR-PROJ-TEST',
                title: 'Test Project',
                project_type: 'independent',
                status: 'submitted'
            },
            review: {
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                submitted_at: '2026-08-11T12:00:00Z'
            }
        });
        const adapter = createAdapter({
            loadSubmission: jest.fn(() => Promise.resolve({
                project_ref: 'SCR-PROJ-TEST',
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                submitted_at: '2026-08-11T12:00:00Z',
                status: 'submitted',
                sb3: 'EXACT SUBMITTED SB3'
            }))
        });
        mountComponent({session, adapter});

        await waitFor(() => expect(vm.loadProject).toHaveBeenCalledWith('EXACT SUBMITTED SB3'));
        expect(adapter.loadSubmission).toHaveBeenCalledWith({
            submissionRef: 'SCR-SUB-1',
            workspaceAccessToken: session.workspace_access_token
        });
        expect(global.__lastSubmissionProbeProps.kidscodeReviewMode).toBe(true);
        expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly).toBe(true);
    });

    test('a mismatched submitted version is blocked and never loaded', async () => {
        const session = buildSession({
            role: 'tutor',
            launch_type: 'review',
            review: {
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-EXPECTED',
                submitted_at: '2026-08-11T12:00:00Z'
            }
        });
        const adapter = createAdapter({
            loadSubmission: jest.fn(() => Promise.resolve({
                project_ref: 'SCR-PROJ-TEST',
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-WRONG',
                sb3: 'WRONG SB3'
            }))
        });
        mountComponent({session, adapter});

        await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeWorkspaceState)
            .toBe(KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED));
        expect(vm.loadProject).not.toHaveBeenCalled();
    });

    test('a corrupted submitted file gets a dedicated blocking state with no working-project fallback', async () => {
        const session = buildSession({
            role: 'tutor',
            launch_type: 'review',
            review: {
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                submitted_at: '2026-08-11T12:00:00Z'
            }
        });
        vm.loadProject.mockRejectedValue(new Error('corrupt'));
        const adapter = createAdapter({
            loadSubmission: jest.fn(() => Promise.resolve({
                project_ref: 'SCR-PROJ-TEST',
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                sb3: 'CORRUPT'
            }))
        });
        mountComponent({session, adapter});

        await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeWorkspaceState)
            .toBe(KidscodeWorkspaceState.CORRUPTED_SUBMISSION));
        expect(adapter.loadSubmission).toHaveBeenCalledTimes(1);
    });

    test('Approve and Request Changes send the exact version being reviewed', async () => {
        const session = buildSession({
            role: 'tutor',
            launch_type: 'review',
            project: {
                project_ref: 'SCR-PROJ-TEST', title: 'Test', project_type: 'independent', status: 'submitted'
            },
            review: {
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                submitted_at: '2026-08-11T12:00:00Z'
            }
        });
        const adapter = createAdapter({
            loadSubmission: jest.fn(() => Promise.resolve({
                project_ref: 'SCR-PROJ-TEST',
                submission_ref: 'SCR-SUB-1',
                submitted_version_ref: 'SCR-SUB-VER-1',
                status: 'submitted',
                sb3: 'SB3'
            })),
            requestChanges: jest.fn(() => Promise.resolve({
                success: true,
                data: {
                    status: 'changes_requested',
                    feedback: 'Add a loop.'
                }
            })),
            approveSubmission: jest.fn(() => Promise.resolve({
                success: true,
                data: {status: 'approved'}
            }))
        });
        mountComponent({session, adapter});
        await waitFor(() => expect(vm.loadProject).toHaveBeenCalled());

        await global.__lastSubmissionProbeProps.onRequestChanges('Add a loop.');
        expect(adapter.requestChanges).toHaveBeenCalledWith({
            submissionRef: 'SCR-SUB-1',
            submittedVersionRef: 'SCR-SUB-VER-1',
            workspaceAccessToken: session.workspace_access_token,
            feedback: 'Add a loop.'
        });
        await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeProjectStatus)
            .toBe('changes_requested'));

        // A fresh submitted review can also be approved; the exact identifiers are mandatory.
        const approveAdapter = createAdapter({
            loadSubmission: adapter.loadSubmission,
            approveSubmission: jest.fn(() => Promise.resolve({success: true, data: {status: 'approved'}}))
        });
        mountComponent({session, adapter: approveAdapter});
        await waitFor(() => expect(approveAdapter.loadSubmission).toHaveBeenCalled());
        await global.__lastSubmissionProbeProps.onApproveSubmission();
        expect(approveAdapter.approveSubmission).toHaveBeenCalledWith({
            submissionRef: 'SCR-SUB-1',
            submittedVersionRef: 'SCR-SUB-VER-1',
            workspaceAccessToken: session.workspace_access_token
        });
    });
});
