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
  'color-finder',
  'image-finder',
  'image-evaluator',
  'release-date-finder',
] as const satisfies readonly LlmPhaseId[];

export const LLM_PHASES: readonly LlmPhaseDefinition[] = [
  { id: 'global', label: 'Global', subtitle: 'Provider, budget, limits, cache', tip: 'Global LLM provider, API keys, budget guards, token limits, reasoning mode, and extraction cache.', roles: [], group: 'global' },
  { id: 'needset', label: 'Needset', subtitle: 'Base Model', tip: 'Base Model shared with Search Planner. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['plan'], sharedWith: ['search-planner'], group: 'indexing' },
  { id: 'search-planner', label: 'Search Planner', subtitle: 'Base Model', tip: 'Base Model shared with Needset. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['plan'], sharedWith: ['needset'], group: 'indexing' },
  { id: 'brand-resolver', label: 'Brand Resolver', subtitle: 'Base Model', tip: 'Base Model shared with SERP Selector. Opt-in reasoning toggle overrides with shared Reasoning Model.', roles: ['triage'], sharedWith: ['serp-selector'], group: 'indexing' },
  { id: 'serp-selector', label: 'SERP Selector', subtitle: 'Base Model', tip: 'LLM-based URL selector that decides fetch-worthiness. Uses triage token budget.', roles: ['triage'], sharedWith: ['brand-resolver'], group: 'indexing' },
  { id: 'validate', label: 'Validate', subtitle: 'Base Model', tip: 'Model override for the validation pass that confirms uncertain field candidates.', roles: ['validate'], group: 'publish' },
  { id: 'color-finder', label: 'Color & Edition Finder', subtitle: 'Discovery', tip: 'Discovers product color variants and limited editions using web search. Runs independently of the crawl pipeline.', roles: ['triage'], group: 'discovery' },
  { id: 'image-finder', label: 'Product Image Finder', subtitle: 'Discovery', tip: 'Finds and downloads official product identity images (specific views) for each product. Runs independently of the crawl pipeline.', roles: ['triage'], group: 'discovery' },
  { id: 'image-evaluator', label: 'Carousel Builder', subtitle: 'Discovery', tip: 'Vision-based image evaluator that selects the best product image per view and picks hero carousel shots.', roles: ['triage'], group: 'discovery' },
  { id: 'release-date-finder', label: 'Release Date Finder', subtitle: 'Discovery', tip: 'Discovers per-variant first-availability release dates via web search. Candidates flow through the publisher gate with evidence validation.', roles: ['triage'], group: 'discovery' },
] as const;

export const LLM_PHASE_GROUP_LABELS: Record<string, string> = {
  global: 'Global',
  indexing: 'Indexing Pipeline',
  publish: 'Publish Pipeline',
  discovery: 'Discovery',
};
