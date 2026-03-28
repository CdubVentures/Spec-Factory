// AUTO-GENERATED from src/core/config/runtimeStageDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateRuntimeStageKeys.js

export const FETCH_STAGE_KEYS = [
  'stealth',
  'cookie_consent',
  'overlay_dismissal',
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
  'cookie_consent': { label: 'Cookie Consent', tip: 'Auto-dismiss cookie/privacy consent banners before page interaction.', tone: 'info' },
  'overlay_dismissal': { label: 'Overlay Dismissal', tip: 'Detect and dismiss non-cookie popups — newsletter signups, chat widgets, paywalls, age gates, and scroll-locked body states.', tone: 'info' },
  'auto_scroll': { label: 'Auto-Scroll', tip: 'Scroll passes to trigger lazy-loaded content and reveal dynamic elements.', tone: 'info' },
  'dom_expansion': { label: 'DOM Expansion', tip: 'Click expand/show-more buttons to reveal collapsed sections and tables.', tone: 'info' },
  'css_override': { label: 'CSS Override', tip: 'Force display:block on hidden elements for full capture (brute-force fallback).', tone: 'info' },
};
