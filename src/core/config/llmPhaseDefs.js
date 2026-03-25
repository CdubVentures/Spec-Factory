// WHY: Single source of truth for LLM pipeline phase definitions.
// configPostMerge.js imports this to resolve per-phase overrides.
// Adding a new LLM phase = add one entry here.

export const LLM_PHASE_DEFS = Object.freeze([
  { id: 'needset',       label: 'Needset',        roles: ['plan'],     globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'searchPlanner', label: 'Search Planner',  roles: ['plan'],     globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'brandResolver', label: 'Brand Resolver',  roles: ['triage'],   globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'serpSelector',  label: 'SERP Selector',   roles: ['triage'],   globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensTriage', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'validate',      label: 'Validate',        roles: ['validate'], globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
]);

export const LLM_PHASE_IDS = LLM_PHASE_DEFS.map((d) => d.id);
