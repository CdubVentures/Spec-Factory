import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDedupeOutcomeEvent, dedupeOutcomeToEventKey } from '../dedupeOutcomeEvent.js';

function makeIndexResult(overrides = {}) {
  return {
    docId: 'doc_abc123',
    snippetIds: ['sn_a', 'sn_b'],
    dedupeOutcome: 'new',
    chunksIndexed: 5,
    factsIndexed: 2,
    ...overrides,
  };
}

describe('dedupe outcome telemetry preserves the document-indexing contract', () => {
  it('emits the event payload used by downstream runtime metrics', () => {
    const result = buildDedupeOutcomeEvent({
      indexResult: makeIndexResult(),
      url: 'https://example.com/spec',
      host: 'example.com',
    });
    assert.deepStrictEqual(result, {
      dedupe_outcome: 'new',
      doc_id: 'doc_abc123',
      chunks_indexed: 5,
      facts_indexed: 2,
      snippet_count: 2,
      url: 'https://example.com/spec',
      host: 'example.com',
    });
  });

  it('preserves each dedupe branch in the emitted payload', () => {
    const scenarios = [
      {
        name: 'new',
        indexResult: makeIndexResult({
          docId: 'd1',
          snippetIds: [],
          dedupeOutcome: 'new',
          chunksIndexed: 0,
          factsIndexed: 0,
        }),
        expected: {
          outcome: 'new',
          snippetCount: 0,
          chunksIndexed: 0,
          factsIndexed: 0,
        },
      },
      {
        name: 'reused',
        indexResult: makeIndexResult({
          docId: 'd2',
          snippetIds: [],
          dedupeOutcome: 'reused',
          chunksIndexed: 0,
          factsIndexed: 0,
        }),
        expected: {
          outcome: 'reused',
          snippetCount: 0,
          chunksIndexed: 0,
          factsIndexed: 0,
        },
      },
      {
        name: 'updated',
        indexResult: makeIndexResult({
          docId: 'd3',
          snippetIds: ['sn_x'],
          dedupeOutcome: 'updated',
          chunksIndexed: 3,
          factsIndexed: 1,
        }),
        expected: {
          outcome: 'updated',
          snippetCount: 1,
          chunksIndexed: 3,
          factsIndexed: 1,
        },
      },
    ];

    for (const scenario of scenarios) {
      const result = buildDedupeOutcomeEvent({
        indexResult: scenario.indexResult,
        url: 'https://review.com/page',
        host: 'review.com',
      });
      assert.equal(result.dedupe_outcome, scenario.expected.outcome, scenario.name);
      assert.equal(result.snippet_count, scenario.expected.snippetCount, scenario.name);
      assert.equal(result.chunks_indexed, scenario.expected.chunksIndexed, scenario.name);
      assert.equal(result.facts_indexed, scenario.expected.factsIndexed, scenario.name);
    }
  });

  it('maps dedupe branches onto the public event-key contract', () => {
    const cases = [
      ['new', 'indexed_new'],
      ['reused', 'dedupe_hit'],
      ['updated', 'dedupe_updated'],
      ['unknown', 'indexed_new'],
      ['', 'indexed_new'],
    ];

    for (const [outcome, expectedKey] of cases) {
      assert.equal(dedupeOutcomeToEventKey(outcome), expectedKey);
    }
  });

  it('tolerates missing index metadata without breaking telemetry consumers', () => {
    const result = buildDedupeOutcomeEvent({
      indexResult: { docId: 'd4' },
      url: '',
      host: '',
    });
    assert.equal(result.dedupe_outcome, 'unknown');
    assert.equal(result.doc_id, 'd4');
    assert.equal(result.chunks_indexed, 0);
    assert.equal(result.facts_indexed, 0);
    assert.equal(result.snippet_count, 0);
    assert.equal(buildDedupeOutcomeEvent({ indexResult: null, url: '', host: '' }), null);
  });
});
