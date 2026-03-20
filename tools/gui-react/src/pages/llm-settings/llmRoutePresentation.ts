import type { LlmRouteRow, LlmScope } from '../../types/llmSettings.ts';
import { rowEffortBand } from './llmRouteDomain.ts';

// --- Scope definitions ---

export const SCOPE_KEYS = ['field', 'component', 'list'] as const satisfies ReadonlyArray<LlmScope>;
export const scopes = [
  { id: 'field', label: 'Field Keys' },
  { id: 'component', label: 'Component Review' },
  { id: 'list', label: 'List Review' },
] as const;

// --- Display formatting ---

export function prettyToken(value: string) {
  return String(value || '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function presetDisplayName(row: LlmRouteRow) {
  const required = prettyToken(row.required_level);
  const difficulty = prettyToken(row.difficulty);
  const availability = prettyToken(row.availability);
  return `${required} | ${difficulty} | ${availability}`;
}

export function routeSummary(row: LlmRouteRow) {
  return `${row.required_level} | ${row.difficulty} | ${row.availability} | effort ${row.effort}`;
}

export function flagLabel(key: keyof LlmRouteRow): string {
  return String(key)
    .replace(/^studio_/, '')
    .replace(/_sent_/, ' ')
    .replace(/_in_/, ' in ')
    .replace(/_when_/, ' when ')
    .replace(/_/g, ' ');
}

// --- Effort-tone visual styling ---

export function selectedRouteTone(row: LlmRouteRow) {
  const effortBand = rowEffortBand(row);
  if (effortBand === '9-10') {
    return 'sf-callout sf-callout-danger';
  }
  if (effortBand === '7-8') {
    return 'sf-callout sf-callout-warning';
  }
  if (effortBand === '4-6') {
    return 'sf-callout sf-callout-info';
  }
  return 'sf-callout sf-callout-success';
}

export function selectedRouteToneStyle(row: LlmRouteRow) {
  const effortBand = rowEffortBand(row);
  if (effortBand === '9-10') {
    return {
      color: 'var(--sf-state-danger-fg)',
      backgroundColor: 'var(--sf-state-danger-bg)',
      borderColor: 'var(--sf-state-danger-border)',
    };
  }
  if (effortBand === '7-8') {
    return {
      color: 'var(--sf-state-warning-fg)',
      backgroundColor: 'var(--sf-state-warning-bg)',
      borderColor: 'var(--sf-state-warning-border)',
    };
  }
  if (effortBand === '4-6') {
    return {
      color: 'var(--sf-state-info-fg)',
      backgroundColor: 'var(--sf-state-info-bg)',
      borderColor: 'var(--sf-state-info-border)',
    };
  }
  return {
    color: 'var(--sf-state-success-fg)',
    backgroundColor: 'var(--sf-state-success-bg)',
    borderColor: 'var(--sf-state-success-border)',
  };
}
