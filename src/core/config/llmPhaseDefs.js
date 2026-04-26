// WHY: Single source of truth for LLM pipeline phase definitions.
// configPostMerge.js imports this to resolve per-phase overrides.
// GUI codegen (tools/gui-react/scripts/generateLlmPhaseRegistry.js) reads
// this to generate TypeScript registries — zero manual frontend duplication.
// Adding a new LLM phase = add one entry here + run codegen.

// WHY: GUI-only global entry — not a pipeline phase, but the GUI renders it
// as the first tab for provider/budget/limits configuration.
// WHY: Group IDs for sidebar section headers in the GUI.
// 'global' stands alone, 'writer' is the global JSON formatter invoked
// whenever any other phase runs with jsonStrict=false, 'indexing' groups
// crawl-pipeline phases, 'discovery' groups standalone features.
export const LLM_PHASE_GROUPS = Object.freeze(['global', 'writer', 'indexing', 'discovery']);

export const LLM_PHASE_UI_GLOBAL = Object.freeze({
  id: 'global',
  uiId: 'global',
  label: 'Global',
  subtitle: 'Provider, budget, limits, cache',
  tip: 'Global LLM provider, API keys, budget guards, token limits, reasoning mode, and extraction cache.',
  roles: [],
  group: 'global',
});

// WHY: GUI-only Discovery entry for editable universal prompt fragments
// (identity warning, siblings exclusion, evidence contract, value confidence
// rubric, discovery history header). Shared by CEF + PIF + RDF and any
// future finder. Lives in the Discovery group so it sits with the finders
// it configures, not with the LLM plumbing in the Global tab.
export const LLM_PHASE_UI_GLOBAL_PROMPTS = Object.freeze({
  id: 'global-prompts',
  uiId: 'global-prompts',
  label: 'Global Prompts',
  subtitle: 'Shared finder fragments',
  tip: 'Universal prompt fragments used by every finder (identity warning, siblings exclusion, evidence contract, value confidence rubric, discovery history header). CEF + RDF consume the evidence/confidence fragments; PIF is the documented exception.',
  roles: [],
  group: 'discovery',
});

// WHY: `billing` entries are O(1) SSOT for the /billing dashboard registry. Each
// phase lists the `reason` strings its LLM adapter emits; codegen flattens these
// into BILLING_CALL_TYPE_REGISTRY. Adding a new finder = one entry here.
export const LLM_PHASE_DEFS = Object.freeze([
  // WHY: Writer is a global first-class phase — the dedicated JSON formatter
  // invoked whenever any other phase runs with jsonStrict=false. It has no
  // global-model inheritance (it IS the writer), no JSON-strict knob (always
  // enforces schema), no webSearch. Fallback inherits the global fallback by
  // default and can be overridden in the Writer panel. Ordering puts it at the
  // top of the UI (below Global, above Indexing Pipeline).
  { id: 'writer',        uiId: 'writer',           label: 'Writer',         subtitle: 'JSON Strict Disabled Formatter', tip: 'Dedicated model that formats research output into JSON schema when any other phase runs with JSON Strict off. Global — applies to all two-phase calls.', roles: ['write'], group: 'writer', globalModel: null, groupToggle: null, globalTokens: null, globalTimeout: null, globalContextTokens: null, globalReasoningBudget: null, globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Writer', reasons: [{ reason: 'writer_formatting', label: 'Writer', color: 'var(--sf-billing-writer-1, #495057)' }] } },
  { id: 'needset',       uiId: 'needset',          label: 'Needset',        subtitle: 'Base Model', tip: 'Base Model shared with Search Planner. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['plan'],     sharedWith: ['search-planner'],  group: 'indexing', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Pipeline', reasons: [{ reason: 'needset_search_planner', label: 'NeedSet', color: 'var(--sf-billing-pipeline-1, #748ffc)' }] } },
  { id: 'searchPlanner', uiId: 'search-planner',   label: 'Search Planner', subtitle: 'Base Model', tip: 'Base Model shared with Needset. Opt-in reasoning toggle overrides with shared Reasoning Model.',        roles: ['plan'],     sharedWith: ['needset'],         group: 'indexing', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Pipeline', reasons: [{ reason: 'search_planner_enhance', label: 'Search Planner', color: 'var(--sf-billing-pipeline-3, #4c6ef5)' }] } },
  { id: 'brandResolver', uiId: 'brand-resolver',   label: 'Brand Resolver', subtitle: 'Base Model', tip: 'Base Model shared with SERP Selector. Opt-in reasoning toggle overrides with shared Reasoning Model.',  roles: ['triage'],   sharedWith: ['serp-selector'],   group: 'indexing', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan',   globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Pipeline', reasons: [{ reason: 'brand_resolution', label: 'Brand', color: 'var(--sf-billing-pipeline-2, #5c7cfa)' }] } },
  { id: 'serpSelector',  uiId: 'serp-selector',    label: 'SERP Selector',  subtitle: 'Base Model', tip: 'LLM-based URL selector that decides fetch-worthiness. Uses triage token budget.',                      roles: ['triage'],   sharedWith: ['brand-resolver'],  group: 'indexing', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensTriage', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Pipeline', reasons: [{ reason: 'serp_url_selector', label: 'SERP Selector', color: 'var(--sf-billing-pipeline-4, #4263eb)' }] } },
  { id: 'colorFinder',   uiId: 'color-finder',      label: 'Color & Edition Finder', subtitle: 'Discovery', tip: 'Discovers product color variants and limited editions using web search. Runs independently of the crawl pipeline.', roles: ['triage'], group: 'discovery', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Color Edition', reasons: [
      { reason: 'color_edition_finding', label: 'CEF', color: 'var(--sf-billing-color-1, #da77f2)' },
      { reason: 'variant_identity_check', label: 'Variant ID', color: 'var(--sf-billing-color-2, #be4bdb)' },
    ] } },
  { id: 'imageFinder',   uiId: 'image-finder',      label: 'Product Image Finder',   subtitle: 'Discovery', tip: 'Finds and downloads official product identity images (specific views) for each product. Runs independently of the crawl pipeline.', roles: ['triage'], group: 'discovery', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Product Image', reasons: [
      { reason: 'product_image_finding', label: 'Image Finder', color: 'var(--sf-billing-image-1, #ff922b)' },
      { reason: 'hero_image_finding', label: 'Hero Finder', color: 'var(--sf-billing-image-4, #e8590c)' },
    ] } },
  { id: 'imageEvaluator', uiId: 'image-evaluator',    label: 'Carousel Builder',       subtitle: 'Discovery', tip: 'Vision-based image evaluator that selects the best product image per view and picks hero carousel shots.', roles: ['triage'], group: 'discovery', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Product Image', reasons: [
      { reason: 'image_view_evaluation', label: 'View Eval', color: 'var(--sf-billing-image-2, #fd7e14)' },
      { reason: 'image_hero_selection', label: 'Hero Eval', color: 'var(--sf-billing-image-3, #f76707)' },
    ] } },
  { id: 'releaseDateFinder', uiId: 'release-date-finder', label: 'Release Date Finder', subtitle: 'Discovery', tip: 'Discovers per-variant first-availability release dates via web search. Candidates flow through the publisher gate with evidence validation.', roles: ['triage'], group: 'discovery', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Release Date', reasons: [{ reason: 'release_date_finding', label: 'RDF', color: 'var(--sf-billing-releasedate-1, #fcc419)' }] } },
  { id: 'skuFinder', uiId: 'sku-finder', label: 'SKU Finder', subtitle: 'Discovery', tip: 'Discovers per-variant manufacturer part numbers (MPNs) via web search. Candidates flow through the publisher gate with evidence validation.', roles: ['triage'], group: 'discovery', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'SKU', reasons: [{ reason: 'sku_finding', label: 'SKF', color: 'var(--sf-billing-sku-1, #ae3ec9)' }] } },
  // WHY: Universal per-key extractor. Phase-level BASE MODEL inherits from plan like other finders;
  // 5 per-tier model overrides layer on top at runtime (Phase 3 routing). Budget/bundling knobs in settingsRegistry.
  { id: 'keyFinder', uiId: 'key-finder', label: 'Key Finder', subtitle: 'Universal per-key extractor', tip: 'Runs one universal per-key extractor across every field_rule. Difficulty routes to a tier model override; required×availability×difficulty×variantCount scores the per-key attempt budget; same-group point-pool bundling is opt-in for Smart Loop modes only.', roles: ['triage'], group: 'discovery', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan', globalTimeout: 'llmTimeoutMs', globalContextTokens: 'llmMaxTokens', globalReasoningBudget: 'llmReasoningBudget', globalFallbackModel: 'llmPlanFallbackModel', globalFallbackReasoningModel: 'llmReasoningFallbackModel',
    billing: { group: 'Key Finder', reasons: [
      { reason: 'key_finding_easy',      label: 'Easy',      color: 'var(--sf-billing-keyfinder-1, #66d9e8)' },
      { reason: 'key_finding_medium',    label: 'Medium',    color: 'var(--sf-billing-keyfinder-2, #22b8cf)' },
      { reason: 'key_finding_hard',      label: 'Hard',      color: 'var(--sf-billing-keyfinder-3, #0c8599)' },
      { reason: 'key_finding_very_hard', label: 'Very Hard', color: 'var(--sf-billing-keyfinder-4, #0b7285)' },
    ] } },
]);

export const LLM_PHASE_IDS = LLM_PHASE_DEFS.map((d) => d.id);
