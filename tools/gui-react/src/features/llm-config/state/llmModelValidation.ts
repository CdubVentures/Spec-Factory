import type { MixIssue } from './llmMixDetection.ts';
import { LLM_MODEL_FIELD_LABELS } from './llmModelRoleRegistry.ts';

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
