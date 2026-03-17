import type { LlmModelRole } from '../types/llmProviderRegistryTypes';

export const ROLE_BADGE_STYLE: Record<LlmModelRole, { fg: string; bg: string }> = {
  primary: { fg: 'rgb(var(--sf-color-text-muted-rgb))', bg: 'rgb(var(--sf-color-text-muted-rgb) / 0.10)' },
  reasoning: { fg: 'var(--sf-state-run-ai-fg)', bg: 'rgb(var(--sf-color-accent-strong-rgb) / 0.10)' },
  fast: { fg: 'var(--sf-token-accent)', bg: 'rgb(var(--sf-color-accent-rgb) / 0.10)' },
  embedding: { fg: 'var(--sf-state-success-fg)', bg: 'var(--sf-state-success-bg)' },
};

export const ROLE_ICON: Record<LlmModelRole, { d: string; viewBox: string; size: number }> = {
  primary: { d: 'M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', viewBox: '0 0 12 12', size: 10 },
  fast: { d: 'M7 1 3 7h3L5 13l5-6H7L9 1Z', viewBox: '0 0 14 14', size: 9 },
  reasoning: { d: 'M7 0 0 7l7 7 7-7L7 0Z', viewBox: '0 0 14 14', size: 12.5 },
  embedding: { d: 'M6 1v10M1 6h10', viewBox: '0 0 12 12', size: 10 },
};

export const ROLE_LABEL: Record<LlmModelRole, string> = {
  primary: 'Primary',
  fast: 'Fast',
  reasoning: 'Reasoning',
  embedding: 'Embedding',
};

export const MODEL_ROLE_OPTIONS: readonly { value: LlmModelRole; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'fast', label: 'Fast' },
  { value: 'embedding', label: 'Embedding' },
];
