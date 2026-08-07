import React from 'react';
import {act} from '@testing-library/react';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import TitledHOC from '../../../src/lib/titled-hoc.jsx';
import projectTitleReducer from '../../../src/reducers/project-title.js';
import {LoadingState} from '../../../src/reducers/project-state.js';

describe('TitledHOC', () => {
    test('preserves a supplied title after the default project finishes loading', () => {
        const initialState = {
            scratchGui: {
                projectState: {
                    loadingState: LoadingState.LOADING_VM_NEW_DEFAULT
                },
                projectTitle: ''
            }
        };
        const reducer = (state = initialState, action) => {
            if (action.type === 'SET_LOADING_STATE') {
                return {
                    ...state,
                    scratchGui: {
                        ...state.scratchGui,
                        projectState: {
                            loadingState: action.loadingState
                        }
                    }
                };
            }
            return {
                ...state,
                scratchGui: {
                    ...state.scratchGui,
                    projectTitle: projectTitleReducer(state.scratchGui.projectTitle, action)
                }
            };
        };
        const store = createStore(reducer);
        const WrappedComponent = TitledHOC(() => null);

        renderWithIntl(
            <Provider store={store}>
                <WrappedComponent projectTitle="Untitled Project" />
            </Provider>
        );
        expect(store.getState().scratchGui.projectTitle).toBe('Untitled Project');

        act(() => {
            store.dispatch({
                type: 'SET_LOADING_STATE',
                loadingState: LoadingState.SHOWING_WITHOUT_ID
            });
        });

        expect(store.getState().scratchGui.projectTitle).toBe('Untitled Project');
    });
});
