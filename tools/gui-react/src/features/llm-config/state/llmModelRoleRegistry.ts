/**
 * SSOT registry for LLM model roles.
 * Adding a new role requires exactly ONE change: add an entry here.
 * Labels, token validation entries, and empty-model checks all derive from this.
 */

export interface LlmModelRoleEntry {
  role: string;
  modelKey: string;
  tokenKey: string;
  label: string;
  fallbackModelKey?: string;
  fallbackTokenKey?: string;
}

export const LLM_MODEL_ROLES: readonly LlmModelRoleEntry[] = [
  { role: 'Plan', modelKey: 'llmModelPlan', tokenKey: 'llmMaxOutputTokensPlan', label: 'Base model', fallbackModelKey: 'llmPlanFallbackModel', fallbackTokenKey: 'llmMaxOutputTokensPlanFallback' },
  { role: 'Reasoning', modelKey: 'llmModelReasoning', tokenKey: 'llmMaxOutputTokensReasoning', label: 'Reasoning model', fallbackModelKey: 'llmReasoningFallbackModel', fallbackTokenKey: 'llmMaxOutputTokensReasoningFallback' },
];

/** Field → label map. Consumed by validation and stale-model detection. */
export const LLM_MODEL_FIELD_LABELS: Readonly<Record<string, string>> =
  Object.fromEntries(LLM_MODEL_ROLES.map((r) => [r.modelKey, r.label]));

/** Token validation entries. Consumed by validatePhaseTokenLimits. */
export const LLM_TOKEN_VALIDATION_ENTRIES: readonly { phase: string; modelKey: string; tokenKey: string }[] =
  LLM_MODEL_ROLES.flatMap((r) => {
    const entries = [{ phase: r.role, modelKey: r.modelKey, tokenKey: r.tokenKey }];
    if (r.fallbackModelKey && r.fallbackTokenKey) {
      entries.push({ phase: `${r.role} Fallback`, modelKey: r.fallbackModelKey, tokenKey: r.fallbackTokenKey });
    }
    return entries;
  });
