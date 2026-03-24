import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkerDetail } from '../runtimeOpsDataBuilders.js';

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

test('buildWorkerDetail: returns empty arrays for unknown worker_id', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }),
  ];
  const result = buildWorkerDetail(events, 'fetch-999');
  assert.ok(result);
  assert.equal(result.worker_id, 'fetch-999');
  assert.ok(Array.isArray(result.documents));
  assert.equal(result.documents.length, 0);
  assert.ok(Array.isArray(result.extraction_fields));
  assert.equal(result.extraction_fields.length, 0);
  assert.ok(Array.isArray(result.queue_jobs));
  assert.equal(result.queue_jobs.length, 0);
});

test('buildWorkerDetail: correlates worker URLs with documents correctly', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200, bytes: 5000 }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'fetch-2' }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].url, 'https://a.com/1');
});

test('buildWorkerDetail: extraction fields collected from source_processed events', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      candidates: [
        { field: 'weight', value: '60g', confidence: 0.9 },
        { field: 'sensor', value: 'PAW3950', confidence: 0.85 },
      ]
    }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.equal(result.extraction_fields.length, 2);
  assert.equal(result.extraction_fields[0].field, 'weight');
  assert.equal(result.extraction_fields[0].value, '60g');
  assert.equal(result.extraction_fields[1].field, 'sensor');
});

test('buildWorkerDetail: source_processed backfills worker document bytes after parsing', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      status: 200,
      bytes: 436975,
      content_type: 'text/html',
      candidates: [{ field: 'weight', value: '54g', confidence: 0.9 }],
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-1');

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].status, 'parsed');
  assert.equal(result.documents[0].status_code, 200);
  assert.equal(result.documents[0].bytes, 436975);
  assert.equal(result.documents[0].content_type, 'text/html');
});

test('buildWorkerDetail: backfills parse_method on worker documents from parse and source processing telemetry', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      article_extraction_method: 'readability',
    }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      status: 200,
      bytes: 436975,
      content_type: 'text/html',
      parse_method: 'ldjson',
      candidates: [{ field: 'weight', value: '54g', confidence: 0.9 }],
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-1');

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].parse_method, 'ldjson');
});

test('buildWorkerDetail: ignores foreign worker events that reuse the same URL', () => {
  const url = 'https://a.com/shared';
  const events = [
    makeEvent('fetch_started', { url, worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', {
      url,
      worker_id: 'fetch-1',
      article_extraction_method: 'readability',
      screenshot_uri: 'screenshots/fetch-1.png',
    }, { ts: '2026-02-20T00:01:01.000Z' }),
    makeEvent('source_processed', {
      url,
      worker_id: 'fetch-2',
      candidates: [
        { field: 'weight', value: '99g', confidence: 0.7, method: 'llm_extract' },
      ],
    }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('parse_finished', {
      url,
      worker_id: 'fetch-2',
      screenshot_uri: 'screenshots/fetch-2.png',
    }, { ts: '2026-02-20T00:01:03.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-1');

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].url, url);
  assert.equal(result.documents[0].parse_method, 'readability');
  assert.equal(result.documents[0].last_event_ts, '2026-02-20T00:01:01.000Z');
  assert.deepEqual(result.extraction_fields, []);
  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].filename, 'screenshots/fetch-1.png');
});

test('buildWorkerDetail: ignores aggregate lifecycle events that do not carry a URL', () => {
  const url = 'https://a.com/shared';
  const events = [
    makeEvent('fetch_started', { url, worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('parse_finished', {
      url,
      worker_id: 'fetch-1',
      article_extraction_method: 'readability',
      screenshot_uri: 'screenshots/fetch-1.png',
    }, { ts: '2026-02-20T00:01:01.000Z' }),
    makeEvent('parse_finished', {
      reason: 'run_completed',
    }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('index_finished', {
      reason: 'run_completed',
    }, { ts: '2026-02-20T00:01:04.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-1');

  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].last_event_ts, '2026-02-20T00:01:01.000Z');
  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].filename, 'screenshots/fetch-1.png');
});

test('buildWorkerDetail: queue jobs filtered by worker host', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'job-1',
      url: 'https://razer.com/viper-alt',
      reason: '404 on primary',
      lane: 'repair_search'
    }),
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'job-2',
      url: 'https://other.com/page',
      reason: 'missing field',
      lane: 'repair_search'
    }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.equal(result.queue_jobs.length, 1);
  assert.equal(result.queue_jobs[0].id, 'job-1');
  assert.equal(result.queue_jobs[0].host, 'razer.com');
});

test('buildWorkerDetail: includes screenshots from visual_asset_captured events', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('visual_asset_captured', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
      width: 1920,
      height: 1080,
      bytes: 45000,
    }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.ok(Array.isArray(result.screenshots));
  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].url, 'https://razer.com/viper');
  assert.equal(result.screenshots[0].filename, 'screenshots/viper.webp');
});

test('buildWorkerDetail: includes screenshot proof from parse_finished when no visual asset event exists', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://rtings.com/viper', worker_id: 'fetch-29' }),
    makeEvent('parse_finished', {
      url: 'https://rtings.com/viper',
      worker_id: 'fetch-29',
      screenshot_uri: 'screenshots/rtings.jpg',
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-29');

  assert.ok(Array.isArray(result.screenshots));
  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].url, 'https://rtings.com/viper');
  assert.equal(result.screenshots[0].filename, 'screenshots/rtings.jpg');
  assert.equal(result.screenshots[0].kind, 'parse_finished');
});

test('buildWorkerDetail: hydrates screenshot metadata from resolver when payload omits dimensions and bytes', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro', worker_id: 'fetch-1' }),
    makeEvent('parse_finished', {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      worker_id: 'fetch-1',
      screenshot_uri: 'specs/outputs/mouse/viper/screenshot.jpg',
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];

  const resolvedPaths = [];
  const result = buildWorkerDetail(events, 'fetch-1', {
    resolveScreenshotMetadata: (filename) => {
      resolvedPaths.push(filename);
      return {
        width: 1920,
        height: 1080,
        bytes: 93558,
      };
    },
  });

  assert.deepEqual(resolvedPaths, ['specs/outputs/mouse/viper/screenshot.jpg']);
  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].width, 1920);
  assert.equal(result.screenshots[0].height, 1080);
  assert.equal(result.screenshots[0].bytes, 93558);
});

test('buildWorkerDetail: source indexing packets backfill extraction, screenshots, and phase lineage when runtime events are thin', () => {
  const url = 'https://support.example.com/specs/mouse-pro';
  const events = [
    makeEvent('fetch_started', { url, worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url,
      worker_id: 'fetch-1',
      status: 200,
      bytes: 4096,
      content_type: 'text/html',
    }, { ts: '2026-02-20T00:01:05.000Z' }),
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
            phase_04_html_spec_table: true,
            phase_05_embedded_json: true,
            phase_06_text_pdf: false,
            phase_07_scanned_pdf_ocr: false,
            phase_08_image_ocr: false,
            phase_09_chart_graph: false,
            phase_10_office_mixed_doc: false,
          },
          phase_stats: {
            phase_04_html_spec_table: {
              executed: true,
              assertion_count: 2,
              evidence_count: 2,
            },
            phase_05_embedded_json: {
              executed: true,
              assertion_count: 1,
              evidence_count: 1,
            },
          },
        },
        artifact_index: {
          shot_1: {
            artifact_kind: 'screenshot',
            local_path: 'specs/outputs/mouse/run-001/raw/screenshots/spec.png',
          },
        },
        field_key_map: {
          weight: {
            contexts: [
              {
                assertions: [
                  {
                    field_key: 'weight',
                    value_raw: '60g',
                    value_normalized: '60g',
                    confidence: 0.94,
                    extraction_method: 'spec_table_match',
                    parser_phase: 'phase_04_html_spec_table',
                  },
                ],
              },
            ],
          },
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

  const result = buildWorkerDetail(events, 'fetch-1', {
    sourceIndexingPacketCollection,
    resolveScreenshotMetadata: () => ({
      width: 1440,
      height: 900,
      bytes: 81234,
    }),
  });

  assert.equal(result.extraction_fields.length, 2);
  assert.deepEqual(result.extraction_fields.map((row) => row.field).sort(), ['polling_rate', 'weight']);
  assert.equal(result.extraction_fields.find((row) => row.field === 'weight')?.method, 'spec_table_match');
  assert.equal(result.extraction_fields.find((row) => row.field === 'polling_rate')?.method, 'network_json');

  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].filename, 'specs/outputs/mouse/run-001/raw/screenshots/spec.png');
  assert.equal(result.screenshots[0].width, 1440);
  assert.equal(result.screenshots[0].height, 900);
  assert.equal(result.screenshots[0].bytes, 81234);

  const phase04 = result.phase_lineage.phases.find((row) => row.phase_id === 'phase_04_html_spec_table');
  const phase05 = result.phase_lineage.phases.find((row) => row.phase_id === 'phase_05_embedded_json');
  assert.equal(phase04?.doc_count, 1);
  assert.equal(phase04?.field_count, 2);
  assert.deepEqual(phase04?.methods_used, ['spec_table_match']);
  assert.equal(phase05?.doc_count, 1);
  assert.equal(phase05?.field_count, 1);
  assert.deepEqual(phase05?.methods_used, ['network_json']);
});

test('buildWorkerDetail: exposes indexed field names when packets and inline candidates are still missing', () => {
  const url = 'https://support.example.com/specs/mouse-pro';
  const events = [
    makeEvent('fetch_started', { url, worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url,
      worker_id: 'fetch-1',
      status: 200,
      bytes: 4096,
      content_type: 'text/html',
      candidate_count: 111,
      article_extraction_method: 'readability',
      static_dom_mode: 'cheerio',
      static_dom_accepted_field_candidates: 8,
    }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('index_finished', {
      url,
      worker_id: 'fetch-1',
      count: 3,
      filled_fields: ['weight', 'sensor', 'polling_rate'],
    }, { ts: '2026-02-20T00:01:06.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-1');

  assert.deepEqual(result.extraction_fields, []);
  assert.deepEqual(result.indexed_field_names, ['polling_rate', 'sensor', 'weight']);
});

test('buildWorkerDetail: exposes only missing indexed field names when some extraction packets are already materialized', () => {
  const url = 'https://support.example.com/specs/mouse-pro';
  const events = [
    makeEvent('fetch_started', { url, worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url,
      worker_id: 'fetch-1',
      candidates: [
        { field: 'weight', value: '60g', confidence: 0.91, method: 'llm_extract' },
      ],
    }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('index_finished', {
      url,
      worker_id: 'fetch-1',
      count: 3,
      filled_fields: ['weight', 'sensor', 'polling_rate'],
    }, { ts: '2026-02-20T00:01:06.000Z' }),
  ];

  const result = buildWorkerDetail(events, 'fetch-1');

  assert.deepEqual(result.extraction_fields.map((row) => row.field), ['weight']);
  assert.deepEqual(result.indexed_field_names, ['polling_rate', 'sensor']);
});

test('buildWorkerDetail: multiple workers each produce their own screenshots', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('visual_asset_captured', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
      width: 1920,
      height: 1080,
      bytes: 45000,
    }),
    makeEvent('fetch_started', { url: 'https://rtings.com/viper', worker_id: 'fetch-2' }),
    makeEvent('visual_asset_captured', {
      url: 'https://rtings.com/viper',
      worker_id: 'fetch-2',
      screenshot_uri: 'screenshots/rtings.webp',
      width: 1440,
      height: 900,
      bytes: 32000,
    }),
  ];

  const r1 = buildWorkerDetail(events, 'fetch-1');
  assert.equal(r1.screenshots.length, 1);
  assert.equal(r1.screenshots[0].filename, 'screenshots/viper.webp');

  const r2 = buildWorkerDetail(events, 'fetch-2');
  assert.equal(r2.screenshots.length, 1);
  assert.equal(r2.screenshots[0].filename, 'screenshots/rtings.webp');
});
