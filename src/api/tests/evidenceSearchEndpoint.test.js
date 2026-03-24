import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceSearchPayload } from '../evidenceSearch.js';
import {
  createDedupeEvent,
  createFtsResult,
  createInventory,
  createWrappedEvent,
} from './helpers/evidencePayloadFactories.js';

describe('buildEvidenceSearchPayload', () => {
  it('returns correct shape from inventory and dedupe events', () => {
    const result = buildEvidenceSearchPayload({
      inventory: createInventory(),
      dedupeEvents: [
        createDedupeEvent(),
        createDedupeEvent({ dedupe_outcome: 'reused', chunks_indexed: 0 }),
        createDedupeEvent({ dedupe_outcome: 'updated', chunks_indexed: 3 }),
        createDedupeEvent({ chunks_indexed: 5 }),
        createDedupeEvent({ dedupe_outcome: 'reused', chunks_indexed: 0 }),
      ],
      query: 'weight'
    });

    assert.equal(result.inventory.documents, 5);
    assert.equal(result.inventory.chunks, 42);
    assert.equal(result.inventory.facts, 10);
    assert.equal(result.inventory.unique_hashes, 4);
    assert.equal(result.inventory.dedupe_hits, 3);
    assert.equal(result.dedupe_stream.total, 5);
    assert.equal(result.dedupe_stream.new_count, 2);
    assert.equal(result.dedupe_stream.reused_count, 2);
    assert.equal(result.dedupe_stream.updated_count, 1);
    assert.equal(result.dedupe_stream.total_chunks_indexed, 16);
    assert.equal(result.query, 'weight');
  });

  it('handles null inventory', () => {
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [],
      query: ''
    });
    assert.equal(result.inventory.documents, 0);
    assert.equal(result.inventory.chunks, 0);
    assert.equal(result.dedupe_stream.total, 0);
  });

  it('handles empty dedupeEvents', () => {
    const result = buildEvidenceSearchPayload({
      inventory: createInventory({ documentCount: 2, chunkCount: 10, factCount: 0, uniqueHashes: 2, dedupeHits: 0 }),
      dedupeEvents: [],
      query: ''
    });
    assert.equal(result.dedupe_stream.total, 0);
    assert.equal(result.dedupe_stream.new_count, 0);
    assert.equal(result.inventory.documents, 2);
  });

  it('handles ftsResults when provided', () => {
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [],
      query: 'sensor',
      ftsResults: [
        createFtsResult(),
        createFtsResult({ snippet_id: 'sn_def', url: 'https://review.com', tier: 2, text: 'the sensor model is PAW3950', rank: -3.1 }),
      ]
    });
    assert.equal(result.fts_search.count, 2);
    assert.equal(result.fts_search.rows[0].snippet_id, 'sn_abc');
    assert.equal(result.fts_search.rows[0].tier, 1);
    assert.ok(result.fts_search.rows[0].text.length > 0);
  });

  it('returns empty fts_search when no ftsResults', () => {
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [],
      query: '',
      ftsResults: null
    });
    assert.equal(result.fts_search.count, 0);
    assert.deepStrictEqual(result.fts_search.rows, []);
  });

  it('handles NDJSON-wrapped dedupe events with payload envelope', () => {
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [
        createWrappedEvent('indexed_new', createDedupeEvent({ chunks_indexed: 4 })),
        createWrappedEvent('dedupe_hit', createDedupeEvent({ dedupe_outcome: 'reused', chunks_indexed: 0 })),
        createWrappedEvent('dedupe_updated', createDedupeEvent({ dedupe_outcome: 'updated', chunks_indexed: 2 })),
      ],
      query: 'weight'
    });
    assert.equal(result.dedupe_stream.total, 3);
    assert.equal(result.dedupe_stream.new_count, 1);
    assert.equal(result.dedupe_stream.reused_count, 1);
    assert.equal(result.dedupe_stream.updated_count, 1);
    assert.equal(result.dedupe_stream.total_chunks_indexed, 6);
  });

  it('handles mixed flat and wrapped dedupe events', () => {
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [
        createDedupeEvent({ chunks_indexed: 3 }),
        createWrappedEvent('dedupe_hit', createDedupeEvent({ dedupe_outcome: 'reused', chunks_indexed: 0 })),
      ],
      query: ''
    });
    assert.equal(result.dedupe_stream.total, 2);
    assert.equal(result.dedupe_stream.new_count, 1);
    assert.equal(result.dedupe_stream.reused_count, 1);
  });

  it('truncates FTS text at 500 characters', () => {
    const longText = 'x'.repeat(600);
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [],
      query: 'test',
      ftsResults: [
        createFtsResult({ snippet_id: 'sn_long', text: longText, rank: -1.0 })
      ]
    });
    assert.equal(result.fts_search.rows[0].text.length, 500);
    assert.equal(result.fts_search.rows[0].text, 'x'.repeat(500));
  });

  it('counts unknown dedupe outcomes toward total but not any category', () => {
    const result = buildEvidenceSearchPayload({
      inventory: null,
      dedupeEvents: [
        createDedupeEvent({ chunks_indexed: 2 }),
        createDedupeEvent({ dedupe_outcome: 'error', chunks_indexed: 0 }),
        createDedupeEvent({ dedupe_outcome: '', chunks_indexed: 0 }),
      ],
      query: ''
    });
    assert.equal(result.dedupe_stream.total, 3);
    assert.equal(result.dedupe_stream.new_count, 1);
    assert.equal(result.dedupe_stream.reused_count, 0);
    assert.equal(result.dedupe_stream.updated_count, 0);
    assert.equal(result.dedupe_stream.total_chunks_indexed, 2);
  });
});
