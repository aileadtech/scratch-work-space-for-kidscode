import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';

import {useKidscodeWorkspaceSession} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import KidscodeWorkspaceLaunchHOC from '../../../src/lib/kidscode-workspace-launch-hoc.jsx';
import {
    KidscodeLaunchType,
    createDevelopmentMockLaunchResolver
} from '../../../src/lib/kidscode-workspace-launch';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';

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
});
