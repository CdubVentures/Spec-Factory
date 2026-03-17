import type { LlmPhaseDefinition, LlmPhaseId } from '../types/llmPhaseTypes';

export const LLM_PHASE_IDS = [
  'global',
  'needset',
  'brand-resolver',
  'search-planner',
  'serp-triage',
  'domain-classifier',
  'extraction',
  'validate',
  'write',
] as const satisfies readonly LlmPhaseId[];

export const LLM_PHASES: readonly LlmPhaseDefinition[] = [
  {
    id: 'global',
    label: 'Global',
    subtitle: 'Provider, budget, limits, cache',
    tip: 'Global LLM provider, API keys, budget guards, token limits, reasoning mode, and extraction cache.',
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
    subtitle: 'Extract model + batching',
    tip: 'LLM configuration for the extraction pipeline: model, tokens, batching, and verification.',
    roles: ['extract'],
  },
  {
    id: 'validate',
    label: 'Validate',
    subtitle: 'Base Model',
    tip: 'Model override for the validation pass that confirms uncertain field candidates.',
    roles: ['validate'],
  },
  {
    id: 'write',
    label: 'Write',
    subtitle: 'Base Model',
    tip: 'Model override for the summary writer that produces final markdown output.',
    roles: ['write'],
  },
] as const;
