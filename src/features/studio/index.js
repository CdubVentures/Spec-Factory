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
  applyEnumConsistencyToSuggestions,
} from './api/studioRouteHelpers.js';

// EG compatibility presets (colors + editions field rule SSOT).
export {
  EG_CANONICAL_COLORS,
  EG_PRESET_REGISTRY,
  EG_LOCKED_KEYS,
  EG_EDITABLE_PATHS,
  EG_DEFAULT_TOGGLES,
  buildEgColorFieldRule,
  buildEgEditionFieldRule,
  buildAllEgDefaults,
  getEgPresetForKey,
  preserveEgEditablePaths,
  sanitizeEgLockedOverrides,
  isEgLockedField,
  isEgEditablePath,
  resolveEgLockedKeys,
} from './contracts/egPresets.js';

// Schema contracts (O(1) SSOT for studio shapes).
export {
  StudioPayloadSchema,
  FieldStudioMapResponseSchema,
  TooltipBankResponseSchema,
  ArtifactEntrySchema,
  KnownValuesResponseSchema,
  ComponentDbItemSchema,
  ComponentDbResponseSchema,
  FieldRuleSchema,
  EnumEntrySchema,
  PriorityProfileSchema,
  AiAssistConfigSchema,
  ComponentSourcePropertySchema,
  ComponentSourceSchema,
  StudioConfigSchema,
  STUDIO_PAYLOAD_KEYS,
  FIELD_STUDIO_MAP_RESPONSE_KEYS,
  TOOLTIP_BANK_RESPONSE_KEYS,
  ARTIFACT_ENTRY_KEYS,
  KNOWN_VALUES_RESPONSE_KEYS,
  COMPONENT_DB_ITEM_KEYS,
} from './contracts/studioSchemas.js';
