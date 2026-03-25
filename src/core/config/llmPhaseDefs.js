// WHY: Single source of truth for LLM pipeline phase definitions.
// configPostMerge.js imports this to resolve per-phase overrides.
// GUI codegen (tools/gui-react/scripts/generateLlmPhaseRegistry.js) reads
// this to generate TypeScript registries — zero manual frontend duplication.
// Adding a new LLM phase = add one entry here + run codegen.

// WHY: GUI-only global entry — not a pipeline phase, but the GUI renders it
// as the first tab for provider/budget/limits configuration.
export const LLM_PHASE_UI_GLOBAL = Object.freeze({
  id: 'global',
  uiId: 'global',
  label: 'Global',
  subtitle: 'Provider, budget, limits, cache',
  tip: 'Global LLM provider, API keys, budget guards, token limits, reasoning mode, and extraction cache.',
  roles: [],
});

export const LLM_PHASE_DEFS = Object.freeze([
  { id: 'needset',       uiId: 'needset',          label: 'Needset',        subtitle: 'Base Model', tip: 'Base Model shared with Search Planner. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['plan'],     sharedWith: ['search-planner'],  globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'searchPlanner', uiId: 'search-planner',   label: 'Search Planner', subtitle: 'Base Model', tip: 'Base Model shared with Needset. Opt-in reasoning toggle overrides with shared Reasoning Model.',        roles: ['plan'],     sharedWith: ['needset'],         globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'brandResolver', uiId: 'brand-resolver',   label: 'Brand Resolver', subtitle: 'Base Model', tip: 'Base Model shared with SERP Selector. Opt-in reasoning toggle overrides with shared Reasoning Model.',  roles: ['triage'],   sharedWith: ['serp-selector'],   globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'serpSelector',  uiId: 'serp-selector',    label: 'SERP Selector',  subtitle: 'Base Model', tip: 'LLM-based URL selector that decides fetch-worthiness. Uses triage token budget.',                      roles: ['triage'],   sharedWith: ['brand-resolver'],  globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensTriage', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
  { id: 'validate',      uiId: 'validate',         label: 'Validate',       subtitle: 'Base Model', tip: 'Model override for the validation pass that confirms uncertain field candidates.',                      roles: ['validate'],                                  globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens' },
]);

export const LLM_PHASE_IDS = LLM_PHASE_DEFS.map((d) => d.id);
