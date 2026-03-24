import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  cleanupTempRoot,
  createMockRes,
  createRunFixture,
  createRuntimeOpsHandler,
  createRuntimeOpsRoot,
  parseResBody,
} from './helpers/runtimeOpsRoutesHarness.js';

test('runtimeOpsRoutes: prefetch hydrates missing field_rule_gate_counts from field rules payload', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-prefetch-gates-');
  const helperRoot = path.join(tempRoot, 'category_authority');
  const runId = 'run-ops-prefetch-gates';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z',
      status: 'completed',
    },
    events: [],
  });

  const runDir = path.join(indexLabRoot, runId);
  await fs.writeFile(
    path.join(runDir, 'search_profile.json'),
    JSON.stringify({
      query_count: 2,
      provider: 'searxng',
      query_rows: [
        { query: 'Razer Viper V3 Pro specs', hint_source: 'field_rules.search_hints' },
        { query: 'Razer Viper V3 Pro support', hint_source: 'field_rules.search_hints' },
      ],
      hint_source_counts: {
        'field_rules.search_hints': 72,
      },
    }),
    'utf8',
  );

  const generated = path.join(helperRoot, 'mouse', '_generated');
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(
    path.join(generated, 'field_rules.json'),
    JSON.stringify({
      fields: {
        connection: {
          search_hints: {
            query_terms: ['connection', 'connectivity'],
            domain_hints: ['razer.com', 'support.razer.com'],
            preferred_content_types: ['support'],
          },
        },
        dpi: {
          search_hints: {
            query_terms: ['dpi'],
            domain_hints: [],
            preferred_content_types: [],
          },
        },
      },
    }),
    'utf8',
  );

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      config: {
        runtimeOpsWorkbenchEnabled: true,
        categoryAuthorityRoot: helperRoot,
      },
      readIndexLabRunEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body?.search_profile?.field_rule_gate_counts);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.value_count, 3);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.total_value_count, 3);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.effective_value_count, 3);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.value_count, 2);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.total_value_count, 2);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.effective_value_count, 2);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.effective_value_count, 1);
    assert.ok(body?.search_profile?.field_rule_hint_counts_by_field);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.query_terms?.value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.query_terms?.total_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.query_terms?.effective_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.domain_hints?.value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.domain_hints?.total_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.domain_hints?.effective_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.preferred_content_types?.value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.preferred_content_types?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.preferred_content_types?.effective_value_count, 1);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: prefetch domain_hints expose effective vs total counts', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-prefetch-domain-ratio-');
  const helperRoot = path.join(tempRoot, 'category_authority');
  const runId = 'run-ops-prefetch-domain-ratio';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z',
      status: 'completed',
    },
    events: [],
  });

  const runDir = path.join(indexLabRoot, runId);
  await fs.writeFile(
    path.join(runDir, 'search_profile.json'),
    JSON.stringify({
      query_count: 1,
      provider: 'searxng',
      query_rows: [
        { query: 'Razer Viper V3 Pro weight', hint_source: 'field_rules.search_hints', target_fields: ['weight'] },
      ],
      hint_source_counts: {
        'field_rules.search_hints': 1,
      },
    }),
    'utf8',
  );

  const generated = path.join(helperRoot, 'mouse', '_generated');
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(
    path.join(generated, 'field_rules.json'),
    JSON.stringify({
      fields: {
        weight: {
          search_hints: {
            query_terms: ['weight'],
            domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
            preferred_content_types: ['spec'],
          },
        },
      },
    }),
    'utf8',
  );

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      config: {
        runtimeOpsWorkbenchEnabled: true,
        categoryAuthorityRoot: helperRoot,
      },
      readIndexLabRunEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.value_count, 0);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.total_value_count, 4);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.effective_value_count, 0);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.domain_hints?.value_count, 0);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.domain_hints?.total_value_count, 4);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.domain_hints?.effective_value_count, 0);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.effective_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.effective_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.query_terms?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.query_terms?.effective_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.preferred_content_types?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.preferred_content_types?.effective_value_count, 1);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});
