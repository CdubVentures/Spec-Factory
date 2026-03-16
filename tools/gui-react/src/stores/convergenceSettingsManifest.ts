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
    label: 'Consensus - LLM Weights',
    knobs: [
      { key: 'consensusLlmWeightTier1', label: 'LLM Tier 1 (Manufacturer)', tip: 'Weight applied to LLM-extracted candidates from tier-1 (manufacturer) sources in consensus scoring.', type: 'float', min: 0.3, max: 0.9, step: 0.05 },
      { key: 'consensusLlmWeightTier2', label: 'LLM Tier 2 (Lab Review)', tip: 'Weight applied to LLM-extracted candidates from tier-2 (lab review) sources.', type: 'float', min: 0.2, max: 0.7, step: 0.05 },
      { key: 'consensusLlmWeightTier3', label: 'LLM Tier 3 (Retail)', tip: 'Weight applied to LLM-extracted candidates from tier-3 (retail) sources.', type: 'float', min: 0.1, max: 0.4, step: 0.05 },
      { key: 'consensusLlmWeightTier4', label: 'LLM Tier 4 (Unverified)', tip: 'Weight applied to LLM-extracted candidates from tier-4 (unverified) sources. Keep low to prevent unreliable data from winning consensus.', type: 'float', min: 0.05, max: 0.3, step: 0.05 },
    ],
  },
  {
    label: 'Consensus - Tier Weights',
    knobs: [
      { key: 'consensusTier1Weight', label: 'Tier 1 Weight', tip: 'Base scoring weight for all tier-1 (manufacturer) evidence rows in consensus. Higher values strongly prefer official sources.', type: 'float', min: 0.8, max: 1, step: 0.05 },
      { key: 'consensusTier2Weight', label: 'Tier 2 Weight', tip: 'Base scoring weight for tier-2 (lab review) evidence rows.', type: 'float', min: 0.5, max: 0.9, step: 0.05 },
      { key: 'consensusTier3Weight', label: 'Tier 3 Weight', tip: 'Base scoring weight for tier-3 (retail) evidence rows.', type: 'float', min: 0.2, max: 0.6, step: 0.05 },
      { key: 'consensusTier4Weight', label: 'Tier 4 Weight', tip: 'Base scoring weight for tier-4 (unverified) evidence rows. Lower values reduce influence of unverified sources.', type: 'float', min: 0.1, max: 0.4, step: 0.05 },
    ],
  },
  {
    label: 'SERP Triage',
    knobs: [
      { key: 'serpTriageMinScore', label: 'Min Score Threshold', tip: 'Minimum LLM triage score (1-10) for a SERP result to pass. Higher values filter more aggressively.', type: 'int', min: 1, max: 10 },
      { key: 'serpTriageMaxUrls', label: 'Max URLs After Triage', tip: 'Maximum number of URLs kept after triage scoring. Lower values reduce fetch volume; higher values increase coverage.', type: 'int', min: 5, max: 30 },
    ],
  },
  {
    label: 'Retrieval',
    knobs: [
      { key: 'retrievalMaxHitsPerField', label: 'Max Hits Per Field', tip: 'Maximum evidence rows retrieved per field during tier-aware retrieval. Higher values increase recall but slow scoring.', type: 'int', min: 5, max: 50 },
      { key: 'retrievalMaxPrimeSources', label: 'Max Prime Sources', tip: 'Maximum prime sources selected per field for extraction context. Higher values provide more evidence to LLM but increase token usage.', type: 'int', min: 3, max: 20 },
      { key: 'retrievalIdentityFilterEnabled', label: 'Identity Filter Enabled', tip: 'Filter retrieval results by product identity match. Disable to include all sources regardless of identity confidence.', type: 'bool' },
    ],
  },
  {
    label: 'Consensus - Thresholds',
    knobs: [
      {
        key: 'consensusTier4OverrideThreshold',
        label: 'Tier 4 Override Threshold',
        tip: 'Confidence above which a Tier-4 source can override higher-tier consensus.',
        type: 'float', min: 0, max: 1, step: 0.05,
      },
      {
        key: 'consensusMinConfidence',
        label: 'Minimum Confidence',
        tip: 'Minimum confidence score for consensus result acceptance.',
        type: 'float', min: 0, max: 1, step: 0.05,
      },
    ],
  },
] as ConvergenceKnobGroup[];

export const CONVERGENCE_SETTING_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.convergence,
} satisfies Record<string, number | boolean>);
