import test from 'node:test';
import assert from 'node:assert/strict';
import { updateCategoryBrain, buildLearningReport, loadCategoryBrain } from '../categoryBrain.js';
import { SpecDb } from '../../../../db/specDb.js';

function makeSpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeStorage() {
  const map = new Map();
  return {
    resolveOutputKey(...parts) {
      return ['specs/outputs', ...parts].join('/');
    },
    async readJsonOrNull(key) {
      const row = map.get(key);
      return row ? JSON.parse(row.toString('utf8')) : null;
    },
    async writeObject(key, body) {
      map.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
    },
  };
}

test('updateCategoryBrain persists artifacts to SQL and buildLearningReport reads them back', async () => {
  const specDb = makeSpecDb();
  const storage = makeStorage();
  const config = {
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
  };

  await updateCategoryBrain({
    storage,
    config,
    category: 'mouse',
    job: {
      productId: 'mouse-logitech-g-pro-x-superlight-2-wireless',
      category: 'mouse',
      identityLock: {
        brand: 'Logitech',
        model: 'G Pro X Superlight 2',
        variant: 'Wireless',
      },
      requirements: {
        llmTargetFields: ['weight', 'polling_rate'],
      },
    },
    normalized: {
      identity: {
        brand: 'Logitech',
        model: 'G Pro X Superlight 2',
        variant: 'Wireless',
        sku: '12345',
      },
      fields: {
        weight: '60 g',
        polling_rate: '4000',
        battery_hours: '95',
      },
    },
    summary: {
      validated: true,
      identity_gate_validated: true,
      confidence: 0.91,
      completeness_required: 0.88,
      sources_identity_matched: 3,
      missing_required_fields: ['sensor'],
      critical_fields_below_pass_target: ['sensor'],
    },
    provenance: {
      weight: {
        value: '60 g',
        evidence: [
          {
            url: 'https://www.logitechg.com/specs',
            host: 'www.logitechg.com',
            rootDomain: 'logitechg.com',
            method: 'dom',
            keyPath: 'html.table.weight',
          },
        ],
      },
    },
    sourceResults: [
      {
        url: 'https://www.logitechg.com/specs',
        finalUrl: 'https://www.logitechg.com/specs',
        host: 'www.logitechg.com',
        rootDomain: 'logitechg.com',
        fieldCandidates: [{ field: 'weight', value: '60 g' }],
        fingerprint: { id: 'nextjs-v1' },
      },
    ],
    discoveryResult: {
      queries: ['Logitech G Pro X Superlight 2 weight specification'],
      candidates: [{ provider: 'google', url: 'https://www.logitechg.com/specs' }],
    },
    runId: '20260210-aaaaaa',
    specDb,
  });

  const report = await buildLearningReport({
    storage,
    category: 'mouse',
    specDb,
  });

  assert.equal(report.stats.runs_total, 1);
  assert.equal(report.stats.validated_runs, 1);
  assert.equal(report.field_count_lexicon > 0, true);
  assert.equal(report.yield_domain_count > 0, true);
  assert.equal(report.brand_grammar_count > 0, true);
  assert.equal(report.query_template_count > 0, true);
});

test('loadCategoryBrain returns factory defaults when no specDb', async () => {
  const storage = makeStorage();
  const result = await loadCategoryBrain({ storage, category: 'mouse', specDb: null });

  assert.equal(result.category, 'mouse');
  assert.ok(result.artifacts.lexicon.value, 'lexicon should have default value');
  assert.ok(result.artifacts.stats.value, 'stats should have default value');
  assert.equal(result.artifacts.stats.value.runs_total, 0);
});

test('loadCategoryBrain returns SQL data when specDb has artifacts', async () => {
  const specDb = makeSpecDb();
  const storage = makeStorage();

  specDb.upsertCategoryBrainArtifact('mouse', 'stats', { runs_total: 5, validated_runs: 3 });

  const result = await loadCategoryBrain({ storage, category: 'mouse', specDb });

  assert.equal(result.artifacts.stats.value.runs_total, 5);
  assert.equal(result.artifacts.stats.value.validated_runs, 3);
  // Other artifacts should have defaults
  assert.equal(result.artifacts.lexicon.value.fields !== undefined, true);
});
