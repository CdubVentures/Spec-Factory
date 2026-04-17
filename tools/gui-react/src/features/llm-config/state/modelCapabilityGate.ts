// WHY: TS-native mirror of src/shared/modelCapabilityGate.js.
// The JS module is the SSOT (tested in src/shared/tests/modelCapabilityGate.test.js).
// Masks stored phase overrides by the target model's declared capabilities so
// stale toggles from a prior model selection can't leak through to display badges.

import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';

export interface ModelCapabilities {
  readonly thinking: boolean;
  readonly webSearch: boolean;
  readonly thinkingEffortOptions: readonly string[];
}

export interface StoredCapabilityValues {
  readonly thinking?: boolean | null;
  readonly webSearch?: boolean | null;
  readonly thinkingEffort?: string | null;
}

export interface GatedCapabilityValues {
  readonly thinking: boolean;
  readonly webSearch: boolean;
  readonly thinkingEffort: string;
}

export function gateCapabilities(
  stored: StoredCapabilityValues | null | undefined = {},
  capabilities: ModelCapabilities | null | undefined = null,
): GatedCapabilityValues {
  const supportsThinking = Boolean(capabilities?.thinking);
  const supportsWebSearch = Boolean(capabilities?.webSearch);
  return {
    thinking: Boolean(stored?.thinking) && supportsThinking,
    webSearch: Boolean(stored?.webSearch) && supportsWebSearch,
    thinkingEffort: supportsThinking ? String(stored?.thinkingEffort ?? '') : '',
  };
}

function stripComposite(key: string): string {
  const i = key.indexOf(':');
  return i > 0 ? key.slice(i + 1) : key;
}

/**
 * Extract capabilities for a model from the provider registry array.
 * Accepts composite ("providerId:modelId") or bare model key.
 */
export function capabilitiesFromRegistry(
  registry: readonly LlmProviderEntry[] | null | undefined,
  modelKey: string | null | undefined,
): ModelCapabilities | null {
  if (!registry || !modelKey) return null;
  const key = String(modelKey).trim();
  if (!key) return null;

  const colonIdx = key.indexOf(':');
  const bareId = stripComposite(key);

  for (const provider of registry) {
    if (colonIdx > 0 && provider.id !== key.slice(0, colonIdx)) continue;
    for (const model of provider.models ?? []) {
      if (model.modelId === bareId) {
        const m = model as LlmProviderEntry['models'][number] & {
          thinking?: boolean;
          webSearch?: boolean;
          thinkingEffortOptions?: readonly string[];
        };
        return {
          thinking: Boolean(m.thinking),
          webSearch: Boolean(m.webSearch),
          thinkingEffortOptions: Array.isArray(m.thinkingEffortOptions) ? m.thinkingEffortOptions : [],
        };
      }
    }
    if (colonIdx > 0) return null;
  }
  return null;
}
