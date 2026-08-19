import {getVariableValue, setVariableValue} from '../../../src/lib/variable-utils';
import {applyKidscodeVmReadOnlyGuard} from '../../../src/lib/kidscode-workspace-vm-read-only-guard';

// setVariableValue mutates a target's variable object directly rather than calling any vm.<method>,
// so it sits outside kidscode-workspace-vm-read-only-guard.js's method-wrapping and needs its own
// read-only check (see the Phase 8 Stage 4 lockdown investigation) — this is what a stage variable
// slider or list-monitor cell edit calls.
const buildVm = () => {
    // A single stable target object, reused across calls — getVariable() must observe the same
    // mutation it (or a previous call) made, not a fresh zeroed-out target every time.
    const target = {variables: {var1: {value: 0}}};
    return {
        runtime: {
            getTargetById: () => target,
            getTargetForStage: () => target
        }
    };
};

describe('setVariableValue read-only guard (monitor slider / list-cell edits)', () => {
    test('updates the variable normally when the project is editable (draft/changes_requested)', () => {
        const vm = buildVm();
        applyKidscodeVmReadOnlyGuard(vm, false);

        setVariableValue(vm, 'target1', 'var1', 42);

        expect(getVariableValue(vm, 'target1', 'var1')).toBe(42);
    });

    test('does not mutate the variable when the project is read-only (submitted/approved/tutor review)', () => {
        const vm = buildVm();
        applyKidscodeVmReadOnlyGuard(vm, true);

        setVariableValue(vm, 'target1', 'var1', 42);

        expect(getVariableValue(vm, 'target1', 'var1')).toBe(0);
    });

    test('resumes updating once read-only is lifted (live changes_requested/resubmit transition)', () => {
        const vm = buildVm();
        applyKidscodeVmReadOnlyGuard(vm, true);
        setVariableValue(vm, 'target1', 'var1', 42);
        expect(getVariableValue(vm, 'target1', 'var1')).toBe(0);

        applyKidscodeVmReadOnlyGuard(vm, false);
        setVariableValue(vm, 'target1', 'var1', 42);

        expect(getVariableValue(vm, 'target1', 'var1')).toBe(42);
    });

    test('a vm with no guard ever applied behaves as editable (existing Stage 2/3 behaviour unchanged)', () => {
        const vm = buildVm();

        setVariableValue(vm, 'target1', 'var1', 7);

        expect(getVariableValue(vm, 'target1', 'var1')).toBe(7);
    });
});
