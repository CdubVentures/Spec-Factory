// Public API — publish pipeline feature.
// Phases 1-3: validation sub-module. candidate-gate and publisher added in later phases.

// Phase 1: core gates
export { normalizeAbsence } from './validation/absenceNormalizer.js';
export { checkShape } from './validation/checks/checkShape.js';
export { coerceByType } from './validation/typeCoercion.js';

// Phase 2: normalization
export { normalizeValue, applyTokenMap } from './validation/checks/normalize.js';

// Phase 3: unit + format
export { checkUnit } from './validation/checks/checkUnit.js';
export { checkFormat } from './validation/checks/checkFormat.js';

// Phase 4: enum + list rules
export { checkEnum } from './validation/checks/checkEnum.js';
export { enforceListRules } from './validation/checks/enforceListRules.js';

// Phase 5: rounding + range
export { applyRounding } from './validation/checks/applyRounding.js';
export { checkRange } from './validation/checks/checkRange.js';

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

export { submitCandidate } from './candidate-gate/submitCandidate.js';
export { publishCandidate } from './publish/publishCandidate.js';
export { publishManualOverride } from './publish/publishManualOverride.js';
export { rebuildPublishedFieldsFromJson } from './publish/publishedFieldReseed.js';
export { reconcileThreshold } from './publish/reconcileThreshold.js';
export { republishField } from './publish/republishField.js';
export { clearPublishedField } from './publish/clearPublishedField.js';
export { writeManualOverride } from './publish/writeManualOverride.js';

// Rebuild contract (reseed surface for deleted-DB recovery)
export { rebuildFieldCandidatesFromJson } from './candidateReseed.js';
