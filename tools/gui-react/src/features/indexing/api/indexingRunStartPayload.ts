// WHY: O(1) Feature Scaling — payload assembly is 100% registry-driven.
// Adding a new setting to settingsRegistry.js auto-includes it here.
// Zero per-field code. See indexingRunStartParsedValues.ts for numeric parsing.

import { LLM_SETTING_LIMITS } from '../../../stores/llmSettingsManifest.ts';
import { RUNTIME_SETTINGS_REGISTRY } from '../../../shared/registryDerivedSettingsMaps.ts';
import { deriveIndexingRunStartParsedValues, parsedKeyName } from './indexingRunStartParsedValues.ts';
import type { RuntimeSettings } from '../../pipeline-settings/state/runtimeSettingsAuthorityHelpers.ts';

const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;

type StartIndexingRunPayloadValue = string | number | boolean | Record<string, unknown>;
type StartIndexingRunPayloadRecord = Record<string, StartIndexingRunPayloadValue>;

interface StartIndexingRunPayloadParsedValues extends ReturnType<typeof deriveIndexingRunStartParsedValues> {}

interface BuildIndexingRunStartPayloadInput {
  requestedRunId: string;
  category: string;
  productId: string;
  brand?: string;
  base_model?: string;
  model?: string;
  variant?: string;
  runtimeSettingsPayload: RuntimeSettings;
  parsedValues: StartIndexingRunPayloadParsedValues;
  runControlPayload: StartIndexingRunPayloadRecord;
  llmPolicy?: Record<string, unknown>;
}

// WHY: Extract all serializable values from RuntimeSettings for the POST body.
// This ensures ALL settings keys flow through to the backend snapshot,
// not just the ones that the hand-picked payload builder lists explicitly.
function spreadRuntimeSettings(settings: RuntimeSettings): StartIndexingRunPayloadRecord {
  const result: StartIndexingRunPayloadRecord = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      result[key] = value.trim();
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'object') {
      result[key] = value as Record<string, unknown>;
    }
  }
  return result;
}

// WHY: UI-level minimum overrides that are stricter than registry min.
// llmMaxOutputTokens and llmMaxTokens: registry says min=128, but the UI
// enforces LLM_SETTING_LIMITS.maxTokens.min (256) as the floor.
const LLM_TOKEN_MIN_OVERRIDES: Record<string, number> = {
  llmMaxOutputTokens: LLM_MIN_OUTPUT_TOKENS,
  llmMaxTokens: LLM_MIN_OUTPUT_TOKENS,
};

// WHY: Generic overlay replaces 5 hand-written sub-builders. Loops the registry
// once, applies min clamping from entry.min (or UI override), and writes to the
// canonical key. Booleans/strings are already in the spread — only numerics need
// the parsed-value overlay because deriveIndexingRunStartParsedValues does not clamp.
function applyClampedNumericOverlays(
  parsedValues: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (entry.type !== 'int' && entry.type !== 'float') continue;
    const pk = parsedKeyName(entry.key);
    if (!(pk in parsedValues)) continue;
    const value = parsedValues[pk];
    const floor = LLM_TOKEN_MIN_OVERRIDES[entry.key] ?? (entry.min as number | undefined);
    result[entry.key] = floor != null ? Math.max(floor, value) : value;
  }
  return result;
}

export function buildIndexingRunStartPayload(
  input: BuildIndexingRunStartPayloadInput,
): StartIndexingRunPayloadRecord {
  const {
    requestedRunId,
    category,
    productId,
    brand,
    base_model,
    model,
    variant,
    runtimeSettingsPayload,
    parsedValues,
    runControlPayload,
    llmPolicy,
  } = input;

  return {
    // 1. ALL registry keys (already serialized by collectRuntimeSettingsPayload)
    ...spreadRuntimeSettings(runtimeSettingsPayload),
    // 2. Min-clamped numeric overlays (registry-driven, replaces 5 sub-builders)
    ...applyClampedNumericOverlays(parsedValues),
    // 3. Non-registry constants
    requestedRunId: String(requestedRunId || '').trim(),
    category,
    productId,
    // WHY: base_model is the canonical family key for product identity.
    // The backend launch plan translates it to the CLI's legacy --model arg.
    ...(brand ? { brand } : {}),
    ...(base_model ? { base_model } : {}),
    ...(model ? { model } : {}),
    ...(variant ? { variant } : {}),
    mode: 'indexlab',
    replaceRunning: true,
    profile: 'standard',
    runProfile: 'standard',
    discoveryEnabled: true,
    // 4. Custom overlays (caller-provided, highest priority)
    ...runControlPayload,
    ...(llmPolicy ? { llmPolicy } : {}),
  };
}
