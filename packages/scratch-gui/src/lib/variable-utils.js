// Utility functions for updating variables in the VM
// TODO (VM#1145) these should be moved to top-level VM API
import {isKidscodeVmReadOnly} from './kidscode-workspace-vm-read-only-guard';

const getVariable = (vm, targetId, variableId) => {
    const target = targetId ?
        vm.runtime.getTargetById(targetId) :
        vm.runtime.getTargetForStage();
    return target.variables[variableId];
};

const getVariableValue = (vm, targetId, variableId) => {
    const variable = getVariable(vm, targetId, variableId);
    // If array, return a new copy for mutating, ensuring that updates stay immutable.
    if (variable.value instanceof Array) return variable.value.slice();
    return variable.value;
};

const setVariableValue = (vm, targetId, variableId, value) => {
    // A stage variable-monitor slider or list-monitor cell edit mutates the target's variable object
    // directly rather than calling any vm.<method>(), so it falls outside the VM method guard in
    // kidscode-workspace-vm-read-only-guard.js and needs its own check.
    if (isKidscodeVmReadOnly(vm)) return;
    getVariable(vm, targetId, variableId).value = value;
};

export {
    getVariable,
    getVariableValue,
    setVariableValue
};
