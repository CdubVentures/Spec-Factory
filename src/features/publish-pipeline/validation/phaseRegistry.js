// WHY: O(1) scaling. Adding a validation phase = one entry here. Zero changes to
// badge rendering, tooltip formatting, or applicability logic elsewhere.
// Predicates mirror the guard conditions in validateField.js exactly.

import { DISPATCHED_TEMPLATE_KEYS } from './templateDispatch.js';
import { FORMAT_REGISTRY } from './formatRegistry.js';

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
    behaviorNote: 'Always runs. Maps null/undefined/empty to unk (scalar), [] (list), or {} (record).',
    isApplicable: () => true,
    triggerDetail: (rule) => {
      const shape = rule?.contract?.shape || 'scalar';
      return `Target shape: ${shape}`;
    },
  },
  {
    id: 'template_dispatch',
    title: 'Template Dispatch',
    order: 1,
    description: 'Routes specialized templates to their dedicated normalizer.',
    behaviorNote: 'Dispatched templates bypass unit and type checks downstream.',
    isApplicable: (rule) => {
      const template = rule?.parse?.template;
      return Boolean(template && DISPATCHED_TEMPLATE_KEYS.has(template));
    },
    triggerDetail: (rule) => {
      const template = rule?.parse?.template || '';
      return template ? `Template: ${template}` : '';
    },
  },
  {
    id: 'shape',
    title: 'Shape Check',
    order: 2,
    description: 'Validates that the value matches the expected shape (scalar, list, or record).',
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
    order: 3,
    description: 'Verifies, strips, or converts unit suffixes from numeric values.',
    behaviorNote: 'Strips matching units. Converts via unit_conversions factors. Rejects unknown units.',
    isApplicable: (rule) => {
      const unit = rule?.contract?.unit;
      const template = rule?.parse?.template || 'text_field';
      return Boolean(unit) && !DISPATCHED_TEMPLATE_KEYS.has(template);
    },
    triggerDetail: (rule) => {
      const unit = rule?.contract?.unit || '';
      const accepts = rule?.parse?.unit_accepts;
      const conversions = rule?.parse?.unit_conversions;
      const parts = [`Expected unit: ${unit || '(none)'}`];
      if (Array.isArray(accepts) && accepts.length > 0) {
        parts.push(`Also accepts: ${accepts.join(', ')}`);
      }
      if (conversions && typeof conversions === 'object' && Object.keys(conversions).length > 0) {
        parts.push(`Conversions: ${Object.keys(conversions).join(', ')}`);
      }
      return parts.join('\n');
    },
  },
  {
    id: 'type',
    title: 'Type Check',
    order: 4,
    description: 'Verifies and coerces the value type (string, number, boolean).',
    behaviorNote: 'Safe coercion only — e.g., "42" to 42. Never guesses.',
    isApplicable: (rule) => {
      const template = rule?.parse?.template || 'text_field';
      return !DISPATCHED_TEMPLATE_KEYS.has(template);
    },
    triggerDetail: (rule) => {
      const type = rule?.contract?.type || 'string';
      return `Expected type: ${type}`;
    },
  },
  {
    id: 'normalize',
    title: 'String Normalization',
    order: 5,
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
    order: 6,
    description: 'Validates the value against template regex and/or custom format_hint.',
    behaviorNote: 'Checks template FORMAT_REGISTRY first, then custom format_hint if configured.',
    isApplicable: (rule) => {
      const template = rule?.parse?.template;
      const formatHint = rule?.enum?.match?.format_hint;
      return Boolean((template && FORMAT_KEYS.has(template)) || formatHint);
    },
    triggerDetail: (rule) => {
      const template = rule?.parse?.template || '';
      const formatHint = rule?.enum?.match?.format_hint;
      const parts = [];
      if (template && FORMAT_KEYS.has(template)) parts.push(`Template format: ${template}`);
      if (formatHint) parts.push(`Custom pattern: ${formatHint}`);
      return parts.length > 0 ? parts.join(', ') : '';
    },
  },
  {
    id: 'list_rules',
    title: 'List Rules',
    order: 7,
    description: 'Enforces list-specific constraints: deduplication, sorting, min/max items.',
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
      if (lr.min_items != null) parts.push(`Min items: ${lr.min_items}`);
      if (lr.max_items != null) parts.push(`Max items: ${lr.max_items}`);
      return parts.length > 0 ? parts.join(', ') : 'List rules configured';
    },
  },
  {
    id: 'rounding',
    title: 'Rounding',
    order: 8,
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
    order: 9,
    description: 'Validates the value against a known-values list with policy and match strategy.',
    behaviorNote: 'Exact or alias matching. Alias tries case-insensitive + normalized before rejecting.',
    isApplicable: (rule, ctx) => {
      const policy = rule?.enum?.policy;
      const count = ctx?.knownValuesCount ?? 0;
      return Boolean(policy) && count > 0;
    },
    triggerDetail: (rule, ctx) => {
      const policy = rule?.enum?.policy || '';
      const strategy = rule?.enum?.match?.strategy || 'exact';
      const count = ctx?.knownValuesCount ?? 0;
      return `Policy: ${policy || '(none)'}, Match: ${strategy}, ${count} known values`;
    },
  },
  {
    id: 'range',
    title: 'Range Check',
    order: 10,
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
];
