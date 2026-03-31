import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { startInProcessGuiServer } from './helpers/inProcessGuiServerHarness.js';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function seedPhase07Run(indexlabRoot) {
  const runId = 'run-phase07-001';
  const category = 'mouse';
  const productId = 'mouse-fnatic-x-lamzu-maya-x-8k';
  const runDir = path.join(indexlabRoot, runId);

  await fs.mkdir(runDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(runDir, 'run.json'), {
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-19T11:00:00.000Z',
      ended_at: '2026-02-19T11:04:00.000Z',
    }),
    writeJson(path.join(runDir, 'phase07_retrieval.json'), {
      run_id: runId,
      category,
      product_id: productId,
      generated_at: '2026-02-19T11:03:30.000Z',
      summary: {
        fields_attempted: 3,
        fields_with_hits: 2,
        fields_satisfied_min_refs: 1,
        fields_unsatisfied_min_refs: 2,
        refs_selected_total: 3,
        distinct_sources_selected: 2,
        avg_hits_per_field: 1.667,
        evidence_pool_size: 6,
      },
      fields: [
        {
          field_key: 'polling_rate',
          required_level: 'critical',
          need_score: 38.88,
          min_refs_required: 2,
          refs_selected: 2,
          min_refs_satisfied: true,
          distinct_sources_required: true,
          distinct_sources_selected: 2,
          retrieval_query: 'Fnatic x Lamzu MAYA X 8K | polling rate | hz',
          hits: [
            {
              rank: 1,
              score: 8.15,
              url: 'https://www.techpowerup.com/review/lamzu-maya/single-page.html',
              host: 'www.techpowerup.com',
              tier: 2,
              doc_kind: 'lab_review',
              snippet_id: 'w01',
              quote_preview: 'Polling Rate: 125/250/500/1000/2000/4000/8000 Hz',
              reason_badges: ['anchor_match', 'unit_match', 'tier_preferred'],
            },
          ],
          prime_sources: [
            {
              rank: 1,
              score: 8.15,
              url: 'https://www.techpowerup.com/review/lamzu-maya/single-page.html',
              host: 'www.techpowerup.com',
              tier: 2,
              doc_kind: 'lab_review',
              snippet_id: 'w01',
              quote_preview: 'Polling Rate: 125/250/500/1000/2000/4000/8000 Hz',
              reason_badges: ['anchor_match', 'unit_match', 'tier_preferred'],
            },
          ],
        },
      ],
    }),
  ]);

  return { category, productId, runId };
}

async function seedSchemaPacketsRun(indexlabRoot) {
  const runId = 'run-schema-001';
  const category = 'mouse';
  const productId = 'mouse-logitech-g-pro-x-superlight-2';
  const runDir = path.join(indexlabRoot, runId);

  await fs.mkdir(runDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(runDir, 'run.json'), {
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-20T12:10:00.000Z',
      ended_at: '2026-02-20T12:16:00.000Z',
    }),
    writeJson(path.join(runDir, 'source_indexing_extraction_packets.json'), {
      schema_version: '2026-02-20.source-indexing-extraction-packet.collection.v1',
      record_kind: 'source_indexing_extraction_packet_collection',
      run_id: runId,
      category,
      item_identifier: productId,
      generated_at: '2026-02-20T12:15:55.000Z',
      source_packet_count: 1,
      packets: [
        {
          schema_version: '2026-02-20.source-indexing-extraction-packet.v1',
          record_kind: 'source_indexing_extraction_packet',
          source_packet_id: 'sha256:source-01',
          source_id: 'src_01',
          canonical_url: 'https://example.com/product',
          source_version_id: 'sha256:source-version-01',
        },
      ],
    }),
    writeJson(path.join(runDir, 'item_indexing_extraction_packet.json'), {
      schema_version: '2026-02-20.item-indexing-extraction-packet.v1',
      record_kind: 'item_indexing_extraction_packet',
      item_packet_id: 'sha256:item-01',
      category,
      item_identifier: productId,
      generated_at: '2026-02-20T12:15:56.000Z',
      run_scope: {
        current_run_id: runId,
        included_run_ids: [runId],
      },
      source_packet_refs: [
        {
          source_packet_id: 'sha256:source-01',
          source_id: 'src_01',
          canonical_url: 'https://example.com/product',
          source_version_id: 'sha256:source-version-01',
          content_hash: 'sha256:content-01',
          run_id: runId,
        },
      ],
      field_source_index: {},
      field_key_map: {},
      coverage_summary: {
        field_count: 1,
        known_field_count: 1,
        required_coverage: '1/1',
        critical_coverage: '1/1',
      },
      indexing_projection: {
        retrieval_ready: true,
        candidate_chunk_count: 1,
        priority_field_keys: ['polling_rate'],
      },
      sql_projection: {
        item_field_state_rows: [
          {
            category,
            product_id: productId,
            field_key: 'polling_rate',
          },
        ],
        candidate_rows: [
          {
            candidate_id: 'cand_01',
            category,
            product_id: productId,
            field_key: 'polling_rate',
          },
        ],
      },
    }),
    writeJson(path.join(runDir, 'run_meta_packet.json'), {
      schema_version: '2026-02-20.run-meta-packet.v1',
      record_kind: 'run_meta_packet',
      run_packet_id: 'sha256:run-meta-01',
      run_id: runId,
      category,
      started_at: '2026-02-20T12:10:00.000Z',
      finished_at: '2026-02-20T12:16:00.000Z',
      duration_ms: 360000,
      trigger: 'manual',
      execution_summary: {
        item_total: 1,
        item_succeeded: 1,
        item_partial: 0,
        item_failed: 0,
        source_total: 1,
        source_fetched: 1,
        source_failed: 0,
        assertion_total: 1,
        evidence_total: 1,
        identity_rejected_evidence_total: 0,
      },
      phase_summary: {
        phase_01_static_html: { enabled: true, executed_sources: 1, assertion_count: 1, evidence_count: 1, error_count: 0, duration_ms: 10 },
        phase_02_dynamic_js: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_03_main_article: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_04_html_spec_table: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_05_embedded_json: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_06_text_pdf: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_07_scanned_pdf_ocr: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_08_image_ocr: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_09_chart_graph: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
        phase_10_office_mixed_doc: { enabled: true, executed_sources: 0, assertion_count: 0, evidence_count: 0, error_count: 0, duration_ms: 0 },
      },
      output_refs: {
        source_packet_refs: [{ source_packet_id: 'sha256:source-01', source_version_id: 'sha256:source-version-01', source_id: 'src_01' }],
        item_packet_refs: [{ item_packet_id: 'sha256:item-01', item_identifier: productId }],
      },
      quality_gates: {
        coverage_gate_passed: true,
        evidence_gate_passed: true,
        error_rate_gate_passed: true,
        target_match_gate_passed: true,
      },
    }),
  ]);

  return { category, productId, runId };
}

async function startGuiServer(t, { helperRoot, indexlabRoot }) {
  const server = await startInProcessGuiServer(t, {
    env: {
      LOCAL_MODE: 'true',
      HELPER_FILES_ROOT: helperRoot,
      CATEGORY_AUTHORITY_ROOT: helperRoot,
    },
    argv: ['--local', '--indexlab-root', indexlabRoot],
  });
  return {
    baseUrl: server.baseUrl,
    getStderr: () => '',
  };
}

test('indexlab payload endpoints share one gui server harness without weakening endpoint contracts', { timeout: 120_000 }, async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-run-payload-api-'));
  const indexlabRoot = path.join(tempRoot, 'indexlab');
  const helperRoot = path.join(tempRoot, 'category_authority');

  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  const [
    phase07Run,
    schemaPacketsRun,
  ] = await Promise.all([
    seedPhase07Run(indexlabRoot),
    seedSchemaPacketsRun(indexlabRoot),
  ]);
  const server = await startGuiServer(t, { helperRoot, indexlabRoot });
  if (!server) return;

  await t.test('phase07 endpoint returns tier retrieval and prime source payload', async () => {
    const response = await fetch(`${server.baseUrl}/api/v1/indexlab/run/${encodeURIComponent(phase07Run.runId)}/phase07-prime-sources`);
    assert.equal(response.status, 200, `unexpected status ${response.status} stderr=${server.getStderr()}`);
    const payload = await response.json();

    assert.equal(payload.run_id, phase07Run.runId);
    assert.equal(payload.category, phase07Run.category);
    assert.equal(payload.product_id, phase07Run.productId);
    assert.equal(Number(payload.summary?.fields_attempted || 0), 3);
    assert.equal(Number(payload.summary?.refs_selected_total || 0), 3);
    assert.equal(Array.isArray(payload.fields), true);
    assert.equal(payload.fields.length, 1);
    assert.equal(payload.fields[0].field_key, 'polling_rate');
    assert.equal(payload.fields[0].min_refs_satisfied, true);
    assert.equal(Array.isArray(payload.fields[0].prime_sources), true);
  });

  await t.test('schema packet endpoints return source item and run meta packets', async () => {
    const sourceResponse = await fetch(`${server.baseUrl}/api/v1/indexlab/run/${encodeURIComponent(schemaPacketsRun.runId)}/source-indexing-packets`);
    assert.equal(sourceResponse.status, 200, `unexpected source packets status ${sourceResponse.status} stderr=${server.getStderr()}`);
    const sourcePayload = await sourceResponse.json();
    assert.equal(sourcePayload.record_kind, 'source_indexing_extraction_packet_collection');
    assert.equal(Number(sourcePayload.source_packet_count || 0), 1);

    const itemResponse = await fetch(`${server.baseUrl}/api/v1/indexlab/run/${encodeURIComponent(schemaPacketsRun.runId)}/item-indexing-packet`);
    assert.equal(itemResponse.status, 200, `unexpected item packet status ${itemResponse.status} stderr=${server.getStderr()}`);
    const itemPayload = await itemResponse.json();
    assert.equal(itemPayload.record_kind, 'item_indexing_extraction_packet');
    assert.equal(itemPayload.item_identifier, schemaPacketsRun.productId);

    const runMetaResponse = await fetch(`${server.baseUrl}/api/v1/indexlab/run/${encodeURIComponent(schemaPacketsRun.runId)}/run-meta-packet`);
    assert.equal(runMetaResponse.status, 200, `unexpected run meta packet status ${runMetaResponse.status} stderr=${server.getStderr()}`);
    const runMetaPayload = await runMetaResponse.json();
    assert.equal(runMetaPayload.record_kind, 'run_meta_packet');
    assert.equal(runMetaPayload.run_id, schemaPacketsRun.runId);
  });
});
