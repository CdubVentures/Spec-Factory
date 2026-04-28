// ── Workbench helpers: nested accessors + row builder ────────────────
import { humanizeField } from '../../../utils/fieldNormalize.ts';
import type { WorkbenchRow } from './workbenchTypes.ts';
export { arrN, boolN, getN, numN, strN } from '../state/nestedValueHelpers.ts';
import {
  arrN,
  boolN,
  numN,
  strN,
} from '../state/nestedValueHelpers.ts';
import { STUDIO_NUMERIC_KNOB_BOUNDS } from '../state/studioNumericKnobBounds.ts';
import { deriveInputControl } from '../state/deriveInputControl.ts';
import type { ComponentSource } from '../../../types/studio.ts';
import { readFieldRuleAiAssistToggleEnabled } from '../../../../../../src/field-rules/fieldRuleSchema.js';

// ── Nested accessor helpers (shared with KeyNavigatorTab) ────────────
const CONSTRAINT_KEYWORDS = new Set(['requires', 'and', 'or', 'not', 'if', 'then', 'else', 'true', 'false', 'null']);

export function extractConstraintVariables(constraints: string[], currentKey = ''): string[] {
  const vars = new Set<string>();
  for (const expr of constraints) {
    const tokens = String(expr || '').match(/[a-z_][a-z0-9_]*/gi) || [];
    for (const token of tokens) {
      const normalized = token.toLowerCase();
      if (CONSTRAINT_KEYWORDS.has(normalized)) continue;
      if (normalized === currentKey) continue;
      vars.add(normalized);
    }
  }
  return [...vars].sort((a, b) => a.localeCompare(b));
}

// ── setNested: mutates a rule object at a dot-path ───────────────────
export function setNested(rule: Record<string, unknown>, dotPath: string, val: unknown): void {
  const p = dotPath.split('.');
  if (p.length === 1) { rule[p[0]] = val; return; }
  if (p.length === 2) {
    const parent = { ...((rule[p[0]] || {}) as Record<string, unknown>) };
    parent[p[1]] = val;
    rule[p[0]] = parent;
    return;
  }
  if (p.length === 3) {
    const p1 = { ...((rule[p[0]] || {}) as Record<string, unknown>) };
    const p2 = { ...((p1[p[1]] || {}) as Record<string, unknown>) };
    p2[p[2]] = val;
    p1[p[1]] = p2;
    rule[p[0]] = p1;
  }
}

// ── Compile message → field key mapper ───────────────────────────────
export function mapCompileMessages(
  guardrails: Record<string, unknown> | null | undefined,
): Record<string, { errors: string[]; warnings: string[] }> {
  const map: Record<string, { errors: string[]; warnings: string[] }> = {};
  if (!guardrails) return map;

  const errors = Array.isArray(guardrails.errors) ? (guardrails.errors as string[]) : [];
  const warnings = Array.isArray(guardrails.warnings) ? (guardrails.warnings as string[]) : [];

  function extractKey(msg: string): string | null {
    const m =
      msg.match(/["']([a-z][a-z0-9_]+)["']/) ||
      msg.match(/Field:\s*(\S+)/) ||
      msg.match(/\[([a-z][a-z0-9_]+)\]/) ||
      msg.match(/field\s+(\S+)/i);
    return m ? m[1] : null;
  }

  for (const msg of errors) {
    const key = extractKey(msg);
    if (key) {
      if (!map[key]) map[key] = { errors: [], warnings: [] };
      map[key].errors.push(msg);
    }
  }
  for (const msg of warnings) {
    const key = extractKey(msg);
    if (key) {
      if (!map[key]) map[key] = { errors: [], warnings: [] };
      map[key].warnings.push(msg);
    }
  }
  return map;
}

// ── Compact summary helpers ──────────────────────────────────────────
function formatRange(min: unknown, max: unknown): string {
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);
  if (!hasMin && !hasMax) return '';
  if (hasMin && hasMax) return `${min}\u2013${max}`;
  if (hasMin) return `${min}\u2013`;
  return `\u2013${max}`;
}

function formatListRules(rule: Record<string, unknown>, shape: string): string {
  if (shape !== 'list') return '';
  const dedupe = boolN(rule, 'contract.list_rules.dedupe', true);
  const sort = strN(rule, 'contract.list_rules.sort', 'none');
  const itemUnion = strN(rule, 'contract.list_rules.item_union', 'winner_only') || 'winner_only';
  return `${dedupe ? 'dedup' : 'no-dedup'}\u00b7${sort}\u00b7${itemUnion}`;
}

function formatRounding(rule: Record<string, unknown>, type: string): string {
  if (type !== 'number' && type !== 'integer') return '';
  const decimals = numN(rule, 'contract.rounding.decimals', 0);
  const mode = strN(rule, 'contract.rounding.mode', 'nearest');
  return `${decimals}\u00b7${mode}`;
}

// WHY: Reverse lookup — for each property field_key, find the owning component
// and its variance policy. Same numeric-only collapse the body uses so the
// table cell matches what the drawer's Property Keys widget shows.
const NUMERIC_ONLY_VARIANCE_POLICIES = new Set(['upper_bound', 'lower_bound', 'range']);

interface PropertyOwnership {
  componentType: string;
  variancePolicy: string;
}

function buildPropertyOwnership(
  componentSources: readonly ComponentSource[] | undefined,
  rules: Record<string, Record<string, unknown>>,
): Map<string, PropertyOwnership> {
  const map = new Map<string, PropertyOwnership>();
  if (!componentSources || componentSources.length === 0) return map;
  for (const src of componentSources) {
    const compType = src.component_type || src.type || '';
    if (!compType) continue;
    const props = src.roles?.properties || [];
    for (const prop of props) {
      const fieldKey = prop?.field_key;
      if (!fieldKey || map.has(fieldKey)) continue;
      const raw = prop.variance_policy || 'authoritative';
      const fieldRule = rules[fieldKey];
      const contractType = fieldRule ? strN(fieldRule, 'contract.type') : '';
      const enumSrc = fieldRule ? strN(fieldRule, 'enum.source') : '';
      const isBool = contractType === 'boolean';
      const hasEnum = !!enumSrc;
      const isLocked = contractType !== 'number' || isBool || hasEnum;
      const variancePolicy = isLocked && NUMERIC_ONLY_VARIANCE_POLICIES.has(raw)
        ? 'authoritative'
        : raw;
      map.set(fieldKey, { componentType: compType, variancePolicy });
    }
  }
  return map;
}

// ── Build workbench rows from rules ──────────────────────────────────
export function buildWorkbenchRows(
  fieldOrder: string[],
  rules: Record<string, Record<string, unknown>>,
  guardrails?: Record<string, unknown> | null,
  knownValues?: Record<string, string[]>,
  egLockedKeys?: readonly string[],
  componentSources?: readonly ComponentSource[],
): WorkbenchRow[] {
  const msgMap = mapCompileMessages(guardrails);
  const kv = knownValues || {};
  const lockedSet = new Set(egLockedKeys || []);
  const propOwnership = buildPropertyOwnership(componentSources, rules);

  return fieldOrder.filter((key) => !key.startsWith('__grp::')).map((key) => {
    const r = rules[key] || {};
    const msgs = msgMap[key];
    const compileMessages = [
      ...(msgs?.errors || []),
      ...(msgs?.warnings || []),
    ];
    const contractType = strN(r, 'contract.type', strN(r, 'data_type', 'string'));
    const isBoolean = contractType === 'boolean';
    const contractShape = isBoolean ? 'scalar' : strN(r, 'contract.shape', 'scalar');
    const enumPolicy = isBoolean ? 'closed' : strN(r, 'enum.policy', strN(r, 'enum_policy', 'open'));
    const enumSource = isBoolean ? 'yes_no' : strN(r, 'enum.source', strN(r, 'enum_source'));
    const knownValuesForField = kv[key] || (isBoolean ? kv.yes_no : undefined) || [];

    return {
      key,
      displayName: strN(r, 'ui.label', strN(r, 'display_name', humanizeField(key))),
      group: strN(r, 'ui.group', strN(r, 'group', 'ungrouped')),

      // Contract
      variantDependent: boolN(r, 'variant_dependent', false),
      pifDependent: boolN(r, 'product_image_dependent', false),
      contractType,
      contractShape,
      contractUnit: strN(r, 'contract.unit'),
      contractRange: formatRange(
        numN(r, 'contract.range.min', NaN),
        numN(r, 'contract.range.max', NaN),
      ),
      listRulesSummary: formatListRules(r, contractShape),
      roundingSummary: formatRounding(r, contractType),

      // Priority
      requiredLevel: strN(r, 'priority.required_level', strN(r, 'required_level', 'expected')),
      availability: strN(r, 'priority.availability', strN(r, 'availability', 'expected')),
      difficulty: strN(r, 'priority.difficulty', strN(r, 'difficulty', 'easy')),

      // Ai Assist
      colorEditionContext: readFieldRuleAiAssistToggleEnabled('color_edition_context', r, false),
      pifPriorityImages: readFieldRuleAiAssistToggleEnabled('pif_priority_images', r, false),
      reasoningNoteFilled: strN(r, 'ai_assist.reasoning_note').trim().length > 0,

      // Enum
      enumPolicy,
      enumSource,
      knownValuesCount: knownValuesForField.length,

      // Components — Phase 4: componentType + componentLocked both require
      // self-lock (enum.source === component_db.<self>). Cross-locks (a property
      // rule whose enum.source points at a parent component) are bugs that
      // INV-2 catches at compile time; the workbench must NOT visually flag them
      // as locked components. `belongsToComponent` (below) is the legitimate
      // "this key is a property of <component>" derivation, sourced from
      // component_sources[].roles.properties[].
      componentType: enumSource === `component_db.${key}`
        ? key
        : '',
      componentLocked: enumSource === `component_db.${key}`,
      belongsToComponent: propOwnership.get(key)?.componentType || '',
      propertyVariance: propOwnership.get(key)?.variancePolicy || '',

      // Constraints
      constraintsCount: arrN(r, 'constraints').length,
      constraintVariables: extractConstraintVariables(arrN(r, 'constraints'), key).join(', '),

      // Evidence
      minEvidenceRefs: numN(
        r,
        'evidence.min_evidence_refs',
        numN(r, 'min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
      ),
      tierPreference: arrN(r, 'evidence.tier_preference').join(', '),

      // Tooltip
      tooltipMdFilled: strN(r, 'ui.tooltip_md').trim().length > 0,

      // Search
      aliasesCount: arrN(r, 'aliases').length,
      queryTermsCount: arrN(r, 'search_hints.query_terms').length,
      domainHintsCount: arrN(r, 'search_hints.domain_hints').length,
      contentTypesCount: arrN(r, 'search_hints.content_types').length,

      // UI (legacy)
      uiInputControl: deriveInputControl({
        type: contractType || null,
        shape: contractShape || null,
        enumSource: enumSource || null,
        enumPolicy: enumPolicy || null,
      }),
      uiOrder: numN(r, 'ui.order', 0),

      // Meta
      egLocked: lockedSet.has(key),
      draftDirty: boolN(r, '_edited'),

      hasErrors: (msgs?.errors?.length || 0) > 0,
      hasWarnings: (msgs?.warnings?.length || 0) > 0,
      compileMessages,

      _rule: r,
    };
  });
}
