import React from 'react';
import ReactModal from 'react-modal';
import {fireEvent, screen} from '@testing-library/react';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {
    KidscodeWorkspaceBlockingState,
    KidscodeWorkspaceStatus
} from '../../../src/components/kidscode-menu-bar/kidscode-workspace-state.jsx';
import {
    KidscodeWorkspaceState,
    resolveKidscodeWorkspaceState
} from '../../../src/lib/kidscode-workspace-state';

describe('Kidscode workspace state', () => {
    let modalAppElement;

    beforeAll(() => {
        modalAppElement = document.createElement('div');
        document.body.appendChild(modalAppElement);
        ReactModal.setAppElement(modalAppElement);
    });

    afterAll(() => {
        document.body.removeChild(modalAppElement);
    });

    test.each([
        [KidscodeWorkspaceState.UNSAVED, 'Unsaved', 'status'],
        [KidscodeWorkspaceState.SAVING, 'Saving…', 'status'],
        [KidscodeWorkspaceState.SAVED, 'Saved', 'status'],
        [KidscodeWorkspaceState.SAVE_FAILED, 'Save failed', 'alert'],
        [KidscodeWorkspaceState.CONNECTION_LOST, 'Connection lost', 'alert']
    ])('renders the %s menu-bar state', (workspaceState, label, role) => {
        renderWithIntl(<KidscodeWorkspaceStatus workspaceState={workspaceState} />);

        expect(screen.getByRole(role)).toBeTruthy();
        expect(screen.getByText(label)).toBeTruthy();
    });

    test('exposes an error recovery callback without changing state', () => {
        const onAction = jest.fn();
        renderWithIntl(
            <KidscodeWorkspaceStatus
                workspaceState={KidscodeWorkspaceState.SAVE_FAILED}
                onAction={onAction}
            />
        );

        fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
        expect(onAction).toHaveBeenCalledWith(KidscodeWorkspaceState.SAVE_FAILED);
        expect(screen.getByText('Save failed')).toBeTruthy();
    });

    test('reuses the Scratch loader for the loading-project state', () => {
        renderWithIntl(
            <KidscodeWorkspaceBlockingState workspaceState={KidscodeWorkspaceState.LOADING_PROJECT} />
        );

        expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
        expect(screen.getByText('Loading Project')).toBeTruthy();
    });

    test.each([
        [
            KidscodeWorkspaceState.SESSION_EXPIRED,
            'Session Expired',
            'Return to Kidscode'
        ],
        [
            KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST,
            'Connection Lost',
            'Try again'
        ],
        [
            KidscodeWorkspaceState.CORRUPTED_PROJECT,
            'Project could not be opened',
            'Return to My Scratch Projects'
        ],
        [
            KidscodeWorkspaceState.PROJECT_DELETED,
            'Draft Deleted',
            'Return to Kidscode'
        ],
        [
            KidscodeWorkspaceState.REVIEW_ACCESS_BLOCKED,
            'Submitted project unavailable',
            'Return to Kidscode'
        ],
        [
            KidscodeWorkspaceState.CORRUPTED_SUBMISSION,
            'Submitted project could not be opened',
            'Return to Kidscode'
        ]
    ])('renders the blocking %s state with an action seam', (workspaceState, label, actionLabel) => {
        const onAction = jest.fn();
        renderWithIntl(
            <KidscodeWorkspaceBlockingState
                workspaceState={workspaceState}
                onAction={onAction}
            />
        );

        expect(screen.getByRole('alertdialog', {name: label})).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: actionLabel}));
        expect(onAction).toHaveBeenCalledWith(workspaceState);
        expect(screen.getByRole('alertdialog', {name: label})).toBeTruthy();
    });

    test('renders invalid or denied launches as a blocking state without an editor action', () => {
        renderWithIntl(
            <KidscodeWorkspaceBlockingState
                workspaceState={KidscodeWorkspaceState.ACCESS_BLOCKED}
                onAction={jest.fn()}
            />
        );

        expect(screen.getByRole('alertdialog', {name: 'Workspace Access Blocked'})).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });

    test('derives dirty and updating states without inventing a saved state', () => {
        expect(resolveKidscodeWorkspaceState({
            projectChanged: true,
            isUpdating: false
        })).toBe(KidscodeWorkspaceState.UNSAVED);
        expect(resolveKidscodeWorkspaceState({
            workspaceState: KidscodeWorkspaceState.SAVED,
            projectChanged: true,
            isUpdating: false
        })).toBe(KidscodeWorkspaceState.UNSAVED);
        expect(resolveKidscodeWorkspaceState({
            projectChanged: true,
            isUpdating: true
        })).toBe(KidscodeWorkspaceState.SAVING);
        expect(resolveKidscodeWorkspaceState({
            projectChanged: false,
            isUpdating: false
        })).toBeUndefined();
    });
});
