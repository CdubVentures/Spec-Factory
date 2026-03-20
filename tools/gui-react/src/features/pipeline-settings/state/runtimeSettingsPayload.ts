// WHY: O(1) Feature Scaling — payload serializer is registry-driven. Adding a new
// setting to settingsRegistry.js auto-serializes it here. Zero per-field code.

import type { RuntimeSettings } from './runtimeSettingsAuthority.ts';
import type { RuntimeSettingsPayloadSerializerInput } from './runtimeSettingsDomainTypes.ts';
import {
  clampTokenForModel,
  parseRuntimeFloat,
  parseRuntimeInt,
} from './runtimeSettingsParsing.ts';
import {
  RUNTIME_SETTINGS_REGISTRY,
  type RegistryEntry,
} from '../../../shared/registryDerivedSettingsMaps.ts';

// WHY: Token-clamped entries need model-aware clamping. Map each token key
// to the model field that governs its upper bound.
const TOKEN_CLAMP_MODEL_MAP: Record<string, { modelKey: string; fallbackModelKey?: string }> = {
  llmMaxOutputTokensPlan: { modelKey: 'llmModelPlan' },
  llmMaxOutputTokensReasoning: { modelKey: 'llmModelReasoning' },
  llmMaxOutputTokensPlanFallback: { modelKey: 'llmPlanFallbackModel', fallbackModelKey: 'llmModelPlan' },
  llmMaxOutputTokensReasoningFallback: { modelKey: 'llmReasoningFallbackModel', fallbackModelKey: 'llmModelReasoning' },
};

function serializeEntry(
  input: Record<string, unknown>,
  baseline: Record<string, number>,
  entry: RegistryEntry,
  resolveModelTokenDefaults: RuntimeSettingsPayloadSerializerInput['resolveModelTokenDefaults'],
): string | number | boolean {
  const key = entry.key;
  const raw = input[key];

  // WHY: tokenClamped entries use model-aware clamping, not standard int parse.
  if (entry.tokenClamped) {
    const mapping = TOKEN_CLAMP_MODEL_MAP[key];
    if (mapping) {
      const model = String(input[mapping.modelKey] || (mapping.fallbackModelKey ? input[mapping.fallbackModelKey] : '') || '');
      return clampTokenForModel(model, raw as number | string, resolveModelTokenDefaults);
    }
  }

  switch (entry.type) {
    case 'int':
      return parseRuntimeInt(raw, baseline[key] ?? 0);
    case 'float':
      return parseRuntimeFloat(raw, baseline[key] ?? 0);
    case 'bool':
      return raw as boolean;
    case 'enum':
    case 'csv_enum':
      return raw as string;
    case 'string':
      return String(raw || '').trim();
    default:
      return raw as string;
  }
}

// WHY: Skip defaultsOnly entries — they're config-internal, not serialized to payload.
// Also skip runtimeAutoSaveEnabled (UI-only state, not a runtime setting).
const SKIP_KEYS = new Set(['runtimeAutoSaveEnabled']);

export function collectRuntimeSettingsPayload(
  input: RuntimeSettingsPayloadSerializerInput,
): RuntimeSettings {
  const { resolveModelTokenDefaults, runtimeSettingsFallbackBaseline } = input;
  const inputMap = input as unknown as Record<string, unknown>;
  const baseline = runtimeSettingsFallbackBaseline as unknown as Record<string, number>;
  const result: Record<string, string | number | boolean> = {};

  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (SKIP_KEYS.has(entry.key)) continue;
    if (!(entry.key in inputMap)) continue;
    result[entry.key] = serializeEntry(inputMap, baseline, entry, resolveModelTokenDefaults);
  }

  return result;
}
