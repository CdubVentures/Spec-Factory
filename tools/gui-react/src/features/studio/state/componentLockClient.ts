// WHY: Client-side mirror of backend component-lock helpers
// (src/features/studio/contracts/componentLock.js).
//
// The Zustand store guards `updateField` and `removeKey` against writes that
// would break the lock contract (`enum.source === component_db.<self>`).
// Backend remains SSOT — applied at the save boundary in studioRoutes.js;
// the client predicate is the optimistic UX layer.
//
// Parity test: tools/gui-react/.../componentLockClient.parity.test.ts
// asserts this file's outputs match the JS module's outputs.

const EXACT_EDITABLE_PATHS: ReadonlySet<string> = new Set([
  'enum.policy',
  'enum.match.format_hint',
  'aliases',
  'constraints',
  'ui.label',
  'ui.group',
  'ui.order',
  'ui.tooltip_md',
  'ui.aliases',
]);

const EDITABLE_PATH_PREFIXES: readonly string[] = [
  'priority.',
  'ai_assist.',
  'evidence.',
  'search_hints.',
];

export function isComponentLockEditablePath(path: string): boolean {
  if (typeof path !== 'string') return false;
  if (EXACT_EDITABLE_PATHS.has(path)) return true;
  for (const prefix of EDITABLE_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

export function isComponentLocked(rule: Record<string, unknown> | undefined, key: string): boolean {
  if (!rule || typeof rule !== 'object' || !key) return false;
  const enumBlock = (rule as { enum?: Record<string, unknown> }).enum;
  const nestedSource = enumBlock && typeof enumBlock.source === 'string' ? enumBlock.source : '';
  if (nestedSource === `component_db.${key}`) return true;
  const flatSource = (rule as { enum_source?: unknown }).enum_source;
  if (typeof flatSource === 'string' && flatSource === `component_db.${key}`) return true;
  if (
    flatSource
    && typeof flatSource === 'object'
    && (flatSource as { type?: unknown; ref?: unknown }).type === 'component_db'
    && (flatSource as { ref?: unknown }).ref === key
  ) return true;
  return false;
}
