import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDiscoveryPriority } from '../src/planner/sourcePlannerComparator.js';

// --- Table-driven comparator tests ---

const COMPARATOR_CASES = [
  {
    name: 'approved beats candidate (approval_bucket)',
    a: { approval_bucket: 'approved', selection_priority: 'medium', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'candidate', selection_priority: 'medium', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'candidate loses to approved',
    a: { approval_bucket: 'candidate', selection_priority: 'high', primary_lane: 1, triage_score: 99, host_yield_state: 'promoted', discovered_from: 'seed', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'low', primary_lane: 7, triage_score: 1, host_yield_state: 'caution', discovered_from: 'candidate', canonical_url: 'https://b.com/1' },
    expect: 'b_wins',
  },
  {
    name: 'high selection_priority beats medium (same bucket)',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'medium', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'medium beats low selection_priority',
    a: { approval_bucket: 'approved', selection_priority: 'medium', primary_lane: 5, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'low', primary_lane: 5, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'low beats audit selection_priority',
    a: { approval_bucket: 'approved', selection_priority: 'low', primary_lane: 5, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'audit', primary_lane: 5, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'higher lane beats lower (lane 2 > lane 1 > lane 3)',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 2, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 1, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'lane 1 beats lane 3',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 1, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'higher triage_score breaks lane tie',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 80, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 40, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'yield state breaks score tie (promoted > normal)',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'promoted', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'yield state: normal beats caution',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'caution', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'yield state: caution beats capped',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'caution', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'capped', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'discovered_from breaks yield tie (seed > approved)',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'seed', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'discovered_from: approved > candidate',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'candidate', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'canonical_url tiebreaks ascending',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 3, triage_score: 50, host_yield_state: 'normal', discovered_from: 'approved', canonical_url: 'https://b.com/1' },
    expect: 'a_wins',
  },
  {
    name: 'identical items return 0',
    a: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 2, triage_score: 50, host_yield_state: 'normal', discovered_from: 'seed', canonical_url: 'https://a.com/1' },
    b: { approval_bucket: 'approved', selection_priority: 'high', primary_lane: 2, triage_score: 50, host_yield_state: 'normal', discovered_from: 'seed', canonical_url: 'https://a.com/1' },
    expect: 'tie',
  },
];

for (const { name, a, b, expect: expected } of COMPARATOR_CASES) {
  test(`compareDiscoveryPriority: ${name}`, () => {
    const result = compareDiscoveryPriority(a, b);
    if (expected === 'a_wins') {
      assert.ok(result < 0, `expected a to win (negative), got ${result}`);
    } else if (expected === 'b_wins') {
      assert.ok(result > 0, `expected b to win (positive), got ${result}`);
    } else {
      assert.equal(result, 0, `expected tie, got ${result}`);
    }
  });
}

// --- Missing/default field handling ---

test('compareDiscoveryPriority: missing fields default safely', () => {
  const a = { canonical_url: 'https://a.com/1' };
  const b = { canonical_url: 'https://b.com/1' };
  const result = compareDiscoveryPriority(a, b);
  // With all defaults equal, canonical_url tiebreaks
  assert.ok(result < 0, 'a.com should win alphabetically');
});

test('compareDiscoveryPriority: unknown selection_priority treated as lowest', () => {
  const a = { selection_priority: 'audit', canonical_url: 'https://a.com/1' };
  const b = { selection_priority: 'unknown_value', canonical_url: 'https://b.com/1' };
  const result = compareDiscoveryPriority(a, b);
  assert.ok(result < 0, 'audit should beat unknown');
});
