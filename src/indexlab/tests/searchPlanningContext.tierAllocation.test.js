import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTierAllocation,
  makeFocusGroup,
  makeSeedStatus,
} from './helpers/searchPlanningContextHarness.js';

describe('V4 - computeTierAllocation', () => {
  it('allocates seeds first, then groups, then keys', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: { 'rtings.com': { is_needed: true } },
    });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true, productivity_score: 80 }),
      makeFocusGroup('g2', { group_search_worthy: true, productivity_score: 60 }),
      makeFocusGroup('g3', { group_search_worthy: true, productivity_score: 40 }),
      makeFocusGroup('g4', { group_search_worthy: true, productivity_score: 20 }),
      makeFocusGroup('g5', { group_search_worthy: true, productivity_score: 10 }),
      makeFocusGroup('gk', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k19', 'k20'] }),
    ];
    const allocation = computeTierAllocation(seedStatus, groups, 10);
    assert.equal(allocation.budget, 10);
    assert.equal(allocation.tier1_seed_count, 2);
    assert.equal(allocation.tier2_group_count, 5);
    assert.equal(allocation.tier3_key_count, 3);
    assert.equal(allocation.overflow_group_count, 0);
    assert.equal(allocation.overflow_key_count, 17);
  });

  it('seeds consume entire budget when budget is small', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: {
        'rtings.com': { is_needed: true },
        'amazon.com': { is_needed: true },
      },
    });
    const groups = [makeFocusGroup('g1', { group_search_worthy: true })];
    const allocation = computeTierAllocation(seedStatus, groups, 3);
    assert.equal(allocation.tier1_seed_count, 3);
    assert.equal(allocation.tier2_group_count, 0);
    assert.equal(allocation.tier3_key_count, 0);
    assert.equal(allocation.overflow_group_count, 1);
  });

  it('all budget goes to keys when no seeds or worthy groups', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: false },
    });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2', 'k3'] }),
      makeFocusGroup('g2', { group_search_worthy: false, normalized_key_queue: ['k4', 'k5'] }),
    ];
    const allocation = computeTierAllocation(seedStatus, groups, 10);
    assert.equal(allocation.tier1_seed_count, 0);
    assert.equal(allocation.tier2_group_count, 0);
    assert.equal(allocation.tier3_key_count, 5);
    assert.equal(allocation.overflow_key_count, 0);
  });

  it('budget 0 yields zero allocation everywhere', () => {
    const seedStatus = makeSeedStatus();
    const groups = [makeFocusGroup('g1')];
    const allocation = computeTierAllocation(seedStatus, groups, 0);
    assert.equal(allocation.tier1_seed_count, 0);
    assert.equal(allocation.tier2_group_count, 0);
    assert.equal(allocation.tier3_key_count, 0);
  });

  it('null seedStatus means 0 seeds, budget to groups and keys', () => {
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true, productivity_score: 80 }),
      makeFocusGroup('gk', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2'] }),
    ];
    const allocation = computeTierAllocation(null, groups, 5);
    assert.equal(allocation.tier1_seed_count, 0);
    assert.equal(allocation.tier2_group_count, 1);
    assert.equal(allocation.tier3_key_count, 2);
  });

  it('overflow groups counted when worthy groups exceed remaining budget', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: { 'a.com': { is_needed: true }, 'b.com': { is_needed: true }, 'c.com': { is_needed: true }, 'd.com': { is_needed: true } },
    });
    const groups = Array.from({ length: 9 }, (_, index) =>
      makeFocusGroup(`g${index}`, { group_search_worthy: true, productivity_score: 90 - index * 10 })
    );
    const allocation = computeTierAllocation(seedStatus, groups, 10);
    assert.equal(allocation.tier1_seed_count, 5);
    assert.equal(allocation.tier2_group_count, 5);
    assert.equal(allocation.overflow_group_count, 4);
  });

  it('tier1_seeds array itemizes each seed', () => {
    const seedStatus = makeSeedStatus({
      specs_seed: { is_needed: true },
      source_seeds: { 'rtings.com': { is_needed: true }, 'done.com': { is_needed: false } },
    });
    const allocation = computeTierAllocation(seedStatus, [], 10);
    assert.equal(allocation.tier1_seeds.length, 2);
    assert.deepStrictEqual(allocation.tier1_seeds[0], { type: 'specs', source_name: null, is_needed: true });
    assert.deepStrictEqual(allocation.tier1_seeds[1], { type: 'source', source_name: 'rtings.com', is_needed: true });
  });

  it('brand seed appears first in tier1_seeds', () => {
    const seedStatus = makeSeedStatus({
      brand_seed: { is_needed: true, brand_name: 'Razer' },
      specs_seed: { is_needed: true },
      source_seeds: { 'rtings.com': { is_needed: true } },
    });
    const allocation = computeTierAllocation(seedStatus, [], 10);
    assert.equal(allocation.tier1_seeds.length, 3);
    assert.deepStrictEqual(allocation.tier1_seeds[0], { type: 'brand', source_name: null, is_needed: true });
    assert.deepStrictEqual(allocation.tier1_seeds[1], { type: 'specs', source_name: null, is_needed: true });
    assert.deepStrictEqual(allocation.tier1_seeds[2], { type: 'source', source_name: 'rtings.com', is_needed: true });
  });

  it('tier2_groups array marks allocated vs overflow', () => {
    const seedStatus = makeSeedStatus({ specs_seed: { is_needed: false } });
    const groups = [
      makeFocusGroup('g1', { group_search_worthy: true, productivity_score: 80 }),
      makeFocusGroup('g2', { group_search_worthy: true, productivity_score: 40 }),
      makeFocusGroup('g3', { group_search_worthy: true, productivity_score: 20 }),
    ];
    const allocation = computeTierAllocation(seedStatus, groups, 2);
    const allocated = allocation.tier2_groups.filter((group) => group.allocated);
    const overflow = allocation.tier2_groups.filter((group) => !group.allocated);
    assert.equal(allocated.length, 2);
    assert.equal(overflow.length, 1);
    assert.equal(allocated[0].group_key, 'g1');
    assert.equal(allocated[1].group_key, 'g2');
    assert.equal(overflow[0].group_key, 'g3');
  });

  it('tier3_keys array shows per-group key allocation', () => {
    const seedStatus = makeSeedStatus({ specs_seed: { is_needed: false } });
    const groups = [
      makeFocusGroup('ga', { group_search_worthy: false, normalized_key_queue: ['k1', 'k2', 'k3'] }),
      makeFocusGroup('gb', { group_search_worthy: false, normalized_key_queue: ['k4', 'k5'] }),
    ];
    const allocation = computeTierAllocation(seedStatus, groups, 4);
    assert.equal(allocation.tier3_key_count, 4);
    const firstGroup = allocation.tier3_keys.find((entry) => entry.group_key === 'ga');
    const secondGroup = allocation.tier3_keys.find((entry) => entry.group_key === 'gb');
    assert.ok(firstGroup);
    assert.ok(secondGroup);
    assert.equal(firstGroup.key_count, 3);
    assert.equal(secondGroup.key_count, 2);
    assert.equal(firstGroup.allocated_count + secondGroup.allocated_count, 4);
  });

  it('empty groups and null groups handled gracefully', () => {
    const emptyAllocation = computeTierAllocation(null, [], 10);
    assert.equal(emptyAllocation.tier1_seed_count, 0);
    assert.equal(emptyAllocation.tier2_group_count, 0);
    assert.equal(emptyAllocation.tier3_key_count, 0);

    const nullAllocation = computeTierAllocation(null, null, 10);
    assert.equal(nullAllocation.budget, 10);
    assert.equal(nullAllocation.tier1_seed_count, 0);
  });
});
