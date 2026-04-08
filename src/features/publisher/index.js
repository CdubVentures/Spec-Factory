// Public API — publish pipeline feature.
// Phases 1-3: validation sub-module. candidate-gate and publisher added in later phases.

// Phase 1: core gates
export { normalizeAbsence } from './validation/absenceNormalizer.js';
export { checkShape } from './validation/checks/checkShape.js';
export { checkType } from './validation/checks/checkType.js';

// Phase 2: normalization + template dispatch
export { normalizeValue, applyTokenMap } from './validation/checks/normalize.js';
export { dispatchTemplate } from './validation/templateDispatch.js';

// Phase 3: unit + format
export { checkUnit } from './validation/checks/checkUnit.js';
export { checkFormat } from './validation/checks/checkFormat.js';

// Phase 4: enum + list rules
export { checkEnum } from './validation/checks/checkEnum.js';
export { enforceListRules } from './validation/checks/enforceListRules.js';

// Phase 5: rounding + range
export { applyRounding } from './validation/checks/applyRounding.js';
export { checkRange } from './validation/checks/checkRange.js';

// Phase 6: constraints
export { checkConstraints } from './validation/checks/checkConstraints.js';

// Phase registry (O(1) phase metadata for UI badges)
export { PHASE_REGISTRY } from './validation/phaseRegistry.js';

// Phase 7-8: composed pipeline + record orchestrator
export { validateField } from './validation/validateField.js';
export { validateRecord } from './validation/validateRecord.js';

// Phase 9: repair-adapter (LLM repair orchestration)
export { repairField, repairCrossField } from './repair-adapter/repairField.js';
export { createRepairCallLlm } from './repairLlmAdapter.js';

// Phase 10: discovery enum support (self-tightening vocabulary)
export { mergeDiscoveredEnums } from './validation/mergeDiscoveredEnums.js';
export { buildDiscoveredEnumMap } from './buildDiscoveredEnumMap.js';
export { persistDiscoveredValue } from './persistDiscoveredValues.js';

// TODO: export { submitCandidate } from './candidate-gate/submitCandidate.js';
// TODO: export { publishResolved } from './publisher/publishResolved.js';
