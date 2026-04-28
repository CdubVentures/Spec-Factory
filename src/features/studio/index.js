// Studio feature — public API barrel.
// Consumers must import from this file, not from internal paths.

export { registerStudioRoutes } from './api/studioRoutes.js';
export { createStudioRouteContext } from './api/studioRouteContext.js';

// Domain helpers consumed by other feature boundaries.
export {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
  buildPendingEnumValuesFromSuggestions,
  normalizeComponentAliasList,
  buildStudioKnownValuesPayload,
  buildStudioKnownValuesFromSpecDb,
  buildStudioComponentDbFromSpecDb,
  summarizeStudioMapPayload,
} from './api/studioRouteHelpers.js';

// EG compatibility presets (colors + editions + release_date + sku field rule SSOT).
export {
  EG_PRESET_REGISTRY,
  EG_LOCKED_KEYS,
  EG_EDITABLE_PATHS,
  EG_DEFAULT_TOGGLES,
  buildEgColorFieldRule,
  buildEgEditionFieldRule,
  buildEgReleaseDateFieldRule,
  buildEgSkuFieldRule,
  buildAllEgDefaults,
  getEgPresetForKey,
  preserveEgEditablePaths,
  sanitizeEgLockedOverrides,
  isEgLockedField,
  isEgEditablePath,
  resolveEgLockedKeys,
} from './contracts/egPresets.js';

// Component-lock contract (self-lock via enum.source = component_db.<self>).
export {
  isComponentLockEditablePath,
  isComponentLocked,
  sanitizeComponentLockedOverrides,
} from './contracts/componentLock.js';

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
