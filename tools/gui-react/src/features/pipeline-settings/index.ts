/**
 * Public API barrel for the pipeline-settings feature boundary.
 *
 * Cross-feature consumers (indexing, llm-config, runtime-ops) MUST import
 * through this barrel rather than reaching into internal state/ or components/.
 */

// --- Draft contracts (constants, types, helpers) ---
export {
  normalizeToken,
  parseBoundedNumber,
  REPAIR_DEDUPE_RULE_OPTIONS,
  RESUME_MODE_OPTIONS,
  RUNTIME_NUMBER_BOUNDS,
  runtimeDraftEqual,
  SEARXNG_ENGINE_OPTIONS,
  toRuntimeDraft,
  type NumberBound,
  type RuntimeDraft,
} from './state/RuntimeFlowDraftContracts.ts';

// --- Draft normalizer ---
export { normalizeRuntimeDraft } from './state/RuntimeFlowDraftNormalizer.ts';

// --- Draft payload builder ---
export { collectRuntimeFlowDraftPayload } from './state/RuntimeFlowDraftPayload.ts';

// --- Model token options ---
export {
  deriveRuntimeLlmModelOptions,
  deriveRuntimeLlmTokenPresetOptions,
  type RuntimeSettingsLlmConfigResponse,
} from './state/RuntimeFlowModelTokenOptions.ts';

// --- Model token defaults ---
export {
  buildRuntimeLlmTokenProfileLookup,
  createRuntimeModelTokenDefaultsResolver,
  deriveRuntimeLlmTokenContractPresetMax,
  type RuntimeLlmTokenProfileLookup,
} from './state/RuntimeFlowModelTokenDefaults.ts';

// --- Runtime settings authority (helpers + hooks) ---
export {
  readRuntimeSettingsBootstrap,
  readRuntimeSettingsNumericBaseline,
  readRuntimeSettingsSnapshot,
  RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
  RUNTIME_SETTINGS_QUERY_KEY,
  runtimeSettingsNumericBaselineEqual,
  useRuntimeSettingsAuthority,
  useRuntimeSettingsBootstrap,
  useRuntimeSettingsReader,
  useRuntimeSettingsStoreHydration,
  type RuntimeSettings,
  type RuntimeSettingsNumericBaseline,
} from './state/runtimeSettingsAuthority.ts';

// --- Runtime settings domain (parsing, hydration, payload, types) ---
export {
  clampTokenForModel,
  collectRuntimeSettingsPayload,
  createRuntimeHydrationBindings,
  hydrateRuntimeSettingsFromBindings,
  parseRuntimeFloat,
  parseRuntimeInt,
  parseRuntimeLlmTokenCap,
  parseRuntimeString,
  type RuntimeHydrationBindings,
  type RuntimeHydrationBindingSetters,
  type RuntimeModelTokenDefaults,
  type RuntimeModelTokenDefaultsResolver,
  type RuntimeSettingsPayloadSerializerInput,
} from './state/runtimeSettingsDomain.ts';

// --- Runtime settings editor adapter ---
export {
  useRuntimeSettingsEditorAdapter,
  type RuntimeEditorSaveStatus,
} from './state/runtimeSettingsEditorAdapter.ts';

// --- Source strategy authority ---
export {
  readSourceStrategySnapshot,
  sourceStrategyQueryKey,
  useSourceStrategyAuthority,
  useSourceStrategyReader,
  type CrawlConfig,
  type DiscoveryConfig,
  type FieldCoverage,
  type SourceEntry,
} from './state/sourceStrategyAuthority.ts';

// --- Auto-save effect (generic) ---
export {
  useSettingsAutoSaveEffect,
  type UseSettingsAutoSaveOptions,
  type UseSettingsAutoSaveResult,
} from './state/useSettingsAutoSaveEffect.ts';

// --- UI primitives (shared across pipeline-settings, llm-config) ---
export {
  AdvancedSettingsBlock,
  FlowOptionPanel,
  MasterSwitchRow,
  SettingGroupBlock,
  SettingNumberInput,
  SettingRow,
  SettingToggle,
} from './components/RuntimeFlowPrimitives.tsx';

// --- Primitive types re-exported from the types directory ---
export type {
  AdvancedSettingsBlockProps,
  FlowOptionPanelProps,
  MasterSwitchRowProps,
  SettingGroupBlockProps,
  SettingRowProps,
  SettingToggleProps,
} from './types/settingPrimitiveTypes.ts';
