export type LlmPhaseId =
  | 'global'
  | 'needset'
  | 'brand-resolver'
  | 'search-planner'
  | 'serp-triage'
  | 'domain-classifier'
  | 'extraction'
  | 'validate'
  | 'write';

export interface LlmPhaseDefinition {
  id: LlmPhaseId;
  label: string;
  subtitle: string;
  tip: string;
  roles: ReadonlyArray<'plan' | 'triage' | 'reasoning' | 'extract' | 'validate' | 'write'>;
  sharedWith?: ReadonlyArray<LlmPhaseId>;
}
