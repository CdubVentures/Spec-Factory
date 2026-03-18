import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

export interface ConvergenceBoolKnob {
  key: string;
  label: string;
  tip?: string;
  type: 'bool';
  locked?: boolean;
  lockedValue?: boolean;
  lockedTip?: string;
}

export interface ConvergenceNumericKnob {
  key: string;
  label: string;
  tip?: string;
  type: 'int' | 'float';
  min: number;
  max: number;
  step?: number;
  locked?: boolean;
  lockedValue?: number;
  lockedTip?: string;
}

export type ConvergenceKnob = ConvergenceBoolKnob | ConvergenceNumericKnob;

export interface ConvergenceKnobGroup {
  label: string;
  knobs: ConvergenceKnob[];
}

export const CONVERGENCE_KNOB_GROUPS = [
  {
    label: 'SERP Triage',
    knobs: [
      { key: 'serpTriageMinScore', label: 'Min Score Threshold', tip: 'Phase coverage: 07 SERP Triage.\nLives in: processDiscoveryResults() after raw search results are normalized and reranked.\nWhat this controls: the minimum combined triage score a candidate URL must reach to survive into approved or candidate routing. Higher values make admission stricter and reduce fetch volume.', type: 'int', min: 1, max: 10 },
      { key: 'serpTriageMaxUrls', label: 'Max URLs After Triage', tip: 'Phase coverage: 07 SERP Triage into 08 Fetch and Parse Entry.\nLives in: the final truncation step after URL safety, reranking, and triage decisions are complete.\nWhat this controls: the maximum number of URLs the planner is allowed to hand forward after triage. Lower values cut cost; higher values increase coverage and downstream fetch pressure.', type: 'int', min: 5, max: 30 },
    ],
  },
] as ConvergenceKnobGroup[];

export const CONVERGENCE_SETTING_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.convergence,
} satisfies Record<string, number | boolean>);
