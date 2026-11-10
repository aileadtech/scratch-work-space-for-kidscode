import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';

import {useKidscodeWorkspaceSession} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import KidscodeWorkspaceLaunchHOC from '../../../src/lib/kidscode-workspace-launch-hoc.jsx';
import {
    KidscodeLaunchType,
    createDevelopmentMockLaunchResolver
} from '../../../src/lib/kidscode-workspace-launch';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';
import log from '../../../src/lib/log';

const LaunchProbe = props => {
    const session = useKidscodeWorkspaceSession();
    return (
        <div>
            <span data-testid="workspace-state">{props.kidscodeWorkspaceState || 'ready'}</span>
            <span data-testid="project-title">{props.projectTitle}</span>
            <span data-testid="student-name">{props.kidscodeStudentName}</span>
            <span data-testid="launch-type">{session ? session.launch_type : 'none'}</span>
            <span data-testid="assignment">{session && session.assignment ? 'present' : 'null'}</span>
        </div>
    );
};

const WorkspaceLaunch = KidscodeWorkspaceLaunchHOC(LaunchProbe);

const renderLaunch = (launchToken, launchResolver = createDevelopmentMockLaunchResolver({
    delay: 0,
    environment: 'test'
})) => {
    const search = launchToken ? `?launch=${launchToken}` : '';
    const launchHistory = {
        state: null,
        replaceState: jest.fn()
    };
    const launchLocation = {
        href: `http://localhost:8601/${search}`,
        search
    };
    const renderResult = render(
        <WorkspaceLaunch
            launchHistory={launchHistory}
            launchLocation={launchLocation}
            launchResolver={launchResolver}
        />
    );
    return {...renderResult, launchHistory};
};

describe('Kidscode workspace launch session', () => {
    test('shows loading before exposing the resolved lesson session', async () => {
        const {launchHistory} = renderLaunch('demo-lesson');

        expect(screen.getByTestId('workspace-state').textContent).toBe(KidscodeWorkspaceState.LOADING_PROJECT);
        await waitFor(() => expect(screen.getByTestId('workspace-state').textContent).toBe('ready'));
        expect(screen.getByTestId('project-title').textContent).toBe('Make the Cat Walk');
        expect(screen.getByTestId('student-name').textContent).toBe('Adewale');
        expect(screen.getByTestId('launch-type').textContent).toBe(KidscodeLaunchType.EXISTING_LESSON);
        expect(launchHistory.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    test('exposes one validated independent session with nullable lesson context', async () => {
        renderLaunch('demo-independent');

        await waitFor(() => expect(screen.getByTestId('workspace-state').textContent).toBe('ready'));
        expect(screen.getByTestId('project-title').textContent).toBe('My Space Animation');
        expect(screen.getByTestId('student-name').textContent).toBe('Adewale');
        expect(screen.getByTestId('launch-type').textContent).toBe(KidscodeLaunchType.EXISTING_INDEPENDENT);
        expect(screen.getByTestId('assignment').textContent).toBe('null');
    });

    test.each([
        ['demo-expired', KidscodeWorkspaceState.SESSION_EXPIRED],
        ['demo-invalid', KidscodeWorkspaceState.ACCESS_BLOCKED],
        ['demo-denied', KidscodeWorkspaceState.ACCESS_BLOCKED],
        ['demo-offline', KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST]
    ])('blocks the editor for %s', async (launchToken, expectedState) => {
        const {launchHistory} = renderLaunch(launchToken);

        await waitFor(() => expect(screen.getByTestId('workspace-state').textContent).toBe(expectedState));
        expect(screen.getByTestId('launch-type').textContent).toBe('none');
        expect(launchHistory.replaceState).not.toHaveBeenCalled();
    });

    test('blocks a missing launch token without calling the resolver', async () => {
        const launchResolver = jest.fn();
        renderLaunch(null, launchResolver);

        await waitFor(() => expect(screen.getByTestId('workspace-state').textContent)
            .toBe(KidscodeWorkspaceState.ACCESS_BLOCKED));
        expect(launchResolver).not.toHaveBeenCalled();
    });

    test('blocks a resolver response with an unsupported launch type', async () => {
        const validResponse = await createDevelopmentMockLaunchResolver({delay: 0, environment: 'test'})(
            'demo-lesson'
        );
        const launchResolver = jest.fn().mockResolvedValue({
            ...validResponse,
            data: {
                ...validResponse.data,
                launch_type: 'unsupported_launch'
            }
        });
        renderLaunch('custom-token', launchResolver);

        await waitFor(() => expect(screen.getByTestId('workspace-state').textContent)
            .toBe(KidscodeWorkspaceState.ACCESS_BLOCKED));
        expect(screen.getByTestId('launch-type').textContent).toBe('none');
    });

    describe('launch failure diagnostics', () => {
        const SECRET_LAUNCH_TOKEN = 'SECRET_LAUNCH_TOKEN_MUST_NOT_BE_LOGGED';
        let warnSpy;

        beforeEach(() => {
            warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        const loggedText = () => JSON.stringify(warnSpy.mock.calls);

        test('logs the rejection code, without the launch token, when the launch is blocked', async () => {
            const launchResolver = jest.fn().mockResolvedValue({
                success: false,
                error: {code: 'INVALID_LAUNCH_SESSION', message: 'This workspace launch is invalid.'}
            });
            renderLaunch(SECRET_LAUNCH_TOKEN, launchResolver);

            await waitFor(() => expect(screen.getByTestId('workspace-state').textContent)
                .toBe(KidscodeWorkspaceState.ACCESS_BLOCKED));
            expect(warnSpy).toHaveBeenCalledWith(
                'KidscodeWorkspaceLaunch.resolveLaunch: launch rejected',
                {code: 'INVALID_LAUNCH_SESSION', message: 'This workspace launch is invalid.'}
            );
            expect(loggedText()).not.toContain(SECRET_LAUNCH_TOKEN);
        });

        test('logs the underlying error, without the launch token, on connection lost', async () => {
            const launchResolver = jest.fn()
                .mockRejectedValue(new Error('The Workspace launch resolver is not configured.'));
            renderLaunch(SECRET_LAUNCH_TOKEN, launchResolver);

            await waitFor(() => expect(screen.getByTestId('workspace-state').textContent)
                .toBe(KidscodeWorkspaceState.LAUNCH_CONNECTION_LOST));
            expect(warnSpy).toHaveBeenCalledWith(
                'KidscodeWorkspaceLaunch.resolveLaunch: launch could not be resolved',
                {name: 'Error', message: 'The Workspace launch resolver is not configured.'}
            );
            expect(loggedText()).not.toContain(SECRET_LAUNCH_TOKEN);
        });
    });
});
