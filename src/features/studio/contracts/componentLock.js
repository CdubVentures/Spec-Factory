// WHY: SSOT for component-lock contract — when a field rule self-locks via
// `enum.source === component_db.<self>`, the rule's contract identity is owned
// by the field_studio_map.component_sources[] row. Authors can edit value
// policy / aliases / priority / search_hints / etc., but not contract.* or
// enum.source/values.
//
// Phase 4 extracts this from the GUI store (Phase 3 had it inline) so the same
// editable-path set drives:
//   - Zustand store guard (tools/gui-react/.../useFieldRulesStore.ts)
//   - Server-side PUT /studio/<cat>/field-studio-map sanitizer
//   - Future tooling (migration scripts, validators)
//
// O(1): Adding a new editable path = one entry in COMPONENT_LOCK_EDITABLE_PATHS
// or a single branch in isComponentLockEditablePath.

// ── Editable path predicate ──────────────────────────────────────────────────
// Editable when the rule is component-locked. Covers everything Phase 3 listed.
// Top-level paths checked exactly. Prefix paths use startsWith.
const EXACT_EDITABLE_PATHS = Object.freeze(new Set([
  'enum.policy',
  'enum.match.format_hint',
  'aliases',
  'constraints',
  'ui.label',
  'ui.group',
  'ui.order',
  'ui.tooltip_md',
  'ui.aliases',
]));

const EDITABLE_PATH_PREFIXES = Object.freeze([
  'priority.',
  'ai_assist.',
  'evidence.',
  'search_hints.',
]);

export function isComponentLockEditablePath(path) {
  if (typeof path !== 'string') return false;
  if (EXACT_EDITABLE_PATHS.has(path)) return true;
  for (const prefix of EDITABLE_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

// ── Lock predicate ───────────────────────────────────────────────────────────
// A rule is component-locked iff its enum.source self-references its own key.
// Cross-locks (enum.source = component_db.X where X !== key) are bugs that
// INV-2 catches at compile time; visual indicators must NOT flag them as locked.

export function isComponentLocked(rule, key) {
  if (!rule || typeof rule !== 'object' || !key) return false;
  const enumBlock = rule.enum && typeof rule.enum === 'object' ? rule.enum : null;
  const nestedSource = enumBlock && typeof enumBlock.source === 'string' ? enumBlock.source : '';
  if (nestedSource === `component_db.${key}`) return true;
  // WHY: Some authoring shapes carry `enum_source` as a string OR an object
  // {type, ref}. The compile pipeline normalizes to nested enum.source, but
  // overrides may carry either form. Check both for sanitizer correctness.
  const flatSource = rule.enum_source;
  if (typeof flatSource === 'string' && flatSource === `component_db.${key}`) return true;
  if (flatSource && typeof flatSource === 'object'
      && flatSource.type === 'component_db'
      && flatSource.ref === key) return true;
  return false;
}

// ── Server-side override sanitizer ───────────────────────────────────────────
// Strips contract-identity paths from any override that self-locks.
// Mirrors the Zustand store guard but operates on `field_overrides` directly.

const NON_EDITABLE_NESTED_PATHS = Object.freeze([
  'contract.type',
  'contract.shape',
  'contract.unit',
  'enum.source',
  'enum.values',
  'enum.allow_new',
  'enum.allow_unknown',
]);

// Top-level keys that mirror the nested contract/enum paths above.
const NON_EDITABLE_TOP_LEVEL_KEYS = Object.freeze([
  'enum_source',
  'enum_values',
]);

function deletePath(obj, dotPath) {
  const parts = dotPath.split('.');
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return;
    cursor = cursor[part];
  }
  if (cursor && typeof cursor === 'object') {
    delete cursor[parts[parts.length - 1]];
  }
}

function pruneEmptyContainer(obj, key) {
  const child = obj[key];
  if (child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child).length === 0) {
    delete obj[key];
  }
}

export function sanitizeComponentLockedOverrides(fieldOverrides) {
  if (!fieldOverrides || typeof fieldOverrides !== 'object') return fieldOverrides;
  let cloned = null;
  for (const [key, override] of Object.entries(fieldOverrides)) {
    if (!isComponentLocked(override, key)) continue;
    // WHY: Lazy clone — only allocate a new object if at least one locked
    // override exists. Pass-through returns referential equality otherwise.
    if (!cloned) cloned = { ...fieldOverrides };
    const sanitized = JSON.parse(JSON.stringify(override));
    for (const dotPath of NON_EDITABLE_NESTED_PATHS) {
      deletePath(sanitized, dotPath);
    }
    for (const flatKey of NON_EDITABLE_TOP_LEVEL_KEYS) {
      delete sanitized[flatKey];
    }
    // Prune emptied container objects so save round-trips don't accumulate `{}`.
    pruneEmptyContainer(sanitized, 'contract');
    pruneEmptyContainer(sanitized, 'enum');
    cloned[key] = sanitized;
  }
  return cloned || fieldOverrides;
}
