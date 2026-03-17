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
      { key: 'serpTriageMinScore', label: 'Min Score Threshold', tip: 'Minimum LLM triage score (1-10) for a SERP result to pass. Higher values filter more aggressively.', type: 'int', min: 1, max: 10 },
      { key: 'serpTriageMaxUrls', label: 'Max URLs After Triage', tip: 'Maximum number of URLs kept after triage scoring. Lower values reduce fetch volume; higher values increase coverage.', type: 'int', min: 5, max: 30 },
    ],
  },
] as ConvergenceKnobGroup[];

export const CONVERGENCE_SETTING_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.convergence,
} satisfies Record<string, number | boolean>);
