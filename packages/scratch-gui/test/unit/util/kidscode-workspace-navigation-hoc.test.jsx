import React, {useCallback, useState} from 'react';
import {fireEvent, screen, waitFor} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import ReactModal from 'react-modal';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {KidscodeWorkspaceSessionProvider} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import KidscodeWorkspaceNavigationHOC
    from '../../../src/lib/kidscode-workspace-navigation/kidscode-workspace-navigation-hoc.jsx';
import {createKidscodeMockNavigationTransport}
    from '../../../src/lib/kidscode-workspace-navigation/kidscode-workspace-navigation-contract';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';
import KidscodeNavigationConfirmDialog
    from '../../../src/components/kidscode-menu-bar/kidscode-navigation-confirm-dialog.jsx';

// Mirrors how components/gui/gui.jsx actually consumes these props: the HOC exposes confirm state
// and handlers, but never renders the dialog itself (see kidscode-workspace-navigation-hoc.jsx for
// why — <IntlProvider> lives inside GUI's own render tree, not above this HOC).
const NavigationProbe = props => {
    const handleTriggerAction = useCallback(
        () => props.onWorkspaceStateAction(props.triggerActionState),
        [props]
    );

    return (
        <div>
            <span data-testid="workspace-state">{props.kidscodeWorkspaceState}</span>
            <button onClick={props.onBackToKidscode}>Back to Kidscode</button>
            <button onClick={props.onReturnToLesson}>Return to Lesson</button>
            <button onClick={props.onReturnToMyScratchProjects}>Return to Projects</button>
            <button onClick={props.onReturnToTutorReview}>Return to Tutor Review</button>
            {props.triggerActionState && (
                <button onClick={handleTriggerAction}>
                    Trigger action
                </button>
            )}
            {props.kidscodeNavigationConfirm && (
                <KidscodeNavigationConfirmDialog
                    reason={props.kidscodeNavigationConfirm.reason}
                    onLeaveWithoutSaving={props.onKidscodeNavigationLeaveWithoutSaving}
                    onSaveAndLeave={props.onKidscodeNavigationSaveAndLeave}
                    onStay={props.onKidscodeNavigationStay}
                />
            )}
        </div>
    );
};

const WrappedNavigation = KidscodeWorkspaceNavigationHOC(NavigationProbe);

// projectChanged/loadingState stay inert (false / SHOWING_WITH_ID) so resolveKidscodeWorkspaceState
// passes the harness-controlled kidscodeWorkspaceState prop straight through unchanged; the harness
// simulates state transitions by setting that prop directly rather than by driving real VM changes.
const store = configureStore()({
    locales: {isRtl: false},
    scratchGui: {
        projectChanged: false,
        projectState: {loadingState: 'SHOWING_WITH_ID'}
    }
});

const NavigationHarness = ({
    initialWorkspaceState = null,
    saveOutcome = 'success',
    saveSpy = jest.fn(),
    session = null,
    ...hocProps
}) => {
    const [workspaceState, setWorkspaceState] = useState(initialWorkspaceState);
    const handleSaveProject = useCallback(() => {
        saveSpy();
        setWorkspaceState(KidscodeWorkspaceState.SAVING);
        setTimeout(() => {
            setWorkspaceState(saveOutcome === 'success' ?
                KidscodeWorkspaceState.SAVED :
                KidscodeWorkspaceState.SAVE_FAILED);
        }, 0);
    }, [saveOutcome, saveSpy]);

    return (
        <Provider store={store}>
            <KidscodeWorkspaceSessionProvider session={session}>
                <WrappedNavigation
                    {...hocProps}
                    kidscodeWorkspaceState={workspaceState}
                    onSaveProject={handleSaveProject}
                />
            </KidscodeWorkspaceSessionProvider>
        </Provider>
    );
};

const buildSession = returnTo => ({
    session_ref: 'SCR-SESSION-TEST',
    expires_at: '2099-08-10T15:00:00Z',
    workspace_access_token: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST',
    role: 'student',
    student: {display_name: 'Adewale'},
    project: {project_ref: 'SCR-PROJ-TEST', title: 'Test project', project_type: 'independent', status: 'draft'},
    assignment: null,
    course: null,
    lesson: null,
    launch_type: 'existing_independent',
    return_to: returnTo
});

describe('Kidscode workspace navigation HOC', () => {
    let modalAppElement;

    beforeAll(() => {
        modalAppElement = document.createElement('div');
        document.body.appendChild(modalAppElement);
        ReactModal.setAppElement(modalAppElement);
    });

    afterAll(() => {
        document.body.removeChild(modalAppElement);
    });

    test('navigates immediately when the project is Saved', () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.SAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));

        expect(transport.calls).toEqual(['/scratch-projects']);
    });

    test('opens a confirmation instead of navigating while Unsaved', () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.UNSAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                session={buildSession({type: 'lesson', url: '/lessons'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Lesson'}));

        expect(transport.calls).toEqual([]);
        expect(screen.getByRole('dialog', {name: 'Leave Workspace?'})).toBeTruthy();
        expect(screen.getByText(/have not been saved yet/)).toBeTruthy();
    });

    test('Stay cancels the pending navigation without saving', () => {
        const transport = createKidscodeMockNavigationTransport();
        const saveSpy = jest.fn();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.UNSAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                saveSpy={saveSpy}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));
        fireEvent.click(screen.getByRole('button', {name: 'Stay'}));

        expect(transport.calls).toEqual([]);
        expect(saveSpy).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeFalsy();
    });

    test('Save and Leave reuses the Phase 4 manual save and navigates once it succeeds', async () => {
        const transport = createKidscodeMockNavigationTransport();
        const saveSpy = jest.fn();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.UNSAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                saveSpy={saveSpy}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));
        fireEvent.click(screen.getByRole('button', {name: 'Save and Leave'}));

        expect(saveSpy).toHaveBeenCalledTimes(1);
        expect(transport.calls).toEqual([]);
        await waitFor(() => expect(transport.calls).toEqual(['/scratch-projects']));
        expect(screen.queryByRole('dialog')).toBeFalsy();
    });

    test('Save and Leave stays in the Workspace and offers retry when the save fails', async () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.UNSAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                saveOutcome="failure"
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));
        fireEvent.click(screen.getByRole('button', {name: 'Save and Leave'}));

        await waitFor(() => expect(screen.getByText(/last save did not work/)).toBeTruthy());
        expect(transport.calls).toEqual([]);
    });

    test('Leave without saving navigates immediately without saving', () => {
        const transport = createKidscodeMockNavigationTransport();
        const saveSpy = jest.fn();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.SAVE_FAILED}
                kidscodeWorkspaceNavigationTransport={transport}
                saveSpy={saveSpy}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));
        fireEvent.click(screen.getByRole('button', {name: 'Leave without saving'}));

        expect(saveSpy).not.toHaveBeenCalled();
        expect(transport.calls).toEqual(['/scratch-projects']);
    });

    test('waits out an in-flight Saving before navigating, without starting a second save', () => {
        const transport = createKidscodeMockNavigationTransport();
        const saveSpy = jest.fn();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.SAVING}
                kidscodeWorkspaceNavigationTransport={transport}
                saveSpy={saveSpy}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));

        expect(screen.getByText(/still saving/)).toBeTruthy();
        expect(transport.calls).toEqual([]);
        expect(saveSpy).not.toHaveBeenCalled();
    });

    test('rejects an unsafe or unconfigured destination even when the project is Saved', () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.SAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                // eslint-disable-next-line no-script-url
                session={buildSession({type: 'projects', url: 'javascript:alert(1)'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));

        expect(transport.calls).toEqual([]);
    });

    test('an arbitrary query-parameter destination in the browser URL has no effect', () => {
        const originalLocation = window.location.href;
        window.history.replaceState(null, '', '/?return=https://evil.example.com');

        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.SAVED}
                kidscodeWorkspaceNavigationTransport={transport}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Projects'}));

        expect(transport.calls).toEqual(['/scratch-projects']);
        window.history.replaceState(null, '', originalLocation);
    });

    test('Back to Kidscode and Return to Tutor Review use the same session destination', () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                initialWorkspaceState={KidscodeWorkspaceState.SAVED}
                kidscodeReviewMode
                kidscodeWorkspaceNavigationTransport={transport}
                session={buildSession({type: 'review', url: '/tutor/submissions'})}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Return to Tutor Review'}));
        expect(transport.calls).toEqual(['/tutor/submissions']);

        fireEvent.click(screen.getByRole('button', {name: 'Back to Kidscode'}));
        expect(transport.calls).toEqual(['/tutor/submissions', '/tutor/submissions']);
    });

    test('recovers Session Expired using the injected recovery URL when there is no session', () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                kidscodeWorkspaceNavigationTransport={transport}
                kidscodeWorkspaceRecoveryUrl="/"
                session={null}
                triggerActionState={KidscodeWorkspaceState.SESSION_EXPIRED}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Trigger action'}));

        expect(transport.calls).toEqual(['/']);
    });

    test('leaves Session Expired blocked when no recovery URL is configured', () => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                kidscodeWorkspaceNavigationTransport={transport}
                kidscodeWorkspaceRecoveryUrl={null}
                session={null}
                triggerActionState={KidscodeWorkspaceState.SESSION_EXPIRED}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Trigger action'}));

        expect(transport.calls).toEqual([]);
    });

    test.each([
        KidscodeWorkspaceState.PROJECT_DELETED,
        KidscodeWorkspaceState.CORRUPTED_PROJECT,
        KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED,
        KidscodeWorkspaceState.CORRUPTED_SUBMISSION
    ])('recovers the blocking state %s using the current session return_to', blockingState => {
        const transport = createKidscodeMockNavigationTransport();
        renderWithIntl(
            <NavigationHarness
                kidscodeWorkspaceNavigationTransport={transport}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
                triggerActionState={blockingState}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Trigger action'}));

        expect(transport.calls).toEqual(['/scratch-projects']);
    });

    test('falls through to the existing retry handler for states it does not own', () => {
        const transport = createKidscodeMockNavigationTransport();
        const onWorkspaceStateAction = jest.fn();
        renderWithIntl(
            <NavigationHarness
                kidscodeWorkspaceNavigationTransport={transport}
                onWorkspaceStateAction={onWorkspaceStateAction}
                session={buildSession({type: 'projects', url: '/scratch-projects'})}
                triggerActionState={KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Trigger action'}));

        expect(transport.calls).toEqual([]);
        expect(onWorkspaceStateAction).toHaveBeenCalledWith(KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST);
    });
});
