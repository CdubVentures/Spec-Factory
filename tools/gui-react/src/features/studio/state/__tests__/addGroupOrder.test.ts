// WHY: Regression test — addGroup must not reassign existing keys to the new group.
// Bug: prepending the group marker caused syncGroupsFromOrder to capture all keys.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { syncGroupsFromOrder, deriveGroupsTs } from '../keyUtils.ts';

type RuleMap = Record<string, Record<string, unknown>>;

function makeRule(group = 'general'): Record<string, unknown> {
  return { group, ui: { group } };
}

describe('syncGroupsFromOrder — new group must not steal existing keys', () => {
  it('appending a group marker leaves existing keys in their current group', () => {
    const rules: RuleMap = {
      colors: makeRule('general'),
      editions: makeRule('general'),
      brand: makeRule('general'),
    };
    const order = ['__grp::general', 'colors', 'editions', 'brand', '__grp::Custom'];
    const result = syncGroupsFromOrder(order, rules);
    assert.equal((result.colors.ui as Record<string, unknown>).group, 'general');
    assert.equal((result.editions.ui as Record<string, unknown>).group, 'general');
    assert.equal((result.brand.ui as Record<string, unknown>).group, 'general');
  });

  it('prepending a group marker before existing keys reassigns them (the bug)', () => {
    const rules: RuleMap = {
      colors: makeRule('general'),
      editions: makeRule('general'),
    };
    // Simulates the OLD buggy addGroup behavior (prepend)
    const order = ['__grp::Custom', 'colors', 'editions'];
    const result = syncGroupsFromOrder(order, rules);
    // After the fix, this test documents the sync behavior — keys after
    // a marker get that group. The fix is in addGroup placement, not sync.
    assert.equal((result.colors.ui as Record<string, unknown>).group, 'Custom');
    assert.equal((result.editions.ui as Record<string, unknown>).group, 'Custom');
  });

  it('new group appended to end starts with zero keys', () => {
    const rules: RuleMap = {
      colors: makeRule('general'),
      editions: makeRule('general'),
    };
    const order = ['__grp::general', 'colors', 'editions', '__grp::Custom'];
    const groups = deriveGroupsTs(order, rules);
    const customGroup = groups.find(([name]) => name === 'Custom');
    assert.ok(customGroup, 'Custom group exists');
    assert.deepEqual(customGroup[1], [], 'Custom group has no keys');
  });

  it('keys without any group marker stay ungrouped', () => {
    const rules: RuleMap = {
      colors: makeRule('ungrouped'),
      editions: makeRule('ungrouped'),
    };
    const order = ['colors', 'editions', '__grp::Custom'];
    const result = syncGroupsFromOrder(order, rules);
    assert.equal((result.colors.ui as Record<string, unknown>).group, 'ungrouped');
    assert.equal((result.editions.ui as Record<string, unknown>).group, 'ungrouped');
  });
});
