import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  makeStorage,
  createCategoryFixture,
  seedLatest,
  seedApprovedOverride,
  writeJson,
  writeText,
  runAccuracyBenchmarkReport,
  buildAccuracyTrend,
  buildSourceHealth,
  buildLlmMetrics,
} from './helpers/publishingPipelineHarness.js';

test('monitoring helpers produce trend, source health, and llm metrics', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase9-monitoring-'));
  const storage = makeStorage(tempRoot);
  const helperRoot = path.join(tempRoot, 'category_authority');
  const category = 'mouse';
  const productId = 'mouse-monitoring-case';

  try {
    await createCategoryFixture(helperRoot, category);
    await seedLatest(storage, category, productId);
    await seedApprovedOverride(helperRoot, category, productId, '58');

    const benchmark = await runAccuracyBenchmarkReport({
      storage,
      config: {
        categoryAuthorityRoot: helperRoot,
        goldenRoot: path.join(tempRoot, 'golden')
      },
      category,
      period: 'weekly',
      maxCases: 0
    });
    assert.equal(benchmark.report_type, 'accuracy');

    await writeJson(
      path.join(tempRoot, 'out', 'output', category, 'reports', 'accuracy_2026-02-10.json'),
      {
        report_type: 'accuracy',
        category,
        generated_at: '2026-02-10T00:00:00.000Z',
        period: 'weekly',
        by_field: {
          weight: { accuracy: 0.97 }
        }
      }
    );
    await writeJson(
      path.join(tempRoot, 'out', 'output', category, 'reports', 'accuracy_2026-02-12.json'),
      {
        report_type: 'accuracy',
        category,
        generated_at: '2026-02-12T00:00:00.000Z',
        period: 'weekly',
        by_field: {
          weight: { accuracy: 0.91 }
        }
      }
    );

    const trend = await buildAccuracyTrend({
      storage,
      category,
      field: 'weight',
      periodDays: 90
    });
    assert.equal(trend.points.length >= 2, true);
    assert.equal(Number.isFinite(trend.delta), true);

    const recentTs = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recentTs2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600_000).toISOString();
    const recentTs3 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 7200_000).toISOString();
    await writeText(
      path.join(tempRoot, 'out', 'specs', 'outputs', 'final', category, productId, 'evidence', 'sources.jsonl'),
      [
        JSON.stringify({ ts: recentTs, host: 'manufacturer.example', status: 200 }),
        JSON.stringify({ ts: recentTs2, host: 'manufacturer.example', status: 403 }),
        JSON.stringify({ ts: recentTs3, host: 'review.example', status: 200 })
      ].join('\n') + '\n'
    );

    const sourceHealth = await buildSourceHealth({
      storage,
      category,
      periodDays: 30
    });
    assert.equal(sourceHealth.total_sources >= 2, true);
    assert.equal(sourceHealth.sources.some((row) => row.host === 'manufacturer.example'), true);

    const recentBilling1 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const recentBilling2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30_000).toISOString();
    const recentBilling3 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3600_000).toISOString();
    await writeText(
      path.join(tempRoot, 'out', '_billing', 'ledger.jsonl'),
      [
        JSON.stringify({ ts: recentBilling1, provider: 'deepseek', model: 'deepseek-chat', productId: productId, runId: 'run-001', cost_usd: 0.05, prompt_tokens: 1000, completion_tokens: 200, reason: 'extract' }),
        JSON.stringify({ ts: recentBilling2, provider: 'deepseek', model: 'deepseek-reasoner', productId: productId, runId: 'run-001', cost_usd: 0.02, prompt_tokens: 500, completion_tokens: 120, reason: 'verify' }),
        JSON.stringify({ ts: recentBilling3, provider: 'deepseek', model: 'deepseek-reasoner', productId: productId, cost_usd: 0.08, prompt_tokens: 1200, completion_tokens: 300, reason: 'verify' })
      ].join('\n') + '\n'
    );

    const llmMetrics = await buildLlmMetrics({
      storage,
      period: 'month'
    });
    assert.equal(llmMetrics.total_calls, 3);
    assert.equal(llmMetrics.total_cost_usd > 0, true);
    assert.equal(llmMetrics.by_model.some((row) => row.model === 'deepseek-chat'), true);
    assert.equal(Array.isArray(llmMetrics.by_run), true);
    const runRow = llmMetrics.by_run.find((row) => row.run_id === 'run-001');
    assert.ok(runRow);
    assert.equal(runRow.calls, 2);
    assert.equal(runRow.cost_usd, 0.07);
    assert.equal(runRow.is_session_fallback, false);
    assert.equal(llmMetrics.by_run.some((row) => row.is_session_fallback), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// ===========================================================================
// checkPublishBlockers — block_publish_when_unk gate tests (Window 3 TDD)
// ===========================================================================

async function createBlockerFixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'publish-blocker-'));
  const helperRoot = path.join(root, 'category_authority');
  const generatedRoot = path.join(helperRoot, 'mouse', '_generated');

  await writeJson(path.join(generatedRoot, 'field_rules.json'), {
    category: 'mouse',
    fields: {
      weight: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar', unit: 'g', range: { min: 20, max: 120 } },
        priority: {
          block_publish_when_unk: true,
          publish_gate: true,
          publish_gate_reason: 'missing_required'
        }
      },
      dpi: {
        required_level: 'required',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'number', shape: 'scalar' },
        priority: {
          block_publish_when_unk: true,
          publish_gate: true,
          publish_gate_reason: 'missing_required'
        }
      },
      sensor: {
        required_level: 'expected',
        availability: 'expected',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' },
        priority: {
          block_publish_when_unk: false,
          publish_gate: false
        }
      },
      coating: {
        required_level: 'optional',
        availability: 'sometimes',
        difficulty: 'easy',
        contract: { type: 'string', shape: 'scalar' }
        // No priority sub-object — block_publish_when_unk is undefined
      }
    }
  });

  await writeJson(path.join(generatedRoot, 'known_values.json'), {
    category: 'mouse',
    enums: {}
  });

  await writeJson(path.join(generatedRoot, 'parse_templates.json'), {
    category: 'mouse',
    templates: {}
  });

  await writeJson(path.join(generatedRoot, 'cross_validation_rules.json'), {
    category: 'mouse',
    rules: []
  });

  await writeJson(path.join(generatedRoot, 'ui_field_catalog.json'), {
    category: 'mouse',
    fields: [
      { key: 'weight', group: 'general', label: 'Weight', order: 1 },
      { key: 'dpi', group: 'sensor', label: 'DPI', order: 2 },
      { key: 'sensor', group: 'sensor', label: 'Sensor', order: 3 },
      { key: 'coating', group: 'physical', label: 'Coating', order: 4 }
    ]
  });

  return { root, helperRoot };
}

// ---------------------------------------------------------------------------
// Test 1: block_publish_when_unk=true + unk field → blocked
// ---------------------------------------------------------------------------
