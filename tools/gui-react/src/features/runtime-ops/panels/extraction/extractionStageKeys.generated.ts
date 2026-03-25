// AUTO-GENERATED from src/core/config/runtimeStageDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateRuntimeStageKeys.js

export const EXTRACTION_STAGE_KEYS = [
  'screenshot',
] as const;

export type ExtractionTabKey = (typeof EXTRACTION_STAGE_KEYS)[number];

export interface StageMeta {
  readonly label: string;
  readonly tip: string;
  readonly tone: 'info' | 'warning' | 'accent';
}

export const EXTRACTION_STAGE_META: Record<ExtractionTabKey, StageMeta> = {
  'screenshot': { label: 'Screenshots', tip: 'Full-page and targeted selector screenshots captured from each URL.', tone: 'info' },
};
