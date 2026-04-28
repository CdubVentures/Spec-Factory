// WHY: Client-side mirror of backend component-lock helpers
// (src/features/studio/contracts/componentLock.js).
//
// The Zustand store guards `updateField` and `removeKey` against writes that
// would break the lock contract (`enum.source === component_db.<self>`).
// The shared rule command path also normalizes component enum.policy away
// from `open`, while still allowing `closed` and `open_prefer_known`.
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

const IDENTITY_PROJECTION_EDITABLE_PATHS: ReadonlySet<string> = new Set([
  'aliases',
  'constraints',
  'ui.group',
  'ui.order',
  'ui.tooltip_md',
  'ui.aliases',
]);

const COMPONENT_IDENTITY_PROJECTION_FACETS: ReadonlySet<string> = new Set(['brand', 'link']);

export interface ComponentIdentityProjectionLock {
  componentType: string;
  facet: string;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getComponentIdentityProjectionLock(
  rule: Record<string, unknown> | undefined,
): ComponentIdentityProjectionLock | null {
  if (!rule || typeof rule !== 'object') return null;
  const projection = (rule as { component_identity_projection?: unknown }).component_identity_projection;
  if (!projection || typeof projection !== 'object') return null;
  const componentType = normalizeText((projection as { component_type?: unknown }).component_type);
  const facet = normalizeText((projection as { facet?: unknown }).facet).toLowerCase();
  if (!componentType || !COMPONENT_IDENTITY_PROJECTION_FACETS.has(facet)) return null;
  return { componentType, facet };
}

export function isComponentIdentityProjectionLocked(rule: Record<string, unknown> | undefined): boolean {
  return Boolean(getComponentIdentityProjectionLock(rule));
}

function isComponentIdentityProjectionEditablePath(path: string): boolean {
  if (typeof path !== 'string') return false;
  if (IDENTITY_PROJECTION_EDITABLE_PATHS.has(path)) return true;
  for (const prefix of EDITABLE_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

export function isComponentLockEditablePath(
  path: string,
  rule?: Record<string, unknown> | undefined,
): boolean {
  if (isComponentIdentityProjectionLocked(rule)) {
    return isComponentIdentityProjectionEditablePath(path);
  }
  if (typeof path !== 'string') return false;
  if (EXACT_EDITABLE_PATHS.has(path)) return true;
  for (const prefix of EDITABLE_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

function isComponentSelfLocked(rule: Record<string, unknown> | undefined, key: string): boolean {
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

export type ComponentLockKind = '' | 'component_self' | 'identity_projection';

export function getComponentLockKind(rule: Record<string, unknown> | undefined, key: string): ComponentLockKind {
  if (isComponentSelfLocked(rule, key)) return 'component_self';
  if (isComponentIdentityProjectionLocked(rule)) return 'identity_projection';
  return '';
}

export function isComponentLocked(rule: Record<string, unknown> | undefined, key: string): boolean {
  return getComponentLockKind(rule, key) !== '';
}
