import {Blocks} from '../../../src/containers/blocks.jsx';
import {DEFAULT_MODE} from '../../../src/lib/settings/color-mode';
import VMScratchBlocksMock from '../../../src/lib/blocks';

jest.mock('../../../src/lib/blocks', () => jest.fn());

describe('Blocks container onWorkspaceUpdate', () => {
    let instance;

    beforeEach(() => {
        // Minimal mock instance — just enough for onWorkspaceUpdate to run
        instance = {
            getToolboxXML: jest.fn().mockReturnValue(null),
            onWorkspaceMetricsChange: jest.fn(),
            toolboxUpdateChangeListener: jest.fn(),
            props: {
                vm: {editingTarget: null},
                workspaceMetrics: {targets: {}},
                updateToolboxState: jest.fn()
            },
            workspace: {
                removeChangeListener: jest.fn(),
                addChangeListener: jest.fn(),
                clearUndo: jest.fn()
            },
            ScratchBlocks: {
                Events: {
                    disable: jest.fn(),
                    enable: jest.fn()
                },
                utils: {
                    xml: {
                        textToDom: jest.fn().mockReturnValue(document.createElement('xml'))
                    }
                },
                clearWorkspaceAndLoadFromXml: jest.fn()
            }
        };
    });

    test('Events.enable() is called after a successful workspace load', () => {
        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: '<xml/>'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });

    test('Events.enable() is called even when clearWorkspaceAndLoadFromXml throws', () => {
        instance.ScratchBlocks.clearWorkspaceAndLoadFromXml.mockImplementation(() => {
            throw new Error('workspace load failed');
        });

        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: '<xml/>'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });

    test('Events.enable() is called even when textToDom throws', () => {
        instance.ScratchBlocks.utils.xml.textToDom.mockImplementation(() => {
            throw new Error('XML parse failed');
        });

        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: 'invalid xml'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });
});

// Regression coverage for the Phase 8 Stage 4 read-only crash: injecting Blockly with
// `readOnly: true` skips creating the flyout entirely, and componentDidMount's own
// `this.workspace.getFlyout().getWorkspace()` (and attachVM's identical call) unconditionally
// assumed one exists, throwing "Cannot read properties of null (reading 'getWorkspace')" the moment
// an already-submitted/approved/tutor-review project was launched. The fix always injects normally
// (readOnly never appears in the injection config) and applies read-only afterwards via Blockly's
// own workspace.setIsReadOnly(), which does not touch the flyout.
describe('Blocks container kidscode read-only wiring', () => {
    let instance;
    let mockWorkspace;
    let flyoutWorkspace;

    beforeEach(() => {
        jest.clearAllMocks();

        flyoutWorkspace = {registerButtonCallback: jest.fn()};
        const flyout = {getWorkspace: jest.fn(() => flyoutWorkspace)};
        mockWorkspace = {
            registerToolboxCategoryCallback: jest.fn(),
            addChangeListener: jest.fn(),
            getFlyout: jest.fn(() => flyout),
            getToolbox: jest.fn(() => ({selectItemByPosition: jest.fn()})),
            translate: jest.fn(),
            zoom: jest.fn(),
            setIsReadOnly: jest.fn(),
            dispose: jest.fn()
        };

        VMScratchBlocksMock.mockReturnValue({
            dialog: {setPrompt: jest.fn()},
            ScratchVariables: {setPromptHandler: jest.fn(), createVariable: jest.fn(), getVariablesCategory: jest.fn()},
            StatusIndicatorLabel: {},
            recordSoundCallback: null,
            FieldColourSlider: {},
            ScratchProcedures: {createProcedureDefCallback: jest.fn(), getProceduresCategory: jest.fn()},
            ScratchMsgs: {setLocale: jest.fn()},
            Theme: jest.fn(),
            Events: {VAR_CREATE: 'v1', VAR_RENAME: 'v2', VAR_DELETE: 'v3', BLOCK_DELETE: 'b1', BLOCK_CREATE: 'b2'},
            WidgetDiv: {hide: jest.fn()},
            getFocusManager: jest.fn(() => ({focusNode: jest.fn()})),
            inject: jest.fn(() => mockWorkspace)
        });

        // Real applyKidscodeReadOnly attached so it exercises the actual fix logic; attachVM/
        // setLocale/requestToolboxUpdate are stubbed to isolate this test to componentDidMount's own
        // top-level statements (the same isolation style the onWorkspaceUpdate tests above use).
        instance = {
            blocks: {},
            state: {prompt: null},
            attachVM: jest.fn(),
            setLocale: jest.fn(),
            requestToolboxUpdate: jest.fn(),
            applyKidscodeReadOnly: Blocks.prototype.applyKidscodeReadOnly,
            onWorkspaceMetricsChange: jest.fn(),
            props: {
                vm: {},
                useCatBlocks: false,
                onActivateColorPicker: jest.fn(),
                onActivateCustomProcedures: jest.fn(),
                locale: 'en',
                options: {},
                isRtl: false,
                toolboxXML: '<xml/>',
                colorMode: DEFAULT_MODE,
                isVisible: false,
                readOnly: false
            }
        };
    });

    describe('componentDidMount', () => {
        test.each([
            ['draft (editable)', false],
            ['submitted (read-only)', true],
            ['approved (read-only)', true],
            ['tutor read-only review', true]
        ])('%s: mounts without crashing and applies workspace.setIsReadOnly(%s)', (_label, readOnly) => {
            instance.props.readOnly = readOnly;

            expect(() => Blocks.prototype.componentDidMount.call(instance)).not.toThrow();

            // The exact previously-crashing line: getFlyout() must resolve, not be null.
            expect(mockWorkspace.getFlyout).toHaveBeenCalled();
            expect(flyoutWorkspace.registerButtonCallback).toHaveBeenCalled();
            expect(mockWorkspace.setIsReadOnly).toHaveBeenCalledWith(readOnly);
        });

        test('injects without a readOnly field in the workspace config (the flyout is always created)', () => {
            instance.props.readOnly = true;
            Blocks.prototype.componentDidMount.call(instance);

            const injectedConfig = VMScratchBlocksMock.mock.results[0].value.inject.mock.calls[0][1];
            expect(injectedConfig.readOnly).toBeUndefined();
        });

        test('Green Flag/playback plumbing (attachVM) still runs identically regardless of read-only', () => {
            instance.props.readOnly = true;
            Blocks.prototype.componentDidMount.call(instance);

            // attachVM wires the VM listeners (script/block glow, targets, monitors) that drive
            // Green Flag and other playback — read-only never skips or gates this call.
            expect(instance.attachVM).toHaveBeenCalledTimes(1);
        });
    });

    describe('componentDidUpdate', () => {
        beforeEach(() => {
            Blocks.prototype.componentDidMount.call(instance);
            mockWorkspace.setIsReadOnly.mockClear();
        });

        test('a live draft → submitted transition (Submit mid-session) applies read-only without remounting', () => {
            const prevProps = {...instance.props, readOnly: false};
            instance.props = {...instance.props, readOnly: true};

            expect(() => Blocks.prototype.componentDidUpdate.call(instance, prevProps)).not.toThrow();

            expect(mockWorkspace.setIsReadOnly).toHaveBeenCalledWith(true);
            // No second injection: componentDidUpdate never calls ScratchBlocks.inject.
            expect(VMScratchBlocksMock.mock.results[0].value.inject).toHaveBeenCalledTimes(1);
        });

        test('applies the transition even when isVisible is unchanged (no early return skips it)', () => {
            const prevProps = {...instance.props, isVisible: false, readOnly: false};
            instance.props = {...instance.props, isVisible: false, readOnly: true};

            Blocks.prototype.componentDidUpdate.call(instance, prevProps);

            expect(mockWorkspace.setIsReadOnly).toHaveBeenCalledWith(true);
        });

        test('an unrelated prop change (draft stays editable) does not reapply read-only', () => {
            const prevProps = {...instance.props, stageSize: 'small'};
            instance.props = {...instance.props, stageSize: 'large'};

            Blocks.prototype.componentDidUpdate.call(instance, prevProps);

            expect(mockWorkspace.setIsReadOnly).not.toHaveBeenCalled();
        });
    });

    describe('componentWillUnmount', () => {
        test('disposes cleanly with no null workspace access, mounted read-only or not', () => {
            instance.props.readOnly = true;
            Blocks.prototype.componentDidMount.call(instance);
            instance.detachVM = jest.fn();
            instance.props.vm.clearFlyoutBlocks = jest.fn();

            expect(() => Blocks.prototype.componentWillUnmount.call(instance)).not.toThrow();
            expect(mockWorkspace.dispose).toHaveBeenCalledTimes(1);
        });
    });
});
