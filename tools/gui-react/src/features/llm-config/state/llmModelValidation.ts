import type { MixIssue } from './llmMixDetection.ts';
import { LLM_MODEL_FIELD_LABELS } from './llmModelRoleRegistry.ts';

// WHY: Accepts a loose registry shape so both LlmProviderEntry (internal)
// and LlmProviderRegistryEntry (API) can be passed without casting.
interface RegistryEntryLike {
  enabled?: boolean;
  models?: ReadonlyArray<{ modelId: string }>;
}

function resolveModelInRegistry(
  registry: ReadonlyArray<RegistryEntryLike>,
  modelId: string,
): boolean {
  if (!modelId || !modelId.trim()) return false;
  return registry.some(
    (p) => p.enabled && p.models?.some((m) => m.modelId === modelId),
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
