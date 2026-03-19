/**
 * Public API barrel for the pipeline-settings feature boundary.
 *
 * Cross-feature consumers (indexing, llm-config, runtime-ops) MUST import
 * through this barrel rather than reaching into internal state/ or components/.
 */

// --- Draft contracts (constants, types, helpers) ---
export {
  normalizeToken,
  OCR_BACKEND_OPTIONS,
  parseBoundedNumber,
  REPAIR_DEDUPE_RULE_OPTIONS,
  RESUME_MODE_OPTIONS,
  RUNTIME_NUMBER_BOUNDS,
  runtimeDraftEqual,
  SEARXNG_ENGINE_OPTIONS,
  toRuntimeDraft,
  type NumberBound,
  type RuntimeDraft,
} from './state/RuntimeFlowDraftContracts';

// --- Draft normalizer ---
export { normalizeRuntimeDraft } from './state/RuntimeFlowDraftNormalizer';

// --- Draft payload builder ---
export { collectRuntimeFlowDraftPayload } from './state/RuntimeFlowDraftPayload';

// --- Model token options ---
export {
  deriveRuntimeLlmModelOptions,
  deriveRuntimeLlmTokenPresetOptions,
  type RuntimeSettingsLlmConfigResponse,
} from './state/RuntimeFlowModelTokenOptions';

// --- Model token defaults ---
export {
  buildRuntimeLlmTokenProfileLookup,
  createRuntimeModelTokenDefaultsResolver,
  deriveRuntimeLlmTokenContractPresetMax,
  type RuntimeLlmTokenProfileLookup,
} from './state/RuntimeFlowModelTokenDefaults';

// --- Flow state derivations ---
export {
  deriveRuntimeFlowControlLocks,
  deriveRuntimeStepEnabledMap,
  type RuntimeFlowControlLocks,
} from './state/RuntimeFlowStateDerivations';

// --- Step registry ---
export {
  RUNTIME_STEP_IDS,
  RUNTIME_STEPS,
  RUNTIME_SUB_STEPS,
  type RuntimeStepEntry,
  type RuntimeStepId,
  type RuntimeSubStepEntry,
} from './state/RuntimeFlowStepRegistry';

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
} from './state/runtimeSettingsAuthority';

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
} from './state/runtimeSettingsDomain';

// --- Runtime settings editor adapter ---
export {
  useRuntimeSettingsEditorAdapter,
  type RuntimeEditorSaveStatus,
} from './state/runtimeSettingsEditorAdapter';

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
} from './state/sourceStrategyAuthority';

// --- UI primitives (shared across pipeline-settings, llm-config) ---
export {
  AdvancedSettingsBlock,
  FlowOptionPanel,
  MasterSwitchRow,
  SettingGroupBlock,
  SettingNumberInput,
  SettingRow,
  SettingToggle,
} from './components/RuntimeFlowPrimitives';

// --- Primitive types re-exported from the types directory ---
export type {
  AdvancedSettingsBlockProps,
  FlowOptionPanelProps,
  MasterSwitchRowProps,
  SettingGroupBlockProps,
  SettingRowProps,
  SettingToggleProps,
} from './types/settingPrimitiveTypes';
