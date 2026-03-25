// AUTO-GENERATED from src/core/config/runtimeStageDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateRuntimeStageKeys.js

export const FETCH_STAGE_KEYS = [
  'stealth',
  'auto_scroll',
  'dom_expansion',
  'css_override',
] as const;

export type FetchTabKey = (typeof FETCH_STAGE_KEYS)[number];

export interface StageMeta {
  readonly label: string;
  readonly tip: string;
  readonly tone: 'info' | 'warning' | 'accent';
}

export const FETCH_STAGE_META: Record<FetchTabKey, StageMeta> = {
  'stealth': { label: 'Stealth', tip: 'Anti-detection fingerprint injection — masks webdriver flag, spoofs plugins and languages.', tone: 'info' },
  'auto_scroll': { label: 'Auto-Scroll', tip: 'Scroll passes to trigger lazy-loaded content and reveal dynamic elements.', tone: 'info' },
  'dom_expansion': { label: 'DOM Expansion', tip: 'Click expand/show-more buttons to reveal collapsed sections and tables.', tone: 'info' },
  'css_override': { label: 'CSS Override', tip: 'Force display:block on hidden elements for full capture (brute-force fallback).', tone: 'info' },
};
