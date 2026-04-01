import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroupDescriptionShort,
  buildGroupDescriptionLong,
  buildGroupFingerprintFine,
  computeGroupQueryCount,
  isGroupSearchWorthy,
  buildNormalizedKeyQueue,
  deriveSeedStatus,
} from './helpers/searchPlanningContextHarness.js';

describe('V4 - buildGroupDescriptionShort', () => {
  it('extracts search-safe tokens from catalog desc', () => {
    assert.equal(buildGroupDescriptionShort('Sensor and performance metrics'), 'sensor performance metrics');
  });

  it('empty desc -> empty string', () => {
    assert.equal(buildGroupDescriptionShort(''), '');
    assert.equal(buildGroupDescriptionShort(null), '');
  });

  it('caps at 10 tokens', () => {
    const long = 'a b c d e f g h i j k l m n';
    assert.ok(buildGroupDescriptionShort(long).split(/\s+/).length <= 10);
  });
});

describe('V4 - buildGroupDescriptionLong', () => {
  it('appends unresolved keys to desc', () => {
    const result = buildGroupDescriptionLong('Sensor metrics', ['dpi', 'polling rate']);
    assert.ok(result.includes('sensor'));
    assert.ok(result.includes('dpi'));
    assert.ok(result.includes('polling rate'));
  });

  it('caps at 20 tokens', () => {
    const keys = Array.from({ length: 20 }, (_, i) => `field_${i}`);
    const result = buildGroupDescriptionLong('Sensor and performance metrics', keys);
    assert.ok(result.split(/\s+/).length <= 20);
  });
});

describe('V4 - buildGroupFingerprintFine', () => {
  it('produces group_key::sorted_keys format', () => {
    assert.equal(
      buildGroupFingerprintFine('sensor_performance', ['polling rate', 'dpi', 'lift distance']),
      'sensor_performance::dpi,lift distance,polling rate'
    );
  });

  it('empty keys -> group_key:: only', () => {
    assert.equal(buildGroupFingerprintFine('sp', []), 'sp::');
  });
});

describe('V4 - computeGroupQueryCount', () => {
  it('counts tier=group_search matching group_key', () => {
    const history = {
      queries: [
        { tier: 'group_search', group_key: 'sp' },
        { tier: 'group_search', group_key: 'sp' },
        { tier: 'group_search', group_key: 'other' },
        { tier: 'key_search', group_key: 'sp' },
        { tier: 'seed', group_key: null },
      ],
    };
    assert.equal(computeGroupQueryCount('sp', history), 2);
  });

  it('null history -> 0', () => {
    assert.equal(computeGroupQueryCount('sp', null), 0);
  });
});

describe('V4 - isGroupSearchWorthy', () => {
  it('worthy when all conditions met', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3,
      unresolvedCount: 5,
      groupQueryCount: 0,
      phase: 'now',
    });
    assert.equal(worthy, true);
    assert.equal(skipReason, null);
  });

  it('not worthy when coverage >= threshold', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.9,
      unresolvedCount: 5,
      groupQueryCount: 0,
      phase: 'now',
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'group_mostly_resolved');
  });

  it('not worthy when too few unresolved', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3,
      unresolvedCount: 2,
      groupQueryCount: 0,
      phase: 'now',
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'too_few_missing_keys');
  });

  it('not worthy when group_query_count >= max', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3,
      unresolvedCount: 5,
      groupQueryCount: 3,
      phase: 'now',
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'group_search_exhausted');
  });

  it('not worthy when phase=hold', () => {
    const { worthy, skipReason } = isGroupSearchWorthy({
      coverageRatio: 0.3,
      unresolvedCount: 5,
      groupQueryCount: 0,
      phase: 'hold',
    });
    assert.equal(worthy, false);
    assert.equal(skipReason, 'group_on_hold');
  });
});

describe('V4 - buildNormalizedKeyQueue', () => {
  it('sorts by availability -> difficulty -> repeat -> need_score -> required_level', () => {
    const fields = [
      { normalized_key: 'rare hard', availability: 'rare', difficulty: 'hard', repeat_count: 0, need_score: 80, required_level: 'critical' },
      { normalized_key: 'expected easy', availability: 'expected', difficulty: 'easy', repeat_count: 0, need_score: 30, required_level: 'expected' },
      { normalized_key: 'expected hard', availability: 'expected', difficulty: 'hard', repeat_count: 0, need_score: 60, required_level: 'required' },
    ];
    const queue = buildNormalizedKeyQueue(fields);
    assert.deepStrictEqual(queue.map((entry) => typeof entry === 'string' ? entry : entry.normalized_key), ['expected easy', 'expected hard', 'rare hard']);
  });

  it('returns enriched objects with per-key search metadata', () => {
    const fields = [
      {
        normalized_key: 'battery hours',
        field_key: 'battery_hours',
        availability: 'expected',
        difficulty: 'medium',
        repeat_count: 2,
        need_score: 40,
        required_level: 'required',
        all_aliases: ['battery life', 'battery runtime'],
        alias_shards: [['battery life', 'battery runtime']],
        domains_tried_for_key: ['rtings.com'],
        content_types_tried_for_key: ['review'],
        idx: { domain_hints: ['rtings.com', 'mousespecs.org'], preferred_content_types: ['review', 'product_page'] },
      },
    ];
    const queue = buildNormalizedKeyQueue(fields);
    assert.equal(queue.length, 1);
    const entry = queue[0];
    assert.equal(typeof entry, 'object', 'queue entries should be objects, not strings');
    assert.equal(entry.normalized_key, 'battery hours');
    assert.equal(entry.repeat_count, 2);
    assert.deepStrictEqual(entry.all_aliases, ['battery life', 'battery runtime']);
    assert.deepStrictEqual(entry.domain_hints, ['rtings.com', 'mousespecs.org']);
    assert.deepStrictEqual(entry.preferred_content_types, ['review', 'product_page']);
    assert.deepStrictEqual(entry.domains_tried_for_key, ['rtings.com']);
  });
});

describe('V4 - deriveSeedStatus', () => {
  it('specs seed needed when never run', () => {
    const status = deriveSeedStatus(null, { official_domain: 'razer.com', manufacturer: 'Razer' });
    assert.equal(status.specs_seed.is_needed, true);
    assert.equal(status.specs_seed.cooldown_until_ms, null);
    assert.equal(status.specs_seed.attempt_count, 0);
  });

  it('brand_seed is_needed when identity has manufacturer', () => {
    const status = deriveSeedStatus(null, { manufacturer: 'Razer' });
    assert.equal(status.brand_seed.is_needed, true);
    assert.equal(status.brand_seed.brand_name, 'Razer');
  });

  it('brand_seed not needed when no brand name', () => {
    const status = deriveSeedStatus(null, {});
    assert.equal(status.brand_seed.is_needed, false);
    assert.equal(status.brand_seed.brand_name, '');
  });

  it('identity domains are not included in source_seeds', () => {
    const status = deriveSeedStatus(null, { official_domain: 'razer.com', support_domain: 'support.razer.com', manufacturer: 'Razer' });
    assert.equal(status.source_seeds['razer.com'], undefined);
    assert.equal(status.source_seeds['support.razer.com'], undefined);
  });

  it('specs seed not needed when on active cooldown', () => {
    const now = Date.now();
    const future = new Date(now + 30 * 86400000).toISOString();
    const history = {
      queries: [{
        tier: 'seed',
        source_name: null,
        completed_at_ms: now - 1000,
        attempt_count: 1,
        cooldown_until: future,
      }],
    };
    const status = deriveSeedStatus(history, {});
    assert.equal(status.specs_seed.is_needed, false);
    assert.ok(status.specs_seed.cooldown_until_ms > now);
  });

  it('specs seed needed when cooldown expired', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const history = {
      queries: [{
        tier: 'seed',
        source_name: null,
        completed_at_ms: Date.now() - 31 * 86400000,
        attempt_count: 1,
        cooldown_until: past,
      }],
    };
    const status = deriveSeedStatus(history, {});
    assert.equal(status.specs_seed.is_needed, true);
    assert.equal(status.specs_seed.cooldown_until_ms, null);
  });

  it('source seeds are tracked per source_name', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const history = {
      queries: [
        { tier: 'seed', source_name: 'rtings.com', completed_at_ms: Date.now() - 1000, attempt_count: 1, cooldown_until: future },
        { tier: 'seed', source_name: 'amazon.com', completed_at_ms: Date.now() - 1000, attempt_count: 1, cooldown_until: '' },
      ],
    };
    const status = deriveSeedStatus(history, { official_domain: 'razer.com', manufacturer: 'Razer' });
    assert.equal(status.source_seeds['rtings.com'].is_needed, false);
    assert.equal(status.source_seeds['amazon.com'].is_needed, true);
    assert.equal(status.source_seeds['razer.com'], undefined);
    assert.equal(status.brand_seed.is_needed, true);
  });

  it('query_completion_summary counts correctly', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const history = {
      queries: [
        { tier: 'seed', cooldown_until: future },
        { tier: 'group_search', cooldown_until: '' },
        { tier: 'key_search', cooldown_until: future },
      ],
    };
    const status = deriveSeedStatus(history, {});
    assert.equal(status.query_completion_summary.total_queries, 3);
    assert.equal(status.query_completion_summary.complete, 2);
    assert.equal(status.query_completion_summary.incomplete, 1);
  });
});
