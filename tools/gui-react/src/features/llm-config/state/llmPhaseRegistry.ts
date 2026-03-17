import type { LlmPhaseDefinition, LlmPhaseId } from '../types/llmPhaseTypes';

export const LLM_PHASE_IDS = [
  'global',
  'needset',
  'brand-resolver',
  'search-planner',
  'serp-triage',
  'domain-classifier',
  'extraction',
] as const satisfies readonly LlmPhaseId[];

export const LLM_PHASES: readonly LlmPhaseDefinition[] = [
  {
    id: 'global',
    label: 'Global',
    subtitle: 'Provider, budget, limits, cortex, cache',
    tip: 'Global LLM provider, API keys, budget guards, token limits, reasoning mode, cortex sidecar, and extraction cache.',
    roles: [],
  },
  {
    id: 'needset',
    label: 'Needset',
    subtitle: 'Base Model',
    tip: 'Base Model shared with Search Planner. Opt-in reasoning toggle overrides with shared Reasoning Model.',
    roles: ['plan'],
    sharedWith: ['search-planner'],
  },
  {
    id: 'brand-resolver',
    label: 'Brand Resolver',
    subtitle: 'Base Model',
    tip: 'Base Model shared with SERP Triage and Domain Classifier. Opt-in reasoning toggle overrides with shared Reasoning Model.',
    roles: ['triage'],
    sharedWith: ['serp-triage', 'domain-classifier'],
  },
  {
    id: 'search-planner',
    label: 'Search Planner',
    subtitle: 'Base Model',
    tip: 'Base Model shared with Needset. Opt-in reasoning toggle overrides with shared Reasoning Model.',
    roles: ['plan'],
    sharedWith: ['needset'],
  },
  {
    id: 'serp-triage',
    label: 'SERP Triage',
    subtitle: 'Base Model',
    tip: 'Base Model shared with Brand Resolver and Domain Classifier. Opt-in reasoning toggle overrides with shared Reasoning Model.',
    roles: ['triage'],
    sharedWith: ['brand-resolver', 'domain-classifier'],
  },
  {
    id: 'domain-classifier',
    label: 'Domain Classifier',
    subtitle: 'Base Model',
    tip: 'Base Model shared with Brand Resolver and SERP Triage. Opt-in reasoning toggle overrides with shared Reasoning Model.',
    roles: ['triage'],
    sharedWith: ['brand-resolver', 'serp-triage'],
  },
  {
    id: 'extraction',
    label: 'Extraction',
    subtitle: 'Extract + Validate + Write roles',
    tip: 'LLM configuration for the extraction pipeline: per-sub-role model, tokens, provider overrides, verification, and cortex deep reasoning.',
    roles: ['extract', 'validate', 'write'],
  },
] as const;
