import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

import {
  EVIDENCE_INDEX_SCHEMA,
  classifyDedupeOutcome,
  ftsResultsToEvidencePool,
  generateDocId,
  generateStableSnippetId,
  getChunksForDocument,
  getDocumentByHash,
  getEvidenceInventory,
  getFactsForField,
  indexDocument,
  searchEvidenceByField,
} from '../../index/evidenceIndexDb.js';
import { buildEvidenceSearchPayload } from '../evidenceSearch.js';
import { buildDedupeOutcomeEvent, dedupeOutcomeToEventKey } from '../../pipeline/dedupeOutcomeEvent.js';

function createEvidenceHarness() {
  const db = new Database(':memory:');
  db.exec(EVIDENCE_INDEX_SCHEMA);
  return {
    db,
    cleanup() {
      db.close();
    },
  };
}

function createDocument(overrides = {}) {
  return {
    contentHash: 'abc123hash',
    parserVersion: 'v2',
    url: 'https://example.com/specs',
    host: 'example.com',
    tier: 1,
    role: 'manufacturer',
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    ...overrides,
  };
}

function createChunks(count = 2, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    chunkIndex: index,
    chunkType: 'paragraph',
    text: `Chunk ${index} text content about sensor and weight`,
    normalizedText: `chunk ${index} text content about sensor and weight`,
    snippetHash: `snhash_${index}`,
    extractionMethod: 'readability',
    fieldHints: ['sensor', 'weight'],
    ...overrides,
  }));
}

function createFacts(chunkCount = 2) {
  return [
    {
      chunkIndex: 0,
      fieldKey: 'weight',
      valueRaw: '58g',
      valueNormalized: '58',
      unit: 'g',
      extractionMethod: 'readability',
      confidence: 0.95,
    },
    {
      chunkIndex: Math.min(1, chunkCount - 1),
      fieldKey: 'sensor',
      valueRaw: 'PAW3950',
      valueNormalized: 'PAW3950',
      unit: '',
      extractionMethod: 'readability',
      confidence: 0.9,
    },
  ];
}

function indexEvidence({
  db,
  document = createDocument(),
  chunks = createChunks(),
  facts = [],
} = {}) {
  return indexDocument({ db, document, chunks, facts });
}

describe('Phase 06A snippet and document identifiers', () => {
  it('generates deterministic snippet ids for the same input and unique ids for changed inputs', () => {
    const stableId = generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 0 });

    assert.equal(
      stableId,
      generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 0 }),
    );
    assert.notEqual(stableId, generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 1 }));
    assert.notEqual(stableId, generateStableSnippetId({ contentHash: 'hashB', parserVersion: 'v1', chunkIndex: 0 }));
    assert.notEqual(stableId, generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v2', chunkIndex: 0 }));
    assert.ok(stableId.startsWith('sn_'));
  });

  it('handles missing snippet id inputs without throwing', () => {
    const snippetId = generateStableSnippetId({ contentHash: null, parserVersion: '', chunkIndex: undefined });
    assert.ok(snippetId.startsWith('sn_'));
    assert.ok(snippetId.length > 4);
  });

  it('generates deterministic doc ids and keeps the doc id namespace distinct from snippets', () => {
    const docId = generateDocId({ contentHash: 'abc', parserVersion: 'v1' });

    assert.equal(docId, generateDocId({ contentHash: 'abc', parserVersion: 'v1' }));
    assert.notEqual(docId, generateDocId({ contentHash: 'hashB', parserVersion: 'v1' }));
    assert.notEqual(
      docId.replace('doc_', ''),
      generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 0 }).replace('sn_', ''),
    );
    assert.ok(docId.startsWith('doc_'));
  });
});

describe('Phase 06A dedupe classification and indexing lifecycle', () => {
  it('classifies dedupe outcomes from the observable document match state', () => {
    assert.equal(classifyDedupeOutcome({ existingDoc: null, incomingContentHash: 'abc' }), 'new');
    assert.equal(
      classifyDedupeOutcome({
        existingDoc: { content_hash: 'abc', doc_id: 'doc_123' },
        incomingContentHash: 'abc',
      }),
      'reused',
    );
    assert.equal(
      classifyDedupeOutcome({
        existingDoc: { content_hash: 'old_hash', doc_id: 'doc_123' },
        incomingContentHash: 'new_hash',
      }),
      'updated',
    );
  });

  it('indexes new evidence, reuses identical evidence, and treats changed content hashes as new documents', (t) => {
    const harness = createEvidenceHarness();
    t.after(() => harness.cleanup());

    const document = createDocument();
    const chunks = createChunks(1);

    const first = indexEvidence({ db: harness.db, document, chunks });
    const reused = indexEvidence({ db: harness.db, document, chunks });
    const changed = indexEvidence({
      db: harness.db,
      document: createDocument({ contentHash: 'different_hash_from_page_change' }),
      chunks,
    });

    assert.equal(first.dedupeOutcome, 'new');
    assert.equal(first.chunksIndexed, 1);
    assert.equal(reused.dedupeOutcome, 'reused');
    assert.equal(reused.docId, first.docId);
    assert.equal(reused.chunksIndexed, 0);
    assert.deepEqual(reused.snippetIds, []);
    assert.equal(changed.dedupeOutcome, 'new');
  });

  it('indexes valid facts and skips facts that refer to missing chunks', (t) => {
    const harness = createEvidenceHarness();
    t.after(() => harness.cleanup());

    const indexed = indexEvidence({
      db: harness.db,
      chunks: createChunks(2),
      facts: createFacts(2),
    });
    const skipped = indexEvidence({
      db: harness.db,
      document: createDocument({ contentHash: 'hash-with-bad-fact' }),
      chunks: createChunks(1),
      facts: [{ chunkIndex: 99, fieldKey: 'weight', valueRaw: '58g', confidence: 0.9 }],
    });

    assert.equal(indexed.factsIndexed, 2);
    assert.equal(skipped.factsIndexed, 0);
  });
});

describe('Phase 06A evidence lookup contracts', () => {
  it('retrieves persisted documents, chunks, and facts through the query helpers', (t) => {
    const harness = createEvidenceHarness();
    t.after(() => harness.cleanup());

    const indexResult = indexEvidence({
      db: harness.db,
      chunks: createChunks(3),
      facts: createFacts(3),
    });

    const document = getDocumentByHash({
      db: harness.db,
      contentHash: 'abc123hash',
      parserVersion: 'v2',
    });
    const chunks = getChunksForDocument({ db: harness.db, docId: indexResult.docId });
    const weightFacts = getFactsForField({
      db: harness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'weight',
    });

    assert.ok(document);
    assert.equal(document.url, 'https://example.com/specs');
    assert.equal(document.tier, 1);
    assert.equal(getDocumentByHash({ db: harness.db, contentHash: 'unknown', parserVersion: 'v1' }), null);
    assert.deepEqual(chunks.map((chunk) => chunk.chunk_index), [0, 1, 2]);
    assert.equal(weightFacts.length, 1);
    assert.equal(weightFacts[0].value_raw, '58g');
  });

  it('reports evidence inventory from persisted rows only', (t) => {
    const harness = createEvidenceHarness();
    t.after(() => harness.cleanup());

    indexEvidence({ db: harness.db, chunks: createChunks(2), facts: createFacts(2) });
    indexEvidence({
      db: harness.db,
      document: createDocument({ contentHash: 'different_hash', url: 'https://review.com/mouse' }),
      chunks: createChunks(3),
      facts: [],
    });
    indexEvidence({ db: harness.db, document: createDocument(), chunks: createChunks(1), facts: [] });

    const inventory = getEvidenceInventory({
      db: harness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
    });

    assert.equal(inventory.documentCount, 2);
    assert.equal(inventory.chunkCount, 5);
    assert.equal(inventory.factCount, 2);
    assert.equal(inventory.uniqueHashes, 2);
    assert.equal(inventory.dedupeHits, 0);

    const emptyInventory = getEvidenceInventory({
      db: harness.db,
      category: 'keyboard',
      productId: 'unknown',
    });
    assert.equal(emptyInventory.documentCount, 0);
    assert.equal(emptyInventory.chunkCount, 0);
    assert.equal(emptyInventory.factCount, 0);
  });
});

describe('Phase 06A evidence search contracts', () => {
  it('searches indexed evidence by field terms, handles misses, and applies maxResults', (t) => {
    const harness = createEvidenceHarness();
    t.after(() => harness.cleanup());

    indexEvidence({
      db: harness.db,
      chunks: [
        {
          chunkIndex: 0,
          chunkType: 'paragraph',
          text: 'The sensor is PAW3950 optical',
          normalizedText: 'sensor paw3950 optical',
          snippetHash: 'h0',
          extractionMethod: 'readability',
          fieldHints: ['sensor'],
        },
        {
          chunkIndex: 1,
          chunkType: 'paragraph',
          text: 'Weight is 58 grams lightweight',
          normalizedText: 'weight 58 grams lightweight',
          snippetHash: 'h1',
          extractionMethod: 'readability',
          fieldHints: ['weight'],
        },
      ],
    });

    const sensorResults = searchEvidenceByField({
      db: harness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'sensor',
      queryTerms: ['PAW3950'],
    });
    const missResults = searchEvidenceByField({
      db: harness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'nonexistent_field',
      queryTerms: ['zzzzzznotfound'],
    });

    const cappedHarness = createEvidenceHarness();
    t.after(() => cappedHarness.cleanup());
    indexEvidence({
      db: cappedHarness.db,
      chunks: Array.from({ length: 10 }, (_, index) => ({
        chunkIndex: index,
        chunkType: 'paragraph',
        text: `sensor data chunk ${index} PAW3950`,
        normalizedText: `sensor data chunk ${index} paw3950`,
        snippetHash: `h${index}`,
        extractionMethod: 'readability',
        fieldHints: ['sensor'],
      })),
    });
    const cappedResults = searchEvidenceByField({
      db: cappedHarness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'sensor',
      queryTerms: ['PAW3950'],
      maxResults: 3,
    });
    const shortTermResults = searchEvidenceByField({
      db: cappedHarness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: '',
      queryTerms: ['a'],
    });

    assert.ok(sensorResults.length >= 1);
    assert.match(sensorResults[0].text, /PAW3950/);
    assert.equal(missResults.length, 0);
    assert.ok(cappedResults.length <= 3);
    assert.equal(shortTermResults.length, 0);
  });

  it('maps FTS rows into the evidence pool contract', () => {
    const pool = ftsResultsToEvidencePool({
      ftsResults: [
        {
          snippet_id: 'sn_abc',
          url: 'https://example.com',
          host: 'example.com',
          tier: 1,
          role: 'manufacturer',
          extraction_method: 'readability',
          snippet_hash: 'hash1',
          content_hash: 'chash1',
          text: 'sensor PAW3950',
          normalized_text: 'sensor paw3950',
          rank: -5.2,
        },
      ],
    });

    assert.equal(pool.length, 1);
    assert.equal(pool[0].url, 'https://example.com');
    assert.equal(pool[0].tier, 1);
    assert.equal(pool[0].snippet_id, 'sn_abc');
    assert.equal(pool[0].content_hash, 'chash1');
    assert.deepEqual(pool[0].evidence_refs, ['sn_abc']);
    assert.ok(pool[0].quote.length > 0);
    assert.deepEqual(ftsResultsToEvidencePool({ ftsResults: [] }), []);

    const incompletePool = ftsResultsToEvidencePool({ ftsResults: [{ snippet_id: '', url: '' }] });
    assert.equal(incompletePool.length, 1);
    assert.equal(incompletePool[0].url, '');
    assert.equal(incompletePool[0].tier, null);
  });
});

describe('Phase 06A dedupe event contracts', () => {
  it('builds evidence search payload dedupe summaries from flat and wrapped events', () => {
    const flatResult = buildEvidenceSearchPayload({
      dedupeEvents: [
        { dedupe_outcome: 'new', chunks_indexed: 5 },
        { dedupe_outcome: 'reused', chunks_indexed: 0 },
      ],
    });
    const wrappedResult = buildEvidenceSearchPayload({
      dedupeEvents: [
        { event: 'indexed_new', payload: { dedupe_outcome: 'new', chunks_indexed: 8, scope: 'evidence_index' } },
        { event: 'dedupe_hit', payload: { dedupe_outcome: 'reused', chunks_indexed: 0, scope: 'evidence_index' } },
        { event: 'dedupe_updated', payload: { dedupe_outcome: 'updated', chunks_indexed: 3, scope: 'evidence_index' } },
      ],
    });
    const unknownResult = buildEvidenceSearchPayload({
      dedupeEvents: [
        { event: 'indexed_new', payload: { dedupe_outcome: 'unknown', chunks_indexed: 2 } },
      ],
    });

    assert.equal(flatResult.dedupe_stream.new_count, 1);
    assert.equal(flatResult.dedupe_stream.reused_count, 1);
    assert.equal(flatResult.dedupe_stream.total_chunks_indexed, 5);

    assert.equal(wrappedResult.dedupe_stream.total, 3);
    assert.equal(wrappedResult.dedupe_stream.new_count, 1);
    assert.equal(wrappedResult.dedupe_stream.reused_count, 1);
    assert.equal(wrappedResult.dedupe_stream.updated_count, 1);
    assert.equal(wrappedResult.dedupe_stream.total_chunks_indexed, 11);

    assert.equal(unknownResult.dedupe_stream.total, 1);
    assert.equal(unknownResult.dedupe_stream.new_count, 0);
    assert.equal(unknownResult.dedupe_stream.reused_count, 0);
    assert.equal(unknownResult.dedupe_stream.updated_count, 0);
  });

  it('keeps event key mapping and dedupe event payloads consistent', () => {
    const runtimeBridgeMapping = (outcome) => {
      const normalized = String(outcome || 'unknown').trim();
      return normalized === 'reused'
        ? 'dedupe_hit'
        : normalized === 'updated'
          ? 'dedupe_updated'
          : 'indexed_new';
    };

    for (const outcome of ['new', 'reused', 'updated', 'unknown', '', null]) {
      assert.equal(dedupeOutcomeToEventKey(outcome), runtimeBridgeMapping(outcome));
    }

    const event = buildDedupeOutcomeEvent({
      indexResult: {
        dedupeOutcome: 'new',
        docId: 'doc_abc',
        chunksIndexed: 5,
        factsIndexed: 2,
        snippetIds: ['sn_1', 'sn_2'],
      },
      url: 'https://example.com',
      host: 'example.com',
    });

    assert.equal(event.dedupe_outcome, 'new');
    assert.equal(event.doc_id, 'doc_abc');
    assert.equal(event.chunks_indexed, 5);
    assert.equal(event.facts_indexed, 2);
    assert.equal(event.snippet_count, 2);
    assert.equal(event.url, 'https://example.com');
    assert.equal(buildDedupeOutcomeEvent({ indexResult: null, url: '', host: '' }), null);
  });
});

describe('Phase 06A fact persistence contract', () => {
  it('stores no fact rows when no facts payload is provided and stores fact rows when facts are provided', (t) => {
    const emptyFactsHarness = createEvidenceHarness();
    t.after(() => emptyFactsHarness.cleanup());

    const noFactsResult = indexEvidence({
      db: emptyFactsHarness.db,
      chunks: createChunks(2),
      facts: [],
    });
    const emptyWeightFacts = getFactsForField({
      db: emptyFactsHarness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'weight',
    });

    const populatedHarness = createEvidenceHarness();
    t.after(() => populatedHarness.cleanup());

    const withFactsResult = indexEvidence({
      db: populatedHarness.db,
      chunks: createChunks(2),
      facts: createFacts(2),
    });
    const weightFacts = getFactsForField({
      db: populatedHarness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'weight',
    });
    const sensorFacts = getFactsForField({
      db: populatedHarness.db,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      fieldKey: 'sensor',
    });

    assert.equal(noFactsResult.factsIndexed, 0);
    assert.equal(emptyWeightFacts.length, 0);

    assert.equal(withFactsResult.factsIndexed, 2);
    assert.equal(weightFacts.length, 1);
    assert.equal(weightFacts[0].value_raw, '58g');
    assert.equal(sensorFacts.length, 1);
    assert.equal(sensorFacts[0].value_raw, 'PAW3950');
  });
});
