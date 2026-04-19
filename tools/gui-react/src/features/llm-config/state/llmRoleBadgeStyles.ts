import type { LlmModelRole, LlmAccessMode } from '../types/llmProviderRegistryTypes.ts';

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

export const ACCESS_MODE_BADGE_STYLE: Record<LlmAccessMode, { fg: string; bg: string; label: string }> = {
  api: { fg: 'rgb(var(--sf-color-text-muted-rgb))', bg: 'rgb(var(--sf-color-text-muted-rgb) / 0.08)', label: 'API' },
  lab: { fg: 'var(--sf-state-run-ai-fg)', bg: 'rgb(var(--sf-color-accent-strong-rgb) / 0.12)', label: 'LAB' },
};

export const ROLE_ICON_STYLE: Record<LlmModelRole, { fg: string; bg: string; title: string }> = {
  primary: { fg: 'rgb(var(--sf-color-text-muted-rgb))', bg: 'rgb(var(--sf-color-text-muted-rgb) / 0.08)', title: 'Primary' },
  reasoning: { fg: 'var(--sf-state-run-ai-fg)', bg: 'rgb(var(--sf-color-accent-strong-rgb) / 0.08)', title: 'Reasoning' },
  embedding: { fg: 'var(--sf-state-success-fg)', bg: 'var(--sf-state-success-bg)', title: 'Embedding' },
};

export const CAPABILITY_BADGE_STYLE: Record<'thinking' | 'webSearch' | 'fallback', { fg: string; bg: string; title: string }> = {
  thinking: { fg: 'var(--sf-state-run-ai-fg)', bg: 'rgb(var(--sf-color-accent-strong-rgb) / 0.08)', title: 'Extended thinking' },
  webSearch: { fg: 'var(--sf-state-success-fg)', bg: 'var(--sf-state-success-bg)', title: 'Web search' },
  fallback: { fg: 'var(--sf-state-warning-fg)', bg: 'var(--sf-state-warning-bg)', title: 'Fallback model — primary failed, this call used the configured fallback' },
};
