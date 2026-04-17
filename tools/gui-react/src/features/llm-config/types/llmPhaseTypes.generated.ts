// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

export type LlmPhaseId =
  | 'global'
  | 'needset'
  | 'search-planner'
  | 'brand-resolver'
  | 'serp-selector'
  | 'validate'
  | 'color-finder'
  | 'image-finder'
  | 'image-evaluator'
  | 'release-date-finder';

export type LlmPhaseGroup =
  | 'global'
  | 'indexing'
  | 'publish'
  | 'discovery';

export interface LlmPhaseDefinition {
  id: LlmPhaseId;
  label: string;
  subtitle: string;
  tip: string;
  roles: ReadonlyArray<'plan' | 'triage' | 'reasoning' | 'validate'>;
  sharedWith?: ReadonlyArray<LlmPhaseId>;
  group: LlmPhaseGroup;
}
