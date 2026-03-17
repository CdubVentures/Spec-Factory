// Studio feature — public API barrel.
// Consumers must import from this file, not from internal paths.

export { registerStudioRoutes } from './api/studioRoutes.js';
export { createStudioRouteContext } from './api/studioRouteContext.js';

// Domain helpers consumed by other feature boundaries.
export {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
  readEnumConsistencyFormatHint,
  isEnumConsistencyReviewEnabled,
  buildPendingEnumValuesFromSuggestions,
  normalizeComponentAliasList,
  buildStudioKnownValuesPayload,
  buildStudioKnownValuesFromSpecDb,
  buildStudioComponentDbFromSpecDb,
  summarizeStudioMapPayload,
  summarizeStudioMapValidation,
  choosePreferredStudioMap,
  applyEnumConsistencyToSuggestions,
} from './api/studioRouteHelpers.js';
