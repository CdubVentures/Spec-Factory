// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

export type LlmPhaseId =
  | 'global'
  | 'writer'
  | 'needset'
  | 'search-planner'
  | 'brand-resolver'
  | 'serp-selector'
  | 'global-prompts'
  | 'color-finder'
  | 'image-finder'
  | 'image-evaluator'
  | 'release-date-finder'
  | 'sku-finder'
  | 'key-finder';

export type LlmPhaseGroup =
  | 'global'
  | 'writer'
  | 'indexing'
  | 'discovery';

export interface LlmPhaseDefinition {
  id: LlmPhaseId;
  label: string;
  subtitle: string;
  tip: string;
  roles: ReadonlyArray<'plan' | 'triage' | 'reasoning' | 'validate' | 'write'>;
  sharedWith?: ReadonlyArray<LlmPhaseId>;
  group: LlmPhaseGroup;
}
