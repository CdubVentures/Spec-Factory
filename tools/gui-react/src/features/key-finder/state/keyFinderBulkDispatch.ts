import type { KeyGroup } from '../types.ts';
import { sortKeysByPriority } from './keyFinderGroupedRows.ts';
import {
  isComponentIdentityChildKey,
  isKeyRunBlocked,
  type ComponentKeyRunState,
} from './componentKeyRunGuards.ts';

export const GLOBAL_LOOP_CHAIN_ID = '__all_groups__';

function groupByName(groups: readonly KeyGroup[], groupName: string): KeyGroup | null {
  return groups.find((group) => group.name === groupName) ?? null;
}

function keyList(group: KeyGroup | null, axisOrder?: readonly string[]): readonly string[] {
  if (!group) return [];
  return buildDispatchKeyOrder(group.keys, { axisOrder, mode: 'run' });
}

function allKeys(groups: readonly KeyGroup[], axisOrder?: readonly string[]): readonly string[] {
  return buildDispatchKeyOrder(groups.flatMap((group) => group.keys), { axisOrder, mode: 'run' });
}

function isDispatchableKey(key: ComponentKeyRunState): boolean {
  return !isKeyRunBlocked(key);
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function componentFacetOrder(key: ComponentKeyRunState): number {
  if (key.component_run_kind === 'component_brand') return 0;
  if (key.component_run_kind === 'component_link') return 1;
  return 2;
}

function isResolvedKey(key: ComponentKeyRunState & { readonly last_status?: string | null; readonly published?: boolean }): boolean {
  return key.last_status === 'resolved' || key.published === true;
}

function deferredIdentityChildrenForParent<T extends ComponentKeyRunState & { readonly field_key: string }>(
  rows: readonly T[],
  parentFieldKey: string,
  mode: 'run' | 'loop',
): readonly T[] {
  return rows
    .filter((row) => (
      isComponentIdentityChildKey(row)
      && isKeyRunBlocked(row)
      && clean(row.component_parent_key) === parentFieldKey
      && (mode === 'run' || !isResolvedKey(row))
    ))
    .sort((a, b) => {
      const facetDelta = componentFacetOrder(a) - componentFacetOrder(b);
      return facetDelta || a.field_key.localeCompare(b.field_key);
    });
}

export function buildDispatchKeyOrder<T extends ComponentKeyRunState & {
  readonly field_key: string;
  readonly difficulty?: string;
  readonly required_level?: string;
  readonly availability?: string;
  readonly last_status?: string | null;
  readonly published?: boolean;
}>(
  rows: readonly T[],
  { axisOrder, mode }: { readonly axisOrder?: readonly string[]; readonly mode: 'run' | 'loop' },
): readonly string[] {
  const eligible = rows.filter((key) => (
    isDispatchableKey(key)
    && (mode === 'run' || !isResolvedKey(key))
  ));
  const sorted = sortKeysByPriority(eligible.map((entry) => ({
    ...entry,
    difficulty: entry.difficulty ?? '',
    required_level: entry.required_level ?? '',
    availability: entry.availability ?? '',
  })), axisOrder);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of sorted) {
    if (seen.has(key.field_key)) continue;
    seen.add(key.field_key);
    out.push(key.field_key);
    const children = deferredIdentityChildrenForParent(rows, key.field_key, mode);
    for (const child of children) {
      if (seen.has(child.field_key)) continue;
      seen.add(child.field_key);
      out.push(child.field_key);
    }
  }
  return out;
}

export function buildRunGroupDispatchKeys(
  groups: readonly KeyGroup[],
  groupName: string,
  axisOrder?: readonly string[],
): readonly string[] {
  return keyList(groupByName(groups, groupName), axisOrder);
}

export function buildRunAllDispatchKeys(
  groups: readonly KeyGroup[],
  axisOrder?: readonly string[],
): readonly string[] {
  return allKeys(groups, axisOrder);
}

export function buildLoopGroupDispatchKeys(
  groups: readonly KeyGroup[],
  groupName: string,
  axisOrder?: readonly string[],
): readonly string[] {
  const group = groupByName(groups, groupName);
  return group ? buildDispatchKeyOrder(group.keys, { axisOrder, mode: 'loop' }) : [];
}

export function buildLoopAllDispatchKeys(
  groups: readonly KeyGroup[],
  axisOrder?: readonly string[],
): readonly string[] {
  return buildDispatchKeyOrder(groups.flatMap((group) => group.keys), { axisOrder, mode: 'loop' });
}
