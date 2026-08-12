import {renderHook} from '@testing-library/react';

import useKidscodeWorkspaceBeforeUnload
    from '../../../src/lib/kidscode-workspace-navigation/use-kidscode-workspace-before-unload';
import {KidscodeWorkspaceState} from '../../../src/lib/kidscode-workspace-state';

const dispatchBeforeUnload = windowObject => {
    const event = new Event('beforeunload', {cancelable: true});
    windowObject.dispatchEvent(event);
    return event;
};

describe('Kidscode workspace before-unload protection', () => {
    let windowObject;

    beforeEach(() => {
        windowObject = window;
    });

    test.each([
        KidscodeWorkspaceState.UNSAVED,
        KidscodeWorkspaceState.SAVING,
        KidscodeWorkspaceState.SAVE_FAILED
    ])('warns before unload while %s', workspaceState => {
        renderHook(() => useKidscodeWorkspaceBeforeUnload({windowObject, workspaceState}));

        const event = dispatchBeforeUnload(windowObject);

        expect(event.defaultPrevented).toBe(true);
    });

    test.each([
        KidscodeWorkspaceState.SAVED,
        KidscodeWorkspaceState.PROJECT_DELETED,
        KidscodeWorkspaceState.SESSION_EXPIRED,
        null
    ])('does not warn for %s', workspaceState => {
        renderHook(() => useKidscodeWorkspaceBeforeUnload({windowObject, workspaceState}));

        const event = dispatchBeforeUnload(windowObject);

        expect(event.defaultPrevented).toBe(false);
    });

    test('does not warn in Tutor Review Mode even while Unsaved', () => {
        renderHook(() => useKidscodeWorkspaceBeforeUnload({
            reviewMode: true,
            windowObject,
            workspaceState: KidscodeWorkspaceState.UNSAVED
        }));

        const event = dispatchBeforeUnload(windowObject);

        expect(event.defaultPrevented).toBe(false);
    });

    test('removes its listener on unmount', () => {
        const {rerender, unmount} = renderHook(
            ({workspaceState}) => useKidscodeWorkspaceBeforeUnload({windowObject, workspaceState}),
            {initialProps: {workspaceState: KidscodeWorkspaceState.UNSAVED}}
        );
        rerender({workspaceState: KidscodeWorkspaceState.SAVED});
        unmount();

        const event = dispatchBeforeUnload(windowObject);

        expect(event.defaultPrevented).toBe(false);
    });
});
