import type { KeyGroup } from '../types.ts';
import { sortKeysByPriority } from './keyFinderGroupedRows.ts';

export const GLOBAL_LOOP_CHAIN_ID = '__all_groups__';

function groupByName(groups: readonly KeyGroup[], groupName: string): KeyGroup | null {
  return groups.find((group) => group.name === groupName) ?? null;
}

function keyList(group: KeyGroup | null, axisOrder?: readonly string[]): readonly string[] {
  if (!group) return [];
  return sortKeysByPriority(group.keys.filter(isDispatchableKey), axisOrder).map((key) => key.field_key);
}

function allKeys(groups: readonly KeyGroup[], axisOrder?: readonly string[]): readonly string[] {
  return sortKeysByPriority(groups.flatMap((group) => group.keys).filter(isDispatchableKey), axisOrder)
    .map((key) => key.field_key);
}

function isDispatchableKey(key: { readonly run_blocked_reason?: string }): boolean {
  return !key.run_blocked_reason;
}

function loopEligible(group: KeyGroup): KeyGroup {
  const keys = group.keys.filter((key) => key.last_status !== 'resolved' && !key.published && isDispatchableKey(key));
  return {
    ...group,
    keys,
  };
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
  return group ? keyList(loopEligible(group), axisOrder) : [];
}

export function buildLoopAllDispatchKeys(
  groups: readonly KeyGroup[],
  axisOrder?: readonly string[],
): readonly string[] {
  return allKeys(groups.map(loopEligible), axisOrder);
}
