import React from 'react';
import {fireEvent} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import ReactModal from 'react-modal';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {MenuRefProvider} from '../../../src/contexts/menu-ref-context.jsx';
import {
    KidscodeProjectActionButtons,
    KidscodeProjectMenu
} from '../../../src/components/kidscode-menu-bar/kidscode-project-controls.jsx';

const mockDownloadProject = jest.fn();

jest.mock('../../../src/containers/sb3-downloader.jsx', () => function MockSB3Downloader ({children}) {
    return children('', mockDownloadProject);
});

describe('Kidscode project controls', () => {
    let modalAppElement;
    const store = configureStore()({
        locales: {
            isRtl: false
        }
    });

    const defaultCallback = jest.fn();
    const getSaveToComputerHandler = downloadProject => downloadProject;
    const getProjectMenu = props => (
        <Provider store={store}>
            <MenuRefProvider>
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

    test('renames locally on confirm and preserves the title on cancel', () => {
        const onRenameProject = jest.fn();
        const {getByRole, getByText, queryByRole} = renderWithIntl(getProjectMenu({onRenameProject}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Rename'));
        fireEvent.change(getByRole('textbox', {name: 'Project title'}), {
            target: {value: 'Renamed project'}
        });
        fireEvent.click(getByRole('button', {name: 'Rename'}));

        expect(onRenameProject).toHaveBeenCalledWith('Renamed project');
        expect(queryByRole('dialog')).toBeFalsy();

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Rename'));
        fireEvent.change(getByRole('textbox', {name: 'Project title'}), {
            target: {value: 'Cancelled title'}
        });
        fireEvent.click(getByRole('button', {name: 'Cancel'}));

        expect(onRenameProject).toHaveBeenCalledTimes(1);
        expect(queryByRole('dialog')).toBeFalsy();
    });

    test('requires confirmation before invoking delete draft', () => {
        const onDeleteDraft = jest.fn();
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({onDeleteDraft}));

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Delete draft'));
        fireEvent.click(getByRole('button', {name: 'Cancel'}));
        expect(onDeleteDraft).not.toHaveBeenCalled();

        fireEvent.click(getByRole('button', {name: 'Project menu'}));
        fireEvent.click(getByText('Delete draft'));
        fireEvent.click(getByRole('button', {name: 'Delete draft'}));
        expect(onDeleteDraft).toHaveBeenCalledTimes(1);
    });

    test('invokes duplicate and return callback seams', () => {
        const onDuplicateProject = jest.fn();
        const onReturnToLesson = jest.fn();
        const onReturnToMyScratchProjects = jest.fn();
        const {getByRole, getByText} = renderWithIntl(getProjectMenu({
            onDuplicateProject,
            onReturnToLesson,
            onReturnToMyScratchProjects
        }));

        const selectProjectAction = label => {
            fireEvent.click(getByRole('button', {name: 'Project menu'}));
            fireEvent.click(getByText(label));
        };

        selectProjectAction('Duplicate');
        selectProjectAction('Return to lesson');
        selectProjectAction('Return to My Scratch Projects');

        expect(onDuplicateProject).toHaveBeenCalledTimes(1);
        expect(onReturnToLesson).toHaveBeenCalledTimes(1);
        expect(onReturnToMyScratchProjects).toHaveBeenCalledTimes(1);
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
});
