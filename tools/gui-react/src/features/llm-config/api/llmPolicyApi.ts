import { api } from '../../../api/client';
import type { LlmPolicy } from '../types/llmPolicyTypes';

export const LLM_POLICY_QUERY_KEY = ['llm-policy'] as const;

export function fetchLlmPolicy(): Promise<{ ok: boolean; policy: LlmPolicy }> {
  return api.get<{ ok: boolean; policy: LlmPolicy }>('/llm-policy');
}

export function persistLlmPolicy(
  policy: LlmPolicy,
): Promise<{ ok: boolean; policy: LlmPolicy }> {
  return api.put<{ ok: boolean; policy: LlmPolicy }>('/llm-policy', policy);
}
