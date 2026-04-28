/**
 * Contract schema catalog helpers for rendering the field-rule schema registry
 * into per-key audit documentation.
 *
 * The schema entries live in src/field-rules/fieldRuleSchema.js so authorable
 * field-rule knobs have one central definition. This module preserves the
 * category-audit public API and owns audit-specific rendering helpers.
 *
 * Exports:
 *   - FIELD_RULE_SCHEMA  (frozen array)
 *   - KNOWN_KINDS        (Set<string>)
 *   - getIn              (dot-notation accessor)
 *   - appliesTo          (evaluates appliesWhen)
 *   - describeCurrent    (renders current value cell)
 *   - describePossibleValues (renders possible-values cell)
 */

import {
  FIELD_RULE_AI_ASSIST_TOGGLE_SPECS,
  FIELD_RULE_KINDS,
  FIELD_RULE_SCHEMA as FIELD_RULE_SCHEMA_REGISTRY,
  normalizeFieldRuleAiAssistToggleFromConfig,
} from '../../field-rules/fieldRuleSchema.js';

export const KNOWN_KINDS = FIELD_RULE_KINDS;
export const FIELD_RULE_SCHEMA = FIELD_RULE_SCHEMA_REGISTRY;

/** Dot-notation accessor tolerating null intermediate links. */
export function getIn(obj, path) {
  if (obj == null || !path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Evaluate an entry's appliesWhen against a rule. Missing appliesWhen means
 * the row always applies. Values may be a single expected value or an array
 * of acceptable values.
 */
export function appliesTo(entry, rule) {
  if (!entry || !entry.appliesWhen) return true;
  for (const [path, expected] of Object.entries(entry.appliesWhen)) {
    const actual = getIn(rule, path);
    const list = Array.isArray(expected) ? expected : [expected];
    if (!list.includes(actual)) return false;
  }
  return true;
}

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
  return false;
}

function renderListSummary(list, prefix = 'value') {
  const arr = Array.isArray(list) ? list.filter((v) => v !== null && v !== undefined && v !== '') : [];
  if (arr.length === 0) return '(unset)';
  const head = arr.slice(0, 6).map((v) => String(v)).join(', ');
  const tail = arr.length > 6 ? `, … (+${arr.length - 6})` : '';
  return `${arr.length} ${prefix}${arr.length === 1 ? '' : 's'}: ${head}${tail}`;
}

/**
 * Render the "current value" cell for a given entry + rule. Returns a string
 * safe to drop into a markdown / HTML table cell. Unset knobs surface as
 * "(unset)" so the reader sees a catalog of configurable slots, not a wall
 * of empty cells.
 */
export function describeCurrent(entry, rule) {
  if (!entry) return '(unset)';
  const aiAssistToggle = FIELD_RULE_AI_ASSIST_TOGGLE_SPECS.find((spec) => spec.enabledPath === entry.path);
  const v = aiAssistToggle
    ? normalizeFieldRuleAiAssistToggleFromConfig(rule?.ai_assist, aiAssistToggle.key)?.enabled
    : getIn(rule, entry.path);
  if (isEmptyValue(v)) return '(unset)';
  switch (entry.kind) {
    case 'string-list':
      return renderListSummary(v);
    case 'ordered-list':
      return renderListSummary(v);
    case 'constraint-list': {
      const arr = Array.isArray(v) ? v : [];
      if (arr.length === 0) return '(unset)';
      const head = arr.slice(0, 3).map((c) => (typeof c === 'string' ? c : c?.raw || JSON.stringify(c))).join(' · ');
      return `${arr.length} constraint${arr.length === 1 ? '' : 's'}: ${head}${arr.length > 3 ? ' …' : ''}`;
    }
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number-nullable':
    case 'integer':
      return String(v);
    case 'prose': {
      const s = String(v).trim();
      if (!s) return '(unset)';
      if (s.length <= 160) return s;
      return s.slice(0, 157) + '…';
    }
    default:
      return String(v);
  }
}

/**
 * Render the "possible values" cell — the catalog of choices available for
 * this knob. Enum entries show the literal option set; free-form kinds show
 * a kind hint.
 */
export function describePossibleValues(entry) {
  if (!entry) return '';
  switch (entry.kind) {
    case 'enum':
      return (entry.options || []).map((o) => `\`${o}\``).join(' · ');
    case 'enum-or-freeform':
      return `${(entry.options || []).map((o) => `\`${o}\``).join(' · ')} (or free-form)`;
    case 'ordered-list':
      return `ordered list of ${(entry.options || []).map((o) => `\`${o}\``).join(' · ')}`;
    case 'boolean':
      return '`true` · `false`';
    case 'integer':
      return 'integer (e.g. `0`, `1`, `2`)';
    case 'number-nullable':
      return 'number or `null`';
    case 'string':
      return 'free-form string';
    case 'string-list':
      return 'list of free-form strings';
    case 'constraint-list':
      return 'list of DSL strings: `<field> <lte|lt|gte|gt|eq> <target>`';
    case 'component-ref':
      return 'component type name from the component database registry';
    case 'group-ref':
      return 'group key from `field_groups.json`';
    case 'prose':
      return 'free-form prose (the editable extraction-guidance slot)';
    default:
      return '';
  }
}
