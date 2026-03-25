export type LlmPhaseId =
  | 'global'
  | 'needset'
  | 'brand-resolver'
  | 'search-planner'
  | 'serp-selector'
  | 'validate';

export interface LlmPhaseDefinition {
  id: LlmPhaseId;
  label: string;
  subtitle: string;
  tip: string;
  roles: ReadonlyArray<'plan' | 'triage' | 'reasoning' | 'validate'>;
  sharedWith?: ReadonlyArray<LlmPhaseId>;
}
