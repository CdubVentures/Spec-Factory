import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sortBySlotRank } from '../../features/indexing/pipeline/domainClassifier/runDomainClassifier.js';

// WHY: Characterization tests locking down sortBySlotRank behavior before
// extracting it from runCrawlProcessingLifecycle during planner removal.

describe('sortBySlotRank', () => {
  test('sorts by search_slot ascending then search_rank ascending', () => {
    const sources = [
      { url: 'https://c.com/3', triage_passthrough: { search_slot: 'c', search_rank: 1 } },
      { url: 'https://a.com/1', triage_passthrough: { search_slot: 'a', search_rank: 2 } },
      { url: 'https://a.com/0', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
      { url: 'https://b.com/2', triage_passthrough: { search_slot: 'b', search_rank: 1 } },
    ];
    sortBySlotRank(sources);
    assert.deepEqual(sources.map((s) => s.url), [
      'https://a.com/0', 'https://a.com/1', 'https://b.com/2', 'https://c.com/3',
    ]);
  });

  test('entries without triage_passthrough sort to end', () => {
    const sources = [
      { url: 'https://no-triage.com' },
      { url: 'https://slotted.com', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
    ];
    sortBySlotRank(sources);
    assert.equal(sources[0].url, 'https://slotted.com');
    assert.equal(sources[1].url, 'https://no-triage.com');
  });

  test('host-fallback assigns slot to non-slotted entry from same host', () => {
    const sources = [
      { url: 'https://example.com/page2' },
      { url: 'https://example.com/page1', triage_passthrough: { search_slot: 'b', search_rank: 2 } },
      { url: 'https://other.com/page1', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
    ];
    sortBySlotRank(sources);
    // other.com sorts first (slot 'a'), then both example.com entries (slot 'b')
    // page2 and page1 have identical sort keys after fallback — stable sort preserves input order
    assert.equal(sources[0].url, 'https://other.com/page1');
    assert.equal(sources[1].url, 'https://example.com/page2');
    assert.equal(sources[2].url, 'https://example.com/page1');
    // Verify fallback was assigned to the non-slotted entry
    assert.equal(sources[1].triage_passthrough.search_slot, 'b');
    assert.equal(sources[1].triage_passthrough.search_rank, 2);
  });

  test('host-fallback only assigns once per host', () => {
    const sources = [
      { url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
      { url: 'https://example.com/slotted', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
    ];
    sortBySlotRank(sources);
    // First non-slotted entry gets fallback, second does not
    const aPassthrough = sources.find((s) => s.url === 'https://example.com/a').triage_passthrough;
    const bPassthrough = sources.find((s) => s.url === 'https://example.com/b').triage_passthrough;
    // One gets the fallback, the other stays undefined
    const assignedCount = [aPassthrough, bPassthrough].filter((p) => p?.search_slot === 'a').length;
    assert.equal(assignedCount, 1, 'exactly one non-slotted entry per host gets fallback');
  });

  test('host-fallback picks best (lowest) slot+rank for host', () => {
    const sources = [
      { url: 'https://example.com/seed' },
      { url: 'https://example.com/worse', triage_passthrough: { search_slot: 'c', search_rank: 3 } },
      { url: 'https://example.com/better', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
    ];
    sortBySlotRank(sources);
    const seed = sources.find((s) => s.url === 'https://example.com/seed');
    assert.equal(seed.triage_passthrough.search_slot, 'a');
    assert.equal(seed.triage_passthrough.search_rank, 1);
  });

  test('empty array is a no-op', () => {
    const sources = [];
    sortBySlotRank(sources);
    assert.equal(sources.length, 0);
  });

  test('single entry is a no-op', () => {
    const sources = [{ url: 'https://solo.com', triage_passthrough: { search_slot: 'a', search_rank: 1 } }];
    sortBySlotRank(sources);
    assert.equal(sources[0].url, 'https://solo.com');
  });

  test('stable sort preserves input order when slot and rank are equal', () => {
    const sources = [
      { url: 'https://first.com', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
      { url: 'https://second.com', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
    ];
    sortBySlotRank(sources);
    assert.equal(sources[0].url, 'https://first.com');
    assert.equal(sources[1].url, 'https://second.com');
  });
});
