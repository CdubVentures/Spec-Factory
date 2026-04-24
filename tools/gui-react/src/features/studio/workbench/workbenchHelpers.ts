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
    // Try patterns: "field_key", Field: field_key, [field_key], field "field_key"
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

// ── Build workbench rows from rules ──────────────────────────────────
export function buildWorkbenchRows(
  fieldOrder: string[],
  rules: Record<string, Record<string, unknown>>,
  guardrails?: Record<string, unknown> | null,
  knownValues?: Record<string, string[]>,
): WorkbenchRow[] {
  const msgMap = mapCompileMessages(guardrails);
  const kv = knownValues || {};

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
      requiredLevel: strN(r, 'priority.required_level', strN(r, 'required_level', 'expected')),
      availability: strN(r, 'priority.availability', strN(r, 'availability', 'expected')),
      difficulty: strN(r, 'priority.difficulty', strN(r, 'difficulty', 'easy')),
      effort: numN(r, 'priority.effort', numN(r, 'effort', 3)),

      contractType,
      contractShape,
      contractUnit: strN(r, 'contract.unit'),
      enumPolicy,
      enumSource,
      knownValuesCount: knownValuesForField.length,

      minEvidenceRefs: numN(
        r,
        'evidence.min_evidence_refs',
        numN(r, 'min_evidence_refs', STUDIO_NUMERIC_KNOB_BOUNDS.evidenceMinRefs.fallback),
      ),
      tierPreference: arrN(r, 'evidence.tier_preference').join(', '),

      aiReasoningNote: strN(r, 'ai_assist.reasoning_note'),

      aliasesCount: arrN(r, 'aliases').length,
      queryTermsCount: arrN(r, 'search_hints.query_terms').length,
      domainHintsCount: arrN(r, 'search_hints.domain_hints').length,
      contentTypesCount: arrN(r, 'search_hints.content_types').length,
      constraintsCount: arrN(r, 'constraints').length,
      constraintVariables: extractConstraintVariables(arrN(r, 'constraints'), key).join(', '),

      componentType: strN(r, 'component.type'),

      uiInputControl: deriveInputControl({
        type: contractType || null,
        shape: contractShape || null,
        enumSource: enumSource || null,
        enumPolicy: enumPolicy || null,
        componentSource: strN(r, 'component.source') || null,
      }),
      uiOrder: numN(r, 'ui.order', 0),

      draftDirty: boolN(r, '_edited'),

      hasErrors: (msgs?.errors?.length || 0) > 0,
      hasWarnings: (msgs?.warnings?.length || 0) > 0,
      compileMessages,

      _rule: r,
    };
  });
}
