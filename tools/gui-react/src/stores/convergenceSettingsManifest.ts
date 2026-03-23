import { SETTINGS_DEFAULTS } from '../../../../src/shared/settingsDefaults.js';
import { CONVERGENCE_SETTINGS_REGISTRY } from '../../../../src/shared/settingsRegistry.js';

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

// WHY: UI-only metadata for convergence knobs. Structural fields (key, type, min, max)
// are derived from CONVERGENCE_SETTINGS_REGISTRY — adding a new knob requires only
// one registry entry + one label/tip here.
const KNOB_UI_META: Record<string, { label: string; tip?: string }> = {
  serpTriageMinScore: {
    label: 'Min Score Threshold',
    tip: 'Phase coverage: 07 SERP Selector.\nLives in: processDiscoveryResults() after raw search results are normalized and reranked.\nWhat this controls: the minimum combined triage score a candidate URL must reach to survive into approved or candidate routing. Higher values make admission stricter and reduce fetch volume.',
  },
};

export const CONVERGENCE_KNOB_GROUPS: ConvergenceKnobGroup[] = [
  {
    label: 'SERP Selector',
    knobs: CONVERGENCE_SETTINGS_REGISTRY
      .filter((e) => e.type === 'int' || e.type === 'float')
      .map((e): ConvergenceNumericKnob => ({
        key: e.key,
        label: KNOB_UI_META[e.key]?.label ?? e.key,
        tip: KNOB_UI_META[e.key]?.tip,
        type: e.type as 'int' | 'float',
        min: e.min ?? 0,
        max: e.max ?? 100,
      })),
  },
];

export const CONVERGENCE_SETTING_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.convergence,
} satisfies Record<string, number | boolean>);
