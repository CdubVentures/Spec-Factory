// WHY: O(1) single source of truth for field interdependencies.
// Adding a cascade rule = one entry in CASCADE_RULES.
// Adding a disable rule = one entry in FIELD_AVAILABILITY.
// No component or ruleCommands changes needed.

import { isUnitBearingType } from './typeShapeRegistry.ts';
import { getN, strN, numN } from './nestedValueHelpers.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CascadeEffect {
  path: string;
  action: 'clear' | 'set' | 'derive' | 'clear-if' | 'floor';
  value?: unknown;
  /** For 'derive': compute the value from (oldVal, newVal) */
  derive?: (oldVal: string, newVal: string) => unknown;
  /** For 'clear-if': only clear when condition(rule) is true */
  condition?: (rule: Record<string, unknown>) => boolean;
  /** Resolved value after derive — set by collectCascadeEffects */
  resolvedValue?: unknown;
}

interface CascadeRule {
  when: (oldVal: string, newVal: string) => boolean;
  effects: CascadeEffect[];
}

// ---------------------------------------------------------------------------
// Registry 1: CASCADE_RULES — what happens when a field value changes
// ---------------------------------------------------------------------------

const NUMERIC_CLEAR_EFFECTS: CascadeEffect[] = [
  { path: 'contract.unit', action: 'clear' },
  { path: 'contract.range.min', action: 'clear' },
  { path: 'contract.range.max', action: 'clear' },
  { path: 'contract.rounding.decimals', action: 'clear' },
];

export const CASCADE_RULES: Record<string, CascadeRule[]> = {
  'contract.type': [
    {
      // WHY: numeric → non-numeric means unit/range/rounding no longer apply
      when: (old, new_) => isUnitBearingType(old) && !isUnitBearingType(new_),
      effects: NUMERIC_CLEAR_EFFECTS,
    },
    {
      // WHY: integer has zero decimal places by definition
      when: (_old, new_) => new_ === 'integer',
      effects: [{ path: 'contract.rounding.decimals', action: 'set', value: 0 }],
    },
  ],

  'contract.shape': [
    {
      // WHY: list_rules are meaningless on scalar fields
      when: (old) => old === 'list',
      effects: [
        { path: 'contract.list_rules.dedupe', action: 'clear' },
        { path: 'contract.list_rules.sort', action: 'clear' },
        { path: 'contract.list_rules.item_union', action: 'clear' },
      ],
    },
  ],

  'component.type': [
    {
      // WHY: selecting a component type auto-wires enum to component_db
      when: (_old, new_) => !!new_,
      effects: [
        {
          path: 'enum.source',
          action: 'derive',
          derive: (_old, new_) => `component_db.${new_}`,
        },
        { path: 'enum.policy', action: 'set', value: 'open_prefer_known' },
      ],
    },
    {
      // WHY: clearing component type should revert component_db coupling
      when: (old, new_) => !!old && !new_,
      effects: [
        {
          path: 'enum.source',
          action: 'clear-if',
          condition: (rule) => strN(rule, 'enum.source', '').startsWith('component_db.'),
        },
        {
          path: 'enum.policy',
          action: 'clear-if',
          condition: (rule) => strN(rule, 'enum.policy') === 'open_prefer_known',
        },
        { path: 'component.source', action: 'clear' },
      ],
    },
  ],

  'priority.required_level': [
    {
      // WHY: identity/required fields must have at least 1 evidence ref
      when: (_old, new_) => new_ === 'identity' || new_ === 'required',
      effects: [
        { path: 'evidence.min_evidence_refs', action: 'floor', value: 1 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry 2: FIELD_AVAILABILITY — is a given input enabled?
// ---------------------------------------------------------------------------

export const FIELD_AVAILABILITY: Record<
  string,
  (rule: Record<string, unknown>) => boolean
> = {
  'contract.unit': (r) => isUnitBearingType(strN(r, 'contract.type', 'string')),
  'contract.range.min': (r) => isUnitBearingType(strN(r, 'contract.type', 'string')),
  'contract.range.max': (r) => isUnitBearingType(strN(r, 'contract.type', 'string')),
  'contract.rounding.decimals': (r) =>
    isUnitBearingType(strN(r, 'contract.type', 'string')) &&
    strN(r, 'contract.type') !== 'integer',
  'contract.list_rules.dedupe': (r) => strN(r, 'contract.shape', 'scalar') === 'list',
  'contract.list_rules.sort': (r) => strN(r, 'contract.shape', 'scalar') === 'list',
  'contract.list_rules.item_union': (r) => strN(r, 'contract.shape', 'scalar') === 'list',
};

export function isFieldAvailable(
  rule: Record<string, unknown>,
  path: string,
): boolean {
  const check = FIELD_AVAILABILITY[path];
  return check ? check(rule) : true;
}

// ---------------------------------------------------------------------------
// Cascade engine — pure function, mutates rule in-place
// ---------------------------------------------------------------------------

/** Collect cascade effects without applying them (for testing). */
export function collectCascadeEffects(
  rule: Record<string, unknown>,
  path: string,
  oldVal: unknown,
  newVal: unknown,
): (CascadeEffect & { resolvedValue?: unknown })[] {
  const rules = CASCADE_RULES[path];
  if (!rules) return [];

  const oldStr = String(oldVal ?? '');
  const newStr = String(newVal ?? '');
  const collected: (CascadeEffect & { resolvedValue?: unknown })[] = [];

  for (const cascadeRule of rules) {
    if (!cascadeRule.when(oldStr, newStr)) continue;
    for (const effect of cascadeRule.effects) {
      if (effect.action === 'clear-if' && effect.condition && !effect.condition(rule)) {
        continue;
      }
      const entry: CascadeEffect & { resolvedValue?: unknown } = { ...effect };
      if (effect.action === 'derive' && effect.derive) {
        entry.resolvedValue = effect.derive(oldStr, newStr);
      }
      collected.push(entry);
    }
  }
  return collected;
}

/** Apply cascade effects to a rule object (mutates in place). */
export function applyCascadeEffects(
  rule: Record<string, unknown>,
  path: string,
  oldVal: unknown,
  newVal: unknown,
): void {
  const effects = collectCascadeEffects(rule, path, oldVal, newVal);
  for (const effect of effects) {
    switch (effect.action) {
      case 'clear':
      case 'clear-if':
        setNestedValue(rule, effect.path, null);
        break;
      case 'set':
        setNestedValue(rule, effect.path, effect.value);
        break;
      case 'derive':
        setNestedValue(rule, effect.path, effect.resolvedValue);
        break;
      case 'floor': {
        const current = numN(rule, effect.path, 0);
        const floor = typeof effect.value === 'number' ? effect.value : 0;
        if (current < floor) {
          setNestedValue(rule, effect.path, floor);
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Nested value setter (local, matches ruleCommands.ts setNestedRuleValue)
// ---------------------------------------------------------------------------

function setNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const parts = String(dotPath || '').split('.');
  if (parts.length === 1) {
    obj[parts[0]] = value;
    return;
  }
  if (parts.length === 2) {
    const parent = { ...((obj[parts[0]] || {}) as Record<string, unknown>) };
    parent[parts[1]] = value;
    obj[parts[0]] = parent;
    return;
  }
  if (parts.length === 3) {
    const parent = { ...((obj[parts[0]] || {}) as Record<string, unknown>) };
    const child = { ...((parent[parts[1]] || {}) as Record<string, unknown>) };
    child[parts[2]] = value;
    parent[parts[1]] = child;
    obj[parts[0]] = parent;
  }
}
