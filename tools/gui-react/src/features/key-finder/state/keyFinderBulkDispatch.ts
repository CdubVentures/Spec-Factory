import type { KeyGroup } from '../types.ts';
import { sortKeysByPriority } from './keyFinderGroupedRows.ts';

export const GLOBAL_LOOP_CHAIN_ID = '__all_groups__';

function groupByName(groups: readonly KeyGroup[], groupName: string): KeyGroup | null {
  return groups.find((group) => group.name === groupName) ?? null;
}

function keyList(group: KeyGroup | null, axisOrder?: readonly string[]): readonly string[] {
  if (!group) return [];
  return sortKeysByPriority(group.keys, axisOrder).map((key) => key.field_key);
}

function allKeys(groups: readonly KeyGroup[], axisOrder?: readonly string[]): readonly string[] {
  return sortKeysByPriority(groups.flatMap((group) => group.keys), axisOrder)
    .map((key) => key.field_key);
}

function loopEligible(group: KeyGroup): KeyGroup {
  const keys = group.keys.filter((key) => key.last_status !== 'resolved' && !key.published);
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
