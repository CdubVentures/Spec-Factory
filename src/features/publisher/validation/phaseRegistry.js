// WHY: O(1) scaling. Adding a validation phase = one entry here. Zero changes to
// badge rendering, tooltip formatting, or applicability logic elsewhere.
// Predicates mirror the guard conditions in validateField.js exactly.

import { FORMAT_REGISTRY } from './formatRegistry.js';
import { shouldBlockUnkPublish } from './shouldBlockUnkPublish.js';

const FORMAT_KEYS = new Set(Object.keys(FORMAT_REGISTRY));

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   order: number,
 *   description: string,
 *   behaviorNote: string,
 *   isApplicable: (rule: object|null, ctx?: object|null) => boolean,
 *   triggerDetail: (rule: object|null, ctx?: object|null) => string,
 * }} PhaseEntry
 */

/** @type {PhaseEntry[]} */
export const PHASE_REGISTRY = [
  {
    id: 'absence',
    title: 'Absence Normalization',
    order: 0,
    description: 'Canonicalizes null, undefined, and empty values to the canonical unknown form.',
    behaviorNote: 'Always runs. Maps null/undefined/empty to unk (scalar) or [] (list).',
    isApplicable: () => true,
    triggerDetail: (rule) => {
      const shape = rule?.contract?.shape || 'scalar';
      return `Target shape: ${shape}`;
    },
  },
  {
    id: 'shape',
    title: 'Shape Check',
    order: 1,
    description: 'Validates that the value matches the expected shape (scalar or list).',
    behaviorNote: 'Short-circuits the entire pipeline on failure — no downstream checks run.',
    isApplicable: () => true,
    triggerDetail: (rule) => {
      const shape = rule?.contract?.shape || 'scalar';
      return `Expected shape: ${shape}`;
    },
  },
  {
    id: 'unit',
    title: 'Unit Verification',
    order: 2,
    description: 'Resolves unit synonyms, converts units via managed unit registry, strips valid suffixes to bare numbers.',
    behaviorNote: 'Accepts canonical + synonyms. Converts known cross-units (e.g. lb→g). Rejects unknown suffixes. No LLM needed.',
    isApplicable: (rule) => Boolean(rule?.contract?.unit),
    triggerDetail: (rule) => {
      const unit = rule?.contract?.unit || '';
      return `Expected unit: ${unit || '(none)'}`;
    },
  },
  {
    id: 'type_coerce',
    title: 'Type Coercion',
    order: 3,
    description: 'Coerces the value based on contract.type (string, number, integer, boolean, date, url, range, mixed_number_range).',
    behaviorNote: 'Safe coercion only — e.g., "42" to 42, "true" to "yes". Never guesses. For lists, applies per-element.',
    isApplicable: () => true,
    triggerDetail: (rule) => {
      const type = rule?.contract?.type || 'string';
      return `Expected type: ${type}`;
    },
  },
  {
    id: 'normalize',
    title: 'String Normalization',
    order: 4,
    description: 'Normalizes string values: trim, lowercase, hyphens, and token map.',
    behaviorNote: 'Always runs for string values. Applies token_map if configured.',
    isApplicable: () => true,
    triggerDetail: (rule) => {
      const tokenMap = rule?.parse?.token_map;
      if (tokenMap && typeof tokenMap === 'object' && Object.keys(tokenMap).length > 0) {
        return `Token map: ${Object.keys(tokenMap).length} entries`;
      }
      return 'Standard normalization (trim, lowercase, hyphens)';
    },
  },
  {
    id: 'format',
    title: 'Format Check',
    order: 5,
    description: 'Validates the value against type format regex and/or custom format_hint.',
    behaviorNote: 'Checks type FORMAT_REGISTRY first (boolean, date, url), then custom format_hint if configured.',
    isApplicable: (rule) => {
      const type = rule?.contract?.type || 'string';
      const formatHint = rule?.enum?.match?.format_hint;
      return Boolean(FORMAT_KEYS.has(type) || formatHint);
    },
    triggerDetail: (rule) => {
      const type = rule?.contract?.type || 'string';
      const formatHint = rule?.enum?.match?.format_hint;
      const parts = [];
      if (FORMAT_KEYS.has(type)) parts.push(`Type format: ${type}`);
      if (formatHint) parts.push(`Custom pattern: ${formatHint}`);
      return parts.length > 0 ? parts.join(', ') : '';
    },
  },
  {
    id: 'list_rules',
    title: 'List Rules',
    order: 6,
    description: 'Enforces list-specific constraints: deduplication, sorting.',
    behaviorNote: 'Only for list-shaped fields with list_rules configured.',
    isApplicable: (rule) => {
      const shape = rule?.contract?.shape;
      const listRules = rule?.contract?.list_rules;
      return shape === 'list' && Boolean(listRules);
    },
    triggerDetail: (rule) => {
      const lr = rule?.contract?.list_rules || {};
      const parts = [];
      if (lr.dedupe) parts.push('Deduplicate');
      if (lr.sort) parts.push(`Sort: ${lr.sort}`);
      return parts.length > 0 ? parts.join(', ') : 'List rules configured';
    },
  },
  {
    id: 'rounding',
    title: 'Rounding',
    order: 7,
    description: 'Rounds numeric values to the configured precision.',
    behaviorNote: 'Repairs only — never rejects. Applies precision and rounding mode.',
    isApplicable: (rule) => Boolean(rule?.contract?.rounding),
    triggerDetail: (rule) => {
      const r = rule?.contract?.rounding || {};
      const parts = [];
      if (r.precision != null) parts.push(`Precision: ${r.precision}`);
      if (r.mode) parts.push(`Mode: ${r.mode}`);
      return parts.length > 0 ? parts.join(', ') : 'Rounding configured';
    },
  },
  {
    id: 'enum',
    title: 'Enum Check',
    order: 8,
    description: 'Validates the value against a known-values list. Policy determines matching behavior.',
    behaviorNote: 'closed: exact match, reject unknowns. open_prefer_known: alias resolution (case-insensitive + normalized). open: all values pass.',
    isApplicable: (rule, ctx) => {
      const policy = rule?.enum?.policy;
      const count = ctx?.knownValuesCount ?? 0;
      return Boolean(policy) && count > 0;
    },
    triggerDetail: (rule, ctx) => {
      const policy = rule?.enum?.policy || '';
      const count = ctx?.knownValuesCount ?? 0;
      return `Policy: ${policy || '(none)'}, ${count} known values`;
    },
  },
  {
    id: 'range',
    title: 'Range Check',
    order: 9,
    description: 'Validates that numeric values fall within configured bounds.',
    behaviorNote: 'Rejects only — does not clamp values.',
    isApplicable: (rule) => Boolean(rule?.contract?.range),
    triggerDetail: (rule) => {
      const r = rule?.contract?.range || {};
      const parts = [];
      if (r.min != null) parts.push(`Min: ${r.min}`);
      if (r.max != null) parts.push(`Max: ${r.max}`);
      return parts.length > 0 ? parts.join(', ') : 'Range configured';
    },
  },
  {
    id: 'publish_gate',
    title: 'Publish Gate',
    order: 10,
    description: 'Rejects unknown values for fields that block publishing.',
    behaviorNote: 'Final gate. Rejects unk values when required_level is identity or required.',
    isApplicable: shouldBlockUnkPublish,
    triggerDetail: () => 'Blocks publish when value is null (absent)',
  },
];
