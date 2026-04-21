/**
 * Pure keyboard-nav helper for FinderTabBar. Testable under `node --test`.
 * Wraps at both ends; Home / End jump to first / last id.
 */

export type TabNavDirection = 'right' | 'left' | 'home' | 'end';

export function nextTabId<T extends string>(
  current: T,
  direction: TabNavDirection,
  ids: readonly T[],
): T {
  if (ids.length === 0) return current;
  if (direction === 'home') return ids[0];
  if (direction === 'end') return ids[ids.length - 1];
  const idx = ids.indexOf(current);
  if (idx < 0) return ids[0];
  if (direction === 'right') return ids[(idx + 1) % ids.length];
  return ids[(idx - 1 + ids.length) % ids.length];
}
