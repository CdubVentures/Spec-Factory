// Public API — publish pipeline feature.
// Phase 1: validation sub-module only. candidate-gate and publisher added in later phases.

export { normalizeAbsence } from './validation/absenceNormalizer.js';
export { checkShape } from './validation/checks/checkShape.js';
export { checkType } from './validation/checks/checkType.js';

// TODO (Phase 7-8): export { validateField } from './validation/validateField.js';
// TODO (Phase 7-8): export { validateRecord } from './validation/validateRecord.js';
// TODO (Phase 2):   export { submitCandidate } from './candidate-gate/submitCandidate.js';
// TODO (Phase 3):   export { publishResolved } from './publisher/publishResolved.js';
