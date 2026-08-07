import React from 'react';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import MenuBar from '../../../src/components/menu-bar/menu-bar';
import {menuInitialState} from '../../../src/reducers/menus';
import {selectLocale} from '../../../src/reducers/locales';
import {LoadingState} from '../../../src/reducers/project-state';
import {restoreDeletionInitialState} from '../../../src/reducers/restore-deletion';
import {DEFAULT_MODE} from '../../../src/lib/settings/color-mode';
import {fireEvent} from '@testing-library/react';

import {PLATFORM} from '../../../src/lib/platform';

import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';
import VM from '@scratch/scratch-vm';
import {MenuRefProvider} from '../../../src/contexts/menu-ref-context.jsx';

describe('MenuBar Component', () => {
    const store = configureStore()({
        locales: {
            isRtl: false,
            locale: 'en-US'
        },
        scratchGui: {
            menus: menuInitialState,
            projectTitle: 'Redux project title',
            projectState: {
                loadingState: LoadingState.NOT_LOADED
            },
            restoreDeletion: restoreDeletionInitialState,
            settings: {
                colorMode: DEFAULT_MODE
            },
            timeTravel: {
                year: 'NOW'
            },
            vm: new VM(),
            vmStatus: {
                turbo: false
            },
            platform: {
                platform: PLATFORM.WEB
            }
        }
    });

    const getComponent = function (props = {}) {
        return (<Provider store={store}>
            <MenuRefProvider>
                <MenuBar {...props} />
            </MenuRefProvider>
        </Provider>);
    };

    test('menu bar with no About handler has no About button', () => {
        const {container} = renderWithIntl(getComponent());
        const button = container.querySelector('button[aria-label="About menu"]');
        expect(button).toBeFalsy();
    });

    test('menu bar with an About handler has an About button', () => {
        const onClickAbout = jest.fn();
        const {container} = renderWithIntl(getComponent({onClickAbout}));
        const button = container.querySelector('button[aria-label="About menu"]');
        expect(button).toBeTruthy();
    });

    test('Kidscode title surface uses Scratch project-title state', () => {
        const {getByText, queryByText} = renderWithIntl(getComponent({
            kidscodeProjectTitle: 'Initial Kidscode title'
        }));

        expect(getByText('Redux project title')).toBeTruthy();
        expect(queryByText('Initial Kidscode title')).toBeFalsy();
    });

    test('standard Scratch controls are unchanged without Kidscode props', () => {
        store.clearActions();
        const {getByDisplayValue, getByRole, getByText, queryByRole} = renderWithIntl(getComponent({
            canChangeLanguage: true,
            canCreateCopy: false,
            canEditTitle: true,
            canManageFiles: true,
            canRemix: false,
            canSave: false,
            onStartSelectingFileUpload: jest.fn()
        }));

        expect(queryByRole('button', {name: 'Project menu'})).toBeFalsy();
        expect(queryByRole('button', {name: 'Save project'})).toBeFalsy();
        expect(queryByRole('button', {name: 'Submit project'})).toBeFalsy();
        expect(getByDisplayValue('Redux project title')).toBeTruthy();

        fireEvent.click(getByRole('button', {name: 'File menu'}));
        expect(getByText('New')).toBeTruthy();
        expect(getByText('Load from your computer')).toBeTruthy();
        expect(getByText('Save to your computer')).toBeTruthy();

        fireEvent.click(getByRole('button', {name: 'Edit menu'}));
        expect(getByText('Turn on Turbo Mode')).toBeTruthy();

        fireEvent.click(getByRole('button', {name: 'Settings menu'}));
        fireEvent.click(getByRole('button', {name: 'Language'}));
        fireEvent.click(getByText('Esperanto'));
        expect(store.getActions()).toContainEqual(selectLocale('eo'));
    });

    describe('triggering About button handler', () => {
        test('clicking on About button calls the handler', () => {
            const onClickAbout = jest.fn();
            const {container} = renderWithIntl(getComponent({onClickAbout}));
            const button = container.querySelector('button[aria-label="About menu"]');
    
            fireEvent.click(button);
            expect(onClickAbout).toHaveBeenCalledTimes(1);
        });
    
        test('not clicking on About button does not call the handler', () => {
            const onClickAbout = jest.fn();
            const {container} = renderWithIntl(getComponent({onClickAbout}));
            const button = container.querySelector('button[aria-label="About menu"]');
    
            expect(onClickAbout).toHaveBeenCalledTimes(0);
        });
    });
});
