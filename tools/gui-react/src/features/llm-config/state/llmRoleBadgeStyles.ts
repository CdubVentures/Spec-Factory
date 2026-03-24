import type { LlmModelRole } from '../types/llmProviderRegistryTypes.ts';

export const ROLE_BADGE_STYLE: Record<LlmModelRole, { fg: string; bg: string }> = {
  primary: { fg: 'rgb(var(--sf-color-text-muted-rgb))', bg: 'rgb(var(--sf-color-text-muted-rgb) / 0.10)' },
  reasoning: { fg: 'var(--sf-state-run-ai-fg)', bg: 'rgb(var(--sf-color-accent-strong-rgb) / 0.10)' },
  embedding: { fg: 'var(--sf-state-success-fg)', bg: 'var(--sf-state-success-bg)' },
};

export const ROLE_LABEL: Record<LlmModelRole, string> = {
  primary: 'Primary',
  reasoning: 'Reasoning',
  embedding: 'Embedding',
};

export const MODEL_ROLE_OPTIONS: readonly { value: LlmModelRole; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'reasoning', label: 'Reasoning' },
];
