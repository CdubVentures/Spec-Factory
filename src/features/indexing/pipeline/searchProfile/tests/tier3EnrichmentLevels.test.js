// WHY: Characterization test for Tier 3 key_search progressive enrichment.
// The user's "tier 3abcd" maps to repeat_count levels:
//   3a = repeat_count=0 → bare (product + key)
//   3b = repeat_count=1 → +aliases
//   3c = repeat_count=2 → +aliases +domain_hints
//   3d = repeat_count=3 → +aliases +domain_hints +content_types
// This test locks that contract so a future refactor doesn't silently break
// the enrichment ladder.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier3Queries } from '../queryBuilder.js';

const JOB = {
  productId: 'mouse-test',
  brand: 'Cooler Master',
  base_model: 'MM731',
  model: 'MM731',
  identityLock: { brand: 'Cooler Master', base_model: 'MM731', model: 'MM731', variant: '' },
};

function makeKeyGroup(repeatCount) {
  return {
    key: 'sensor_group',
    group_search_worthy: false,
    unresolved_field_keys: ['dpi'],
    normalized_key_queue: [
      {
        normalized_key: 'dpi',
        repeat_count: repeatCount,
        all_aliases: ['sensitivity', 'tracking_resolution'],
        domain_hints: ['rtings.com', 'techpowerup.com'],
        content_types: ['review', 'benchmark'],
        domains_tried_for_key: [],
        content_types_tried_for_key: [],
      },
    ],
  };
}

describe('Tier 3 enrichment levels (3a/3b/3c/3d characterization)', () => {
  it('3a (repeat_count=0): bare query — no alias / domain_hint / content_type suffixes', () => {
    const rows = buildTier3Queries(JOB, [makeKeyGroup(0)], { category: 'mouse' }, null);
    assert.equal(rows.length, 1);
    const q = rows[0].query;
    assert.equal(rows[0].repeat_count, 0);
    assert.ok(q.includes('Cooler Master MM731'), 'query has product');
    assert.ok(q.includes('dpi'), 'query has normalized key');
    // Bare means none of the enrichment tokens appear.
    assert.ok(!q.includes('sensitivity'), `3a must not include aliases: ${q}`);
    assert.ok(!q.includes('rtings.com'), `3a must not include domain hints: ${q}`);
    assert.ok(!q.includes('review'), `3a must not include content types: ${q}`);
  });

  it('3b (repeat_count=1): adds aliases (first enrichment)', () => {
    const rows = buildTier3Queries(JOB, [makeKeyGroup(1)], { category: 'mouse' }, null);
    const q = rows[0].query;
    assert.equal(rows[0].repeat_count, 1);
    // Aliases applied.
    assert.ok(q.includes('sensitivity') || q.includes('tracking_resolution'), `3b must include aliases: ${q}`);
    // Next enrichments NOT applied.
    assert.ok(!q.includes('rtings.com'), `3b must not include domain hints yet: ${q}`);
    assert.ok(!q.includes('review') && !q.includes('benchmark'), `3b must not include content types yet: ${q}`);
  });

  it('3c (repeat_count=2): adds aliases + domain_hints', () => {
    const rows = buildTier3Queries(JOB, [makeKeyGroup(2)], { category: 'mouse' }, null);
    const q = rows[0].query;
    assert.equal(rows[0].repeat_count, 2);
    assert.ok(q.includes('sensitivity') || q.includes('tracking_resolution'), `3c must include aliases: ${q}`);
    assert.ok(q.includes('rtings.com') || q.includes('techpowerup.com'), `3c must include domain hints: ${q}`);
    assert.ok(!q.includes('review') && !q.includes('benchmark'), `3c must not include content types yet: ${q}`);
  });

  it('3d (repeat_count=3): adds aliases + domain_hints + content_types (full enrichment)', () => {
    const rows = buildTier3Queries(JOB, [makeKeyGroup(3)], { category: 'mouse' }, null);
    const q = rows[0].query;
    assert.equal(rows[0].repeat_count, 3);
    assert.ok(q.includes('sensitivity') || q.includes('tracking_resolution'), `3d must include aliases: ${q}`);
    assert.ok(q.includes('rtings.com') || q.includes('techpowerup.com'), `3d must include domain hints: ${q}`);
    assert.ok(q.includes('review') || q.includes('benchmark'), `3d must include content types: ${q}`);
  });

  it('each enrichment level produces distinct query text for the same key', () => {
    const q0 = buildTier3Queries(JOB, [makeKeyGroup(0)], { category: 'mouse' }, null)[0].query;
    const q1 = buildTier3Queries(JOB, [makeKeyGroup(1)], { category: 'mouse' }, null)[0].query;
    const q2 = buildTier3Queries(JOB, [makeKeyGroup(2)], { category: 'mouse' }, null)[0].query;
    const q3 = buildTier3Queries(JOB, [makeKeyGroup(3)], { category: 'mouse' }, null)[0].query;
    const queries = [q0, q1, q2, q3];
    const distinct = new Set(queries);
    assert.equal(distinct.size, 4, `all 4 enrichment levels must produce distinct queries. Got: ${JSON.stringify(queries)}`);
  });

  it('repeat_count higher than enrichmentOrder length applies all enrichments (no crash)', () => {
    const rows = buildTier3Queries(JOB, [makeKeyGroup(99)], { category: 'mouse' }, null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.length > 0);
    assert.equal(rows[0].repeat_count, 99);
  });

  it('tier field is "key_search" on all emissions (tier metadata preserved)', () => {
    for (let r = 0; r <= 3; r++) {
      const row = buildTier3Queries(JOB, [makeKeyGroup(r)], { category: 'mouse' }, null)[0];
      assert.equal(row.tier, 'key_search', `repeat_count=${r} must have tier=key_search`);
      assert.equal(row.hint_source, 'tier3_key', `repeat_count=${r} must have hint_source=tier3_key`);
      assert.equal(row.normalized_key, 'dpi', `normalized_key preserved`);
      assert.equal(row.group_key, 'sensor_group', `group_key preserved`);
    }
  });
});
