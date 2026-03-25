// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

import type { LlmPhaseDefinition, LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';

export const LLM_PHASE_IDS = [
  'global',
  'needset',
  'search-planner',
  'brand-resolver',
  'serp-selector',
  'validate',
] as const satisfies readonly LlmPhaseId[];

export const LLM_PHASES: readonly LlmPhaseDefinition[] = [
  { id: 'global', label: 'Global', subtitle: 'Provider, budget, limits, cache', tip: 'Global LLM provider, API keys, budget guards, token limits, reasoning mode, and extraction cache.', roles: [] },
  { id: 'needset', label: 'Needset', subtitle: 'Base Model', tip: 'Base Model shared with Search Planner. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['plan'], sharedWith: ['search-planner'] },
  { id: 'search-planner', label: 'Search Planner', subtitle: 'Base Model', tip: 'Base Model shared with Needset. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['plan'], sharedWith: ['needset'] },
  { id: 'brand-resolver', label: 'Brand Resolver', subtitle: 'Base Model', tip: 'Base Model shared with SERP Selector. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['triage'], sharedWith: ['serp-selector'] },
  { id: 'serp-selector', label: 'SERP Selector', subtitle: 'Base Model', tip: 'LLM-based URL selector that decides fetch-worthiness. Uses triage token budget.', roles: ['triage'], sharedWith: ['brand-resolver'] },
  { id: 'validate', label: 'Validate', subtitle: 'Base Model', tip: 'Model override for the validation pass that confirms uncertain field candidates.', roles: ['validate'] },
] as const;
