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

    describe('real tutor review session (role: tutor, mode: read_only)', () => {
        // Matches the real backend's ScratchWorkspaceLaunchController::resolveReviewSession shape:
        // no project/student/return_to/launch_type at all, only role/mode/review_access_token/
        // submission_ref/submission/permissions.
        const buildRealTutorSession = overrides => ({
            session_ref: 'SCR-SESSION-REALTUTOR',
            expires_at: '2099-08-10T15:00:00Z',
            role: 'tutor',
            mode: 'read_only',
            review_access_token: 'REAL_REVIEW_TOKEN_ABC123',
            submission_ref: 'SCR-SUB-REAL001',
            submission: {
                submission_ref: 'SCR-SUB-REAL001',
                project_ref: 'SCR-PROJ-REAL',
                project_title: 'Make the Cat Walk',
                student_ref: 'STU-REF-001',
                version_ref: 'SCR-SUB-VER-REAL001',
                status: 'submitted',
                submitted_at: '2026-08-18T10:00:00Z'
            },
            permissions: {
                can_edit: false,
                can_save: false,
                can_rename: false,
                can_duplicate: false,
                can_delete: false,
                can_submit: false,
                can_review: false
            },
            ...overrides
        });

        test('loads the exact immutable submitted .sb3 using only the review token, not a project_ref', async () => {
            const session = buildRealTutorSession();
            const adapter = createAdapter({
                loadSubmission: jest.fn(() => Promise.resolve({
                    submission_ref: 'SCR-SUB-REAL001',
                    submitted_version_ref: 'SCR-SUB-VER-REAL001',
                    sb3: 'EXACT REAL SUBMITTED SB3'
                }))
            });
            mountComponent({session, adapter});

            await waitFor(() => expect(vm.loadProject).toHaveBeenCalledWith('EXACT REAL SUBMITTED SB3'));
            // Only submission_ref/review_access_token are sent — no project_ref anywhere in the call,
            // and the student's workspace_access_token is never used for a tutor session.
            expect(adapter.loadSubmission).toHaveBeenCalledWith({
                submissionRef: 'SCR-SUB-REAL001',
                workspaceAccessToken: 'REAL_REVIEW_TOKEN_ABC123'
            });
            expect(global.__lastSubmissionProbeProps.kidscodeReviewMode).toBe(true);
            expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly).toBe(true);
        });

        test('a mismatched submission_ref (X-Scratch-Submission-Ref) fails closed without loading anything', async () => {
            const session = buildRealTutorSession();
            const adapter = createAdapter({
                loadSubmission: jest.fn(() => Promise.resolve({
                    submission_ref: 'SCR-SUB-WRONG',
                    submitted_version_ref: 'SCR-SUB-VER-REAL001',
                    sb3: 'WRONG SB3'
                }))
            });
            mountComponent({session, adapter});

            await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeWorkspaceState)
                .toBe(KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED));
            expect(vm.loadProject).not.toHaveBeenCalled();
        });

        test('a mismatched version_ref against the launch response also fails closed', async () => {
            const session = buildRealTutorSession();
            const adapter = createAdapter({
                loadSubmission: jest.fn(() => Promise.resolve({
                    submission_ref: 'SCR-SUB-REAL001',
                    submitted_version_ref: 'SCR-SUB-VER-DIFFERENT',
                    sb3: 'WRONG VERSION SB3'
                }))
            });
            mountComponent({session, adapter});

            await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeWorkspaceState)
                .toBe(KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED));
            expect(vm.loadProject).not.toHaveBeenCalled();
        });

        test('reflects the status already carried by the launch response, not a fabricated one', async () => {
            const session = buildRealTutorSession();
            const adapter = createAdapter({
                loadSubmission: jest.fn(() => Promise.resolve({
                    submission_ref: 'SCR-SUB-REAL001',
                    submitted_version_ref: 'SCR-SUB-VER-REAL001',
                    sb3: 'SB3'
                }))
            });
            mountComponent({session, adapter});

            await waitFor(() => expect(vm.loadProject).toHaveBeenCalled());
            expect(global.__lastSubmissionProbeProps.kidscodeProjectStatus).toBe('submitted');
            expect(global.__lastSubmissionProbeProps.kidscodeReviewFeedback).toBeNull();
        });

        test('cannot Submit — rejects without dereferencing a project that does not exist on this session', async () => {
            const session = buildRealTutorSession();
            const adapter = createAdapter({loadSubmission: jest.fn(() => Promise.resolve({
                submission_ref: 'SCR-SUB-REAL001', submitted_version_ref: 'SCR-SUB-VER-REAL001', sb3: 'SB3'
            }))});
            mountComponent({session, adapter});

            await expect(global.__lastSubmissionProbeProps.onSubmitProject()).rejects.toThrow();
            expect(adapter.submitProject).not.toHaveBeenCalled();
        });

        test('Approve and Request Changes reject immediately — never reach the adapter, never crash', async () => {
            const session = buildRealTutorSession();
            const adapter = createAdapter({loadSubmission: jest.fn(() => Promise.resolve({
                submission_ref: 'SCR-SUB-REAL001', submitted_version_ref: 'SCR-SUB-VER-REAL001', sb3: 'SB3'
            }))});
            mountComponent({session, adapter});
            await waitFor(() => expect(vm.loadProject).toHaveBeenCalled());

            await expect(global.__lastSubmissionProbeProps.onApproveSubmission()).rejects.toThrow(
                'not available from the Workspace'
            );
            await expect(global.__lastSubmissionProbeProps.onRequestChanges('x')).rejects.toThrow(
                'not available from the Workspace'
            );
            expect(adapter.approveSubmission).not.toHaveBeenCalled();
            expect(adapter.requestChanges).not.toHaveBeenCalled();
        });
    });

    describe('kidscodeProjectReadOnly per status (feeds Blockly readOnly and the VM mutation guard)', () => {
        // kidscodeProjectReadOnly is what components/gui/gui.jsx passes as the Blocks `readOnly`
        // prop (containers/blocks.jsx applies it via workspace.setIsReadOnly()) and what this HOC
        // itself feeds into applyKidscodeVmReadOnlyGuard below. This proves the status rules that
        // feed both: draft/changes_requested editable, submitted/approved/review read-only.
        test.each([
            ['draft', false],
            ['changes_requested', false],
            ['submitted', true],
            ['approved', true]
        ])('a %s Student session resolves kidscodeProjectReadOnly=%s', async (status, expectedReadOnly) => {
            const session = buildSession({project: {
                project_ref: 'SCR-PROJ-TEST', title: 'Test Project', project_type: 'independent', status
            }});
            mountComponent({session, adapter: createAdapter()});

            await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly)
                .toBe(expectedReadOnly));
        });

        test('a tutor review session (dev-fixture shape) resolves kidscodeProjectReadOnly=true', () => {
            const session = buildSession({
                role: 'tutor',
                launch_type: 'review',
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
                }))
            });
            mountComponent({session, adapter});

            expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly).toBe(true);
        });
    });

    describe('non-Blockly project-content lockdown (VM mutation guard + canManageFiles)', () => {
        test.each([
            ['draft', false, true],
            ['changes_requested', false, true],
            ['submitted', true, false],
            ['approved', true, false]
        ])(
            'a %s Student session: VM guard active=%s, canManageFiles=%s',
            async (status, expectGuardActive, expectCanManageFiles) => {
                const session = buildSession({project: {
                    project_ref: 'SCR-PROJ-TEST', title: 'Test Project', project_type: 'independent', status
                }});
                mountComponent({session, adapter: createAdapter()});

                await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly)
                    .toBe(expectGuardActive));
                expect(global.__lastSubmissionProbeProps.canManageFiles).toBe(expectCanManageFiles);

                // Sprite/costume/sound/backdrop/sprite-property mutation, proven via one
                // representative guarded VM method: wrapped with an own-property shadow while
                // locked (see kidscode-workspace-vm-read-only-guard.test.js for the full method
                // list and no-op behaviour), left as the real VirtualMachine.prototype method
                // otherwise — not invoked here when editable, since the real implementation needs a
                // loaded project/editingTarget this bare test VM doesn't have.
                expect(Object.prototype.hasOwnProperty.call(vm, 'postSpriteInfo')).toBe(expectGuardActive);
                if (expectGuardActive) {
                    expect(() => vm.postSpriteInfo({x: 1})).not.toThrow();
                }
            }
        );

        test('a real tutor review session (role: tutor, mode: read_only) activates the VM guard and hides File management', () => {
            const session = {
                session_ref: 'SCR-SESSION-REALTUTOR',
                expires_at: '2099-08-10T15:00:00Z',
                role: 'tutor',
                mode: 'read_only',
                review_access_token: 'REAL_REVIEW_TOKEN_ABC123',
                submission_ref: 'SCR-SUB-REAL001',
                submission: {
                    submission_ref: 'SCR-SUB-REAL001',
                    project_ref: 'SCR-PROJ-REAL',
                    version_ref: 'SCR-SUB-VER-REAL001',
                    status: 'submitted'
                },
                permissions: {
                    can_edit: false,
                    can_save: false,
                    can_rename: false,
                    can_duplicate: false,
                    can_delete: false,
                    can_submit: false,
                    can_review: false
                }
            };
            const adapter = createAdapter({loadSubmission: jest.fn(() => Promise.resolve({
                submission_ref: 'SCR-SUB-REAL001', submitted_version_ref: 'SCR-SUB-VER-REAL001', sb3: 'SB3'
            }))});
            mountComponent({session, adapter});

            expect(global.__lastSubmissionProbeProps.canManageFiles).toBe(false);
        });

        test('sprite add/delete/duplicate are blocked while read-only, without throwing', async () => {
            const session = buildSession({project: {
                project_ref: 'SCR-PROJ-TEST', title: 'Test Project', project_type: 'independent', status: 'submitted'
            }});
            mountComponent({session, adapter: createAdapter()});
            await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly).toBe(true));

            expect(() => vm.addSprite('{}')).not.toThrow();
            expect(() => vm.deleteSprite('id')).not.toThrow();
            expect(() => vm.duplicateSprite('id')).not.toThrow();
        });

        test('Green Flag / Stop remain fully functional while read-only (playback is untouched)', async () => {
            const session = buildSession({project: {
                project_ref: 'SCR-PROJ-TEST', title: 'Test Project', project_type: 'independent', status: 'submitted'
            }});
            mountComponent({session, adapter: createAdapter()});
            await waitFor(() => expect(global.__lastSubmissionProbeProps.kidscodeProjectReadOnly).toBe(true));

            expect(typeof vm.greenFlag).toBe('function');
            expect(typeof vm.stopAll).toBe('function');
            expect(() => vm.greenFlag()).not.toThrow();
            expect(() => vm.stopAll()).not.toThrow();
        });
    });
});
