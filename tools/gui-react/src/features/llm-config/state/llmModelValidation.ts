import type { MixIssue } from './llmMixDetection.ts';
import { LLM_MODEL_FIELD_LABELS } from './llmModelRoleRegistry.ts';

// WHY: Accepts a loose registry shape so both LlmProviderEntry (internal)
// and LlmProviderRegistryEntry (API) can be passed without casting.
interface RegistryEntryLike {
  models?: ReadonlyArray<{ modelId: string }>;
}

function resolveModelInRegistry(
  registry: ReadonlyArray<RegistryEntryLike>,
  key: string,
): boolean {
  if (!key || !key.trim()) return false;
  // WHY: Support composite keys (providerId:modelId) from dropdown selections
  const colonIdx = key.indexOf(':');
  const providerId = colonIdx > 0 ? key.slice(0, colonIdx) : null;
  const modelId = colonIdx > 0 ? key.slice(colonIdx + 1) : key;
  if (providerId) {
    return registry.some(
      (p) => (p as { id?: string }).id === providerId && p.models?.some((m) => m.modelId === modelId),
    );
  }
  return registry.some(
    (p) => p.models?.some((m) => m.modelId === modelId),
  );
}

export function validateModelExistence(
  modelFields: Record<string, string>,
  registry: ReadonlyArray<RegistryEntryLike>,
): MixIssue[] {
  const issues: MixIssue[] = [];
  for (const [field, value] of Object.entries(modelFields)) {
    if (!value || !value.trim()) continue;
    if (!resolveModelInRegistry(registry, value)) {
      const label = LLM_MODEL_FIELD_LABELS[field] ?? field;
      issues.push({
        key: `invalid-model-${field}`,
        severity: 'error',
        title: `${label}: model not found`,
        message: `"${value}" does not exist in any enabled provider. Select a valid model.`,
        ringFields: [field],
      });
    }
  }
  return issues;
}

export function detectEmptyModelFields(
  modelFields: Record<string, string>,
): MixIssue[] {
  const issues: MixIssue[] = [];
  for (const [field, value] of Object.entries(modelFields)) {
    if (!value || !value.trim()) {
      const label = LLM_MODEL_FIELD_LABELS[field] ?? field;
      issues.push({
        key: `empty-model-${field}`,
        severity: 'error',
        title: `${label} is empty`,
        message: `No model selected for ${label}. Select a model before running.`,
        ringFields: [field],
      });
    }
  }
  return issues;
}
