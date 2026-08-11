import React from 'react';
import {fireEvent, waitFor} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import ReactModal from 'react-modal';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {MenuRefProvider} from '../../../src/contexts/menu-ref-context.jsx';
import {KidscodeWorkspaceSessionProvider} from '../../../src/contexts/kidscode-workspace-session-context.jsx';
import {
    KidscodeProjectActionButtons,
    KidscodeProjectMenu
} from '../../../src/components/kidscode-menu-bar/kidscode-project-controls.jsx';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';

const mockDownloadProject = jest.fn();

jest.mock('../../../src/containers/sb3-downloader.jsx', () => function MockSB3Downloader ({children}) {
    return children('', mockDownloadProject);
});

const buildSession = status => ({
    session_ref: 'SCR-SESSION-TEST',
    expires_at: '2099-08-10T15:00:00Z',
    workspace_access_token: 'DEVELOPMENT_WORKSPACE_TOKEN_TEST',
    student: {display_name: 'Adewale'},
    project: {
        project_ref: 'SCR-PROJ-TEST',
        title: 'Original title',
        project_type: 'independent',
        status
    },
    assignment: null,
    course: null,
    lesson: null,
    launch_type: 'existing_independent',
    return_to: {type: 'projects', url: '/scratch-projects'}
});

describe('Kidscode project controls', () => {
    let modalAppElement;
    const store = configureStore()({
        locales: {
            isRtl: false
        }
    });

    const defaultCallback = jest.fn(() => Promise.resolve());
    const getSaveToComputerHandler = downloadProject => downloadProject;
    const getProjectMenu = ({session = null, ...props} = {}) => (
        <Provider store={store}>
            <MenuRefProvider>
                <KidscodeWorkspaceSessionProvider session={session}>
                    <KidscodeProjectMenu
                        // eslint-disable-next-line react/jsx-no-bind
                        getSaveToComputerHandler={getSaveToComputerHandler}
                        isRtl={false}
                        projectTitle="Original title"
                        onDeleteDraft={defaultCallback}
                        onDuplicateProject={defaultCallback}
                        onRenameProject={defaultCallback}
                        onReturnToLesson={defaultCallback}
                        onReturnToMyScratchProjects={defaultCallback}
                        {...props}
                    />
                </KidscodeWorkspaceSessionProvider>
            </MenuRefProvider>
        </Provider>
    );

    beforeEach(() => {
        mockDownloadProject.mockClear();
    });

    beforeAll(() => {
        modalAppElement = document.createElement('div');
        document.body.appendChild(modalAppElement);
        ReactModal.setAppElement(modalAppElement);
    });

    afterAll(() => {
        document.body.removeChild(modalAppElement);
    });

    test('lists every secondary project action', () => {
        const {getByRole, getByText} = renderWithIntl(getProjectMenu());

        fireEvent.click(getByRole('button', {name: 'Project menu'}));

        expect(getByText('Rename')).toBeTruthy();
        expect(getByText('Duplicate')).toBeTruthy();
        expect(getByText('Download .sb3')).toBeTruthy();
        expect(getByText('Delete draft')).toBeTruthy();
        expect(getByText('Return to lesson')).toBeTruthy();
        expect(getByText('Return to My Scratch Projects')).toBeTruthy();
    });

    test('downloads through Scratch SB3Downloader', () => {
        const {getByRole, getByText} = renderWithIntl(getProjectMenu());

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Download .sb3'));

        expect(mockDownloadProject).toHaveBeenCalledTimes(1);
    });

    test('renames once the adapter confirms, and preserves the title on cancel', async () => {
        const onRenameProject = jest.fn(() => Promise.resolve({title: 'Renamed project'}));
        const {getByRole, getByText, queryByRole} = renderWithIntl(getProjectMenu({onRenameProject}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Rename'));
        fireEvent.change(getByRole('textbox', {name: 'Project title'}), {
            target: {value: 'Renamed project'}
        });
        fireEvent.click(getByRole('button', {name: 'Rename'}));

        expect(onRenameProject).toHaveBeenCalledWith('Renamed project');
        // The dialog only closes after the adapter confirms the rename, not optimistically.
        await waitFor(() => expect(queryByRole('dialog')).toBeFalsy());

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Rename'));
        fireEvent.change(getByRole('textbox', {name: 'Project title'}), {
            target: {value: 'Cancelled title'}
        });
        fireEvent.click(getByRole('button', {name: 'Cancel'}));

        expect(onRenameProject).toHaveBeenCalledTimes(1);
        expect(queryByRole('dialog')).toBeFalsy();
    });

    test('a failed rename keeps the dialog open with an error instead of closing', async () => {
        const onRenameProject = jest.fn(() => Promise.reject(new Error('adapter rejected')));
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({onRenameProject}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Rename'));
        fireEvent.change(getByRole('textbox', {name: 'Project title'}), {
            target: {value: 'Renamed project'}
        });
        fireEvent.click(getByRole('button', {name: 'Rename'}));

        await waitFor(() => expect(getByRole('alert')).toBeTruthy());
        expect(getByRole('dialog')).toBeTruthy();
        // Still open and usable for a retry, rather than a dead end.
        expect(getByRole('button', {name: 'Rename'}).disabled).toBe(false);
    });

    test('the Rename confirm button is disabled for an empty or whitespace-only title', () => {
        const {getByRole, getByText} = renderWithIntl(getProjectMenu());

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Rename'));
        fireEvent.change(getByRole('textbox', {name: 'Project title'}), {
            target: {value: '   '}
        });

        expect(getByRole('button', {name: 'Rename'}).disabled).toBe(true);
    });

    test('requires confirmation before invoking delete draft; a failure leaves the project available to retry', async () => {
        const onDeleteDraft = jest.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('adapter rejected')))
            .mockImplementationOnce(() => Promise.resolve({project_ref: 'SCR-PROJ-TEST', deleted: true}));
        const {getByRole, getByText, queryByRole} = renderWithIntl(getProjectMenu({onDeleteDraft}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Delete draft'));
        fireEvent.click(getByRole('button', {name: 'Cancel'}));
        expect(onDeleteDraft).not.toHaveBeenCalled();

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Delete draft'));
        fireEvent.click(getByRole('button', {name: 'Delete draft'}));

        expect(onDeleteDraft).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(getByRole('alert')).toBeTruthy());
        expect(queryByRole('dialog')).toBeTruthy();

        fireEvent.click(getByRole('button', {name: 'Delete draft'}));
        expect(onDeleteDraft).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(queryByRole('dialog')).toBeFalsy());
    });

    test('duplicate opens a status dialog immediately and shows the new copy on success', async () => {
        const onDuplicateProject = jest.fn(() => Promise.resolve({
            project_ref: 'SCR-PROJ-NEW',
            title: 'Original title Copy'
        }));
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({onDuplicateProject}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Duplicate'));

        // The Project menu closes immediately (preventing a repeated click) while the request
        // is still in flight; the current Workspace never navigates away from the original.
        expect(onDuplicateProject).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(getByText(/Original title Copy/)).toBeTruthy());

        fireEvent.click(getByRole('button', {name: 'OK'}));
        await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeFalsy());
    });

    test('a failed duplicate shows an error with a retry', async () => {
        const onDuplicateProject = jest.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('adapter rejected')))
            .mockImplementationOnce(() => Promise.resolve({project_ref: 'SCR-PROJ-NEW', title: 'Copy'}));
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({onDuplicateProject}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Duplicate'));

        await waitFor(() => expect(getByRole('alert')).toBeTruthy());

        fireEvent.click(getByRole('button', {name: 'Try again'}));
        await waitFor(() => expect(onDuplicateProject).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(getByText(/Copy/)).toBeTruthy());
    });

    test('invokes the return-to callback seams', () => {
        const onReturnToLesson = jest.fn();
        const onReturnToMyScratchProjects = jest.fn();
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({
            onReturnToLesson,
            onReturnToMyScratchProjects
        }));

        const selectProjectAction = label => {
            fireEvent.click(getByRole('button', {name: 'Project menu'}));
            fireEvent.click(getByText(label));
        };

        selectProjectAction('Return to lesson');
        selectProjectAction('Return to My Scratch Projects');

        expect(onReturnToLesson).toHaveBeenCalledTimes(1);
        expect(onReturnToMyScratchProjects).toHaveBeenCalledTimes(1);
    });

    test('Rename and Delete draft are disabled for a non-draft project, but Duplicate stays available', () => {
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({session: buildSession('submitted')}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));

        expect(getByText('Rename').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Delete draft').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Duplicate').getAttribute('aria-disabled')).toBe('false');

        fireEvent.click(getByText('Rename'));
        expect(document.querySelector('[role="dialog"]')).toBeFalsy();
    });

    test('every project-management action is disabled once the project has been deleted', () => {
        const {getByRole, getByText} = renderWithIntl(
            getProjectMenu({workspaceState: KidscodeWorkspaceState.PROJECT_DELETED})
        );

        fireEvent.click(getByRole('button', {name: 'Project menu'}));

        expect(getByText('Rename').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Duplicate').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Delete draft').getAttribute('aria-disabled')).toBe('true');
    });

    test('menu actions are disabled while another project-management action is already in flight', () => {
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({
            projectManagementStatus: {isRenaming: true, isDuplicating: false, isDeleting: false, deleted: false}
        }));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));

        expect(getByText('Duplicate').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Delete draft').getAttribute('aria-disabled')).toBe('true');
    });

    test('review mode disables every project-management mutation including Duplicate', () => {
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({
            reviewMode: true,
            session: buildSession('submitted')
        }));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        expect(getByText('Rename').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Duplicate').getAttribute('aria-disabled')).toBe('true');
        expect(getByText('Delete draft').getAttribute('aria-disabled')).toBe('true');
    });

    test('invokes the permanent Save and Submit callback seams', () => {
        const onSaveProject = jest.fn();
        const onSubmitProject = jest.fn();
        const {getByRole} = renderWithIntl(
            <KidscodeProjectActionButtons
                onSaveProject={onSaveProject}
                onSubmitProject={onSubmitProject}
            />
        );

        fireEvent.click(getByRole('button', {name: 'Save project'}));
        fireEvent.click(getByRole('button', {name: 'Submit project'}));

        expect(onSaveProject).toHaveBeenCalledTimes(1);
        expect(onSubmitProject).toHaveBeenCalledTimes(1);
    });

    test('prevents a duplicate Save click while saving', () => {
        const onSaveProject = jest.fn();
        const {getByRole} = renderWithIntl(
            <KidscodeProjectActionButtons
                workspaceState={KidscodeWorkspaceState.SAVING}
                onSaveProject={onSaveProject}
                onSubmitProject={jest.fn()}
            />
        );

        const saveButton = getByRole('button', {name: 'Save project'});
        expect(saveButton.disabled).toBe(true);
        fireEvent.click(saveButton);
        expect(onSaveProject).not.toHaveBeenCalled();
    });

    test('Submitted and Approved are visibly read-only for student persistence and submission', () => {
        const firstRender = renderWithIntl(
            <KidscodeProjectActionButtons
                projectReadOnly
                projectStatus="submitted"
                onSaveProject={jest.fn()}
                onSubmitProject={jest.fn()}
            />
        );

        expect(firstRender.getByText('Submitted')).toBeTruthy();
        expect(firstRender.getByRole('button', {name: 'Save project'}).disabled).toBe(true);
        expect(firstRender.queryByRole('button', {name: 'Submit project'})).toBeFalsy();
        firstRender.unmount();

        const approvedRender = renderWithIntl(
            <KidscodeProjectActionButtons
                projectReadOnly
                projectStatus="approved"
                onSaveProject={jest.fn()}
                onSubmitProject={jest.fn()}
            />
        );
        expect(approvedRender.getByText('Approved')).toBeTruthy();
        expect(approvedRender.queryByRole('button', {name: 'Submit project'})).toBeFalsy();
    });

    test('Changes Requested exposes feedback, keeps Save enabled, and uses Resubmit', () => {
        const onSubmitProject = jest.fn();
        const {getByRole, getByText} = renderWithIntl(
            <Provider store={store}>
                <KidscodeProjectActionButtons
                    projectStatus="changes_requested"
                    reviewFeedback="Add a loop."
                    onSaveProject={jest.fn()}
                    onSubmitProject={onSubmitProject}
                />
            </Provider>
        );

        expect(getByText('Changes requested')).toBeTruthy();
        expect(getByRole('button', {name: 'Save project'}).disabled).toBe(false);
        fireEvent.click(getByRole('button', {name: 'View feedback'}));
        expect(getByText('Add a loop.')).toBeTruthy();
        fireEvent.click(getByRole('button', {name: 'OK'}));
        fireEvent.click(getByRole('button', {name: 'Resubmit project'}));
        expect(onSubmitProject).toHaveBeenCalledTimes(1);
    });

    test('review mode replaces student controls with version-bound tutor actions', async () => {
        const onApproveSubmission = jest.fn(() => Promise.resolve());
        const onRequestChanges = jest.fn(() => Promise.resolve());
        const {getByRole, getByText, queryByRole} = renderWithIntl(
            <Provider store={store}>
                <KidscodeProjectActionButtons
                    projectReadOnly
                    reviewMode
                    projectStatus="submitted"
                    onApproveSubmission={onApproveSubmission}
                    onRequestChanges={onRequestChanges}
                    onSaveProject={jest.fn()}
                    onSubmitProject={jest.fn()}
                />
            </Provider>
        );

        expect(getByText('Review mode')).toBeTruthy();
        expect(queryByRole('button', {name: 'Save project'})).toBeFalsy();
        expect(queryByRole('button', {name: 'Submit project'})).toBeFalsy();
        fireEvent.click(getByRole('button', {name: 'Approve'}));
        expect(onApproveSubmission).toHaveBeenCalledTimes(1);

        fireEvent.click(getByRole('button', {name: 'Request changes'}));
        fireEvent.change(getByRole('textbox', {name: 'Feedback for the student'}), {
            target: {value: 'Please add a loop.'}
        });
        fireEvent.click(document.querySelector('button[type="submit"]'));
        await waitFor(() => expect(onRequestChanges).toHaveBeenCalledWith('Please add a loop.'));
    });
});
