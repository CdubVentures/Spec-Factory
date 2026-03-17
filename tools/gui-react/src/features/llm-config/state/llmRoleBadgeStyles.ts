import type { LlmModelRole } from '../types/llmProviderRegistryTypes';

export const ROLE_BADGE_STYLE: Record<LlmModelRole, { color: string; bg: string }> = {
  primary: { color: '#888780', bg: '#F1EFE8' },
  reasoning: { color: '#534AB7', bg: '#EEEDFE' },
  fast: { color: '#185FA5', bg: '#E6F1FB' },
  embedding: { color: '#0F6E56', bg: '#E1F5EE' },
};

export const MODEL_ROLE_OPTIONS: readonly { value: LlmModelRole; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'fast', label: 'Fast' },
  { value: 'embedding', label: 'Embedding' },
];
