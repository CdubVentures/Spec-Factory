import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { phaseFromMethod, PHASE_IDS } from '../src/indexlab/indexingSchemaPackets.js';
import { buildWorkerDetail } from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

function makeSourceProcessedEvent(workerId, url, candidates = [], ts = '2026-01-01T00:00:00Z') {
  return {
    event: 'source_processed',
    ts,
    payload: {
      worker_id: workerId,
      url,
      candidates,
    },
  };
}

function makeCandidate(field, value, confidence, method) {
  return { field, value, confidence, method };
}

function makeFetchStartedEvent(workerId, url, ts = '2026-01-01T00:00:00Z') {
  return {
    event: 'fetch_started',
    ts,
    payload: { worker_id: workerId, url, scope: 'url' },
  };
}

describe('phaseFromMethod export', () => {
  it('is exported and callable', () => {
    assert.equal(typeof phaseFromMethod, 'function');
  });

  it('maps html_spec_table to phase_04', () => {
    assert.equal(phaseFromMethod('html_spec_table'), 'phase_04_html_spec_table');
  });

  it('maps json_ld to phase_05', () => {
    assert.equal(phaseFromMethod('json_ld'), 'phase_05_embedded_json');
  });
});

describe('PHASE_IDS export', () => {
  it('is exported and has 10 entries', () => {
    assert.equal(Array.isArray(PHASE_IDS), true);
    assert.equal(PHASE_IDS.length, 10);
  });

  it('starts with phase_01 and ends with phase_10', () => {
    assert.equal(PHASE_IDS[0], 'phase_01_static_html');
    assert.equal(PHASE_IDS[9], 'phase_10_office_mixed_doc');
  });
});

describe('buildWorkerDetail phase_lineage', () => {
  const WID = 'fetch-w1';

  it('returns phase_lineage with all 10 phases + cross-cutting when no events', () => {
    const result = buildWorkerDetail([], WID);
    assert.ok(result.phase_lineage, 'phase_lineage should exist');
    assert.ok(Array.isArray(result.phase_lineage.phases), 'phases should be an array');
    // 10 parsing phases + 1 cross-cutting group
    assert.equal(result.phase_lineage.phases.length, 11);
    for (const p of result.phase_lineage.phases) {
      assert.equal(p.doc_count, 0);
      assert.equal(p.field_count, 0);
      assert.deepEqual(p.methods_used, []);
      assert.equal(p.confidence_avg, 0);
    }
  });

  it('increments phase_04 for html_spec_table method', () => {
    const events = [
      makeFetchStartedEvent(WID, 'https://example.com/page1'),
      makeSourceProcessedEvent(WID, 'https://example.com/page1', [
        makeCandidate('weight', '85g', 0.9, 'html_spec_table'),
      ]),
    ];
    const result = buildWorkerDetail(events, WID);
    const phase04 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_04_html_spec_table');
    assert.ok(phase04);
    assert.equal(phase04.field_count, 1);
    assert.equal(phase04.doc_count, 1);
    assert.deepEqual(phase04.methods_used, ['html_spec_table']);
    assert.equal(phase04.confidence_avg, 0.9);
  });

  it('aggregates multiple methods in same phase', () => {
    const events = [
      makeFetchStartedEvent(WID, 'https://example.com/page1'),
      makeSourceProcessedEvent(WID, 'https://example.com/page1', [
        makeCandidate('weight', '85g', 0.8, 'html_spec_table'),
        makeCandidate('sensor', 'PAW3950', 0.6, 'html_table'),
      ]),
    ];
    const result = buildWorkerDetail(events, WID);
    const phase04 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_04_html_spec_table');
    assert.ok(phase04);
    assert.equal(phase04.field_count, 2);
    assert.deepEqual(phase04.methods_used.sort(), ['html_spec_table', 'html_table']);
    assert.equal(phase04.confidence_avg, 0.7);
  });

  it('deduplicates doc_count by source_url', () => {
    const events = [
      makeFetchStartedEvent(WID, 'https://example.com/page1'),
      makeSourceProcessedEvent(WID, 'https://example.com/page1', [
        makeCandidate('weight', '85g', 0.9, 'html_spec_table'),
        makeCandidate('sensor', 'PAW3950', 0.8, 'html_spec_table'),
      ]),
    ];
    const result = buildWorkerDetail(events, WID);
    const phase04 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_04_html_spec_table');
    assert.ok(phase04);
    assert.equal(phase04.doc_count, 1, 'same URL should count as 1 doc');
    assert.equal(phase04.field_count, 2);
  });

  it('handles cross-cutting methods in own group', () => {
    const events = [
      makeFetchStartedEvent(WID, 'https://example.com/page1'),
      makeSourceProcessedEvent(WID, 'https://example.com/page1', [
        makeCandidate('weight', '85g', 0.95, 'llm_extract'),
        makeCandidate('sensor', 'PAW3950', 0.85, 'consensus_policy_reducer'),
      ]),
    ];
    const result = buildWorkerDetail(events, WID);
    const crossCutting = result.phase_lineage.phases.find((p) => p.phase_id === 'cross_cutting');
    assert.ok(crossCutting, 'cross_cutting group should exist');
    assert.equal(crossCutting.field_count, 2);
    assert.deepEqual(crossCutting.methods_used.sort(), ['consensus_policy_reducer', 'llm_extract']);
    assert.equal(crossCutting.confidence_avg, 0.9);
  });

  it('all 10 phases always present even when only one has data', () => {
    const events = [
      makeFetchStartedEvent(WID, 'https://example.com/page1'),
      makeSourceProcessedEvent(WID, 'https://example.com/page1', [
        makeCandidate('weight', '85g', 0.9, 'json_ld'),
      ]),
    ];
    const result = buildWorkerDetail(events, WID);
    const phaseIds = result.phase_lineage.phases.map((p) => p.phase_id);
    for (const id of PHASE_IDS) {
      assert.ok(phaseIds.includes(id), `${id} should be present`);
    }
    assert.ok(phaseIds.includes('cross_cutting'), 'cross_cutting should be present');
  });

  it('computes correct confidence_avg across fields', () => {
    const events = [
      makeFetchStartedEvent(WID, 'https://a.com'),
      makeFetchStartedEvent(WID, 'https://b.com'),
      makeSourceProcessedEvent(WID, 'https://a.com', [
        makeCandidate('f1', 'v1', 0.8, 'json_ld'),
      ]),
      makeSourceProcessedEvent(WID, 'https://b.com', [
        makeCandidate('f2', 'v2', 0.4, 'embedded_state'),
      ]),
    ];
    const result = buildWorkerDetail(events, WID);
    const phase05 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_05_embedded_json');
    assert.ok(phase05);
    assert.equal(phase05.field_count, 2);
    assert.equal(phase05.doc_count, 2);
    assert.equal(phase05.confidence_avg, 0.6);
  });

  it('backfills phase_lineage from parse telemetry when inline candidates are absent', () => {
    const url = 'https://support.example.com/specs/mouse-pro';
    const events = [
      makeFetchStartedEvent(WID, url),
      {
        event: 'parse_finished',
        ts: '2026-01-01T00:00:03Z',
        payload: {
          worker_id: WID,
          url,
          article_extraction_method: 'readability',
          article_char_count: 1932,
          static_dom_mode: 'cheerio',
          static_dom_accepted_field_candidates: 8,
          structured_json_ld_count: 1,
        },
      },
    ];

    const result = buildWorkerDetail(events, WID);
    const phase01 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_01_static_html');
    const phase03 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_03_main_article');
    const phase05 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_05_embedded_json');

    assert.ok(phase01);
    assert.equal(phase01.doc_count, 1);
    assert.equal(phase01.field_count, 8);
    assert.deepEqual(phase01.methods_used, ['static_dom']);

    assert.ok(phase03);
    assert.equal(phase03.doc_count, 1);
    assert.equal(phase03.field_count, 0);
    assert.deepEqual(phase03.methods_used, ['readability']);

    assert.ok(phase05);
    assert.equal(phase05.doc_count, 1);
    assert.equal(phase05.field_count, 1);
    assert.deepEqual(phase05.methods_used, ['json_ld']);
  });

  it('merges parse telemetry with cross-cutting extraction fields instead of hiding used parser phases', () => {
    const url = 'https://support.example.com/specs/mouse-pro';
    const events = [
      makeFetchStartedEvent(WID, url),
      makeSourceProcessedEvent(WID, url, [
        makeCandidate('switch', 'LIGHTFORCE Hybrid Switches', 0, 'llm_extract'),
      ], '2026-01-01T00:00:02Z'),
      {
        event: 'parse_finished',
        ts: '2026-01-01T00:00:03Z',
        payload: {
          worker_id: WID,
          url,
          article_extraction_method: 'readability',
          article_char_count: 1932,
          static_dom_mode: 'cheerio',
          static_dom_accepted_field_candidates: 0,
          static_dom_rejected_field_candidates: 8,
          structured_json_ld_count: 0,
        },
      },
    ];

    const result = buildWorkerDetail(events, WID);
    const phase01 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_01_static_html');
    const phase03 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_03_main_article');
    const crossCutting = result.phase_lineage.phases.find((p) => p.phase_id === 'cross_cutting');

    assert.ok(phase01);
    assert.equal(phase01.doc_count, 1);
    assert.equal(phase01.field_count, 0);
    assert.deepEqual(phase01.methods_used, ['static_dom']);

    assert.ok(phase03);
    assert.equal(phase03.doc_count, 1);
    assert.equal(phase03.field_count, 0);
    assert.deepEqual(phase03.methods_used, ['readability']);

    assert.ok(crossCutting);
    assert.equal(crossCutting.doc_count, 1);
    assert.equal(crossCutting.field_count, 1);
    assert.deepEqual(crossCutting.methods_used, ['llm_extract']);
  });

  it('merges runtime telemetry parser phases even when source packets exist for the same worker URL', () => {
    const url = 'https://support.example.com/specs/mouse-pro';
    const events = [
      makeFetchStartedEvent(WID, url),
      {
        event: 'parse_finished',
        ts: '2026-01-01T00:00:03Z',
        payload: {
          worker_id: WID,
          url,
          article_extraction_method: 'readability',
          article_char_count: 1932,
        },
      },
    ];

    const sourceIndexingPacketCollection = {
      packets: [
        {
          canonical_url: url,
          source_key: url,
          source_metadata: { source_url: url },
          parser_execution: {
            phase_lineage: {
              phase_01_static_html: false,
              phase_02_dynamic_js: false,
              phase_03_main_article: false,
              phase_04_html_spec_table: false,
              phase_05_embedded_json: true,
              phase_06_text_pdf: false,
              phase_07_scanned_pdf_ocr: false,
              phase_08_image_ocr: false,
              phase_09_chart_graph: false,
              phase_10_office_mixed_doc: false,
            },
            phase_stats: {
              phase_05_embedded_json: {
                executed: true,
                assertion_count: 1,
                evidence_count: 1,
              },
            },
          },
          field_key_map: {
            polling_rate: {
              contexts: [
                {
                  assertions: [
                    {
                      field_key: 'polling_rate',
                      value_raw: '8000 Hz',
                      value_normalized: '8000 Hz',
                      confidence: 0.88,
                      extraction_method: 'network_json',
                      parser_phase: 'phase_05_embedded_json',
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const result = buildWorkerDetail(events, WID, { sourceIndexingPacketCollection });
    const phase03 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_03_main_article');
    const phase05 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_05_embedded_json');

    assert.ok(phase03);
    assert.equal(phase03.doc_count, 1);
    assert.equal(phase03.field_count, 0);
    assert.deepEqual(phase03.methods_used, ['readability']);

    assert.ok(phase05);
    assert.equal(phase05.doc_count, 1);
    assert.equal(phase05.field_count, 1);
    assert.deepEqual(phase05.methods_used, ['network_json']);
  });

  it('prefers same-worker runtime telemetry over later foreign-worker events on the same URL', () => {
    const url = 'https://support.example.com/specs/mouse-pro';
    const events = [
      makeFetchStartedEvent(WID, url),
      {
        event: 'parse_finished',
        ts: '2026-01-01T00:00:03Z',
        payload: {
          worker_id: WID,
          url,
          article_extraction_method: 'readability',
          article_char_count: 1932,
        },
      },
      {
        event: 'parse_finished',
        ts: '2026-01-01T00:00:04Z',
        payload: {
          worker_id: 'fetch-other',
          url,
        },
      },
    ];

    const sourceIndexingPacketCollection = {
      packets: [
        {
          canonical_url: url,
          source_key: url,
          source_metadata: { source_url: url },
          parser_execution: {
            phase_lineage: {
              phase_01_static_html: false,
              phase_02_dynamic_js: false,
              phase_03_main_article: false,
              phase_04_html_spec_table: false,
              phase_05_embedded_json: true,
              phase_06_text_pdf: false,
              phase_07_scanned_pdf_ocr: false,
              phase_08_image_ocr: false,
              phase_09_chart_graph: false,
              phase_10_office_mixed_doc: false,
            },
            phase_stats: {
              phase_05_embedded_json: {
                executed: true,
                assertion_count: 1,
                evidence_count: 1,
              },
            },
          },
          field_key_map: {
            polling_rate: {
              contexts: [
                {
                  assertions: [
                    {
                      field_key: 'polling_rate',
                      value_raw: '8000 Hz',
                      value_normalized: '8000 Hz',
                      confidence: 0.88,
                      extraction_method: 'network_json',
                      parser_phase: 'phase_05_embedded_json',
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const result = buildWorkerDetail(events, WID, { sourceIndexingPacketCollection });
    const phase03 = result.phase_lineage.phases.find((p) => p.phase_id === 'phase_03_main_article');

    assert.ok(phase03);
    assert.equal(phase03.doc_count, 1);
    assert.equal(phase03.field_count, 0);
    assert.deepEqual(phase03.methods_used, ['readability']);
  });

  it('returns phase_lineage for search workers too (all zeros)', () => {
    const events = [
      { event: 'search_started', ts: '2026-01-01T00:00:00Z', payload: { worker_id: 'search-w1', scope: 'query', current_query: 'test' } },
    ];
    const result = buildWorkerDetail(events, 'search-w1');
    assert.ok(result.phase_lineage, 'search workers should also have phase_lineage');
    assert.equal(result.phase_lineage.phases.length, 11);
  });

  it('has phase_label for each phase', () => {
    const result = buildWorkerDetail([], WID);
    for (const p of result.phase_lineage.phases) {
      assert.ok(p.phase_label, `phase ${p.phase_id} should have a label`);
      assert.equal(typeof p.phase_label, 'string');
    }
  });
});
