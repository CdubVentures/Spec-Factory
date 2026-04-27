import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../../db/specDb.js';
import { writeConsolidatedOverrides } from '../../../../shared/consolidatedOverrides.js';
import { rebuildReviewOverridesFromJson } from '../reviewOverrideReseed.js';

async function createHarness(t, { category = 'mouse' } = {}) {
  const helperRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-review-override-reseed-'));
  const specDb = new SpecDb({ dbPath: ':memory:', category });
  t.after(async () => {
    specDb.close();
    await fs.rm(helperRoot, { recursive: true, force: true });
  });
  return {
    category,
    config: { categoryAuthorityRoot: helperRoot },
    helperRoot,
    specDb,
  };
}

async function writeOverrideEnvelope({ config, category, products }) {
  await writeConsolidatedOverrides({
    config,
    category,
    envelope: {
      version: 2,
      category,
      products,
    },
  });
}

test('rebuildReviewOverridesFromJson reseeds resolved manual override rows from consolidated JSON', async (t) => {
  const { config, category, helperRoot, specDb } = await createHarness(t);
  const productId = 'mouse-review-reseed-manual';
  await writeOverrideEnvelope({
    config,
    category,
    products: {
      [productId]: {
        category,
        product_id: productId,
        review_status: 'approved',
        reviewed_by: 'reviewer_1',
        reviewed_at: '2026-01-02T03:04:05.000Z',
        review_time_seconds: 17,
        runtime_gate: { applied: true, failure_count: 0, warning_count: 1 },
        overrides: {
          weight: {
            field: 'weight',
            override_source: 'manual_entry',
            candidate_id: 'manual-review-reseed-1',
            override_value: '59',
            override_reason: 'verified_spec',
            override_provenance: {
              url: 'https://example.test/mouse',
              source_id: 'src_manual_1',
              retrieved_at: '2026-01-02T03:00:00.000Z',
              snippet_id: 'snp_manual_1',
              snippet_hash: 'hash_manual_1',
              quote_span: [10, 20],
              quote: 'Weight is 59 g',
            },
            overridden_by: 'reviewer_1',
            overridden_at: '2026-01-02T03:01:00.000Z',
            value: '59',
          },
        },
      },
    },
  });

  const stats = await rebuildReviewOverridesFromJson({ specDb, helperRoot });

  assert.equal(stats.found, 1);
  assert.equal(stats.seeded, 1);
  assert.equal(stats.overrides_seeded, 1);
  const row = specDb.getFieldCandidateBySourceId(productId, 'weight', 'manual-review-reseed-1');
  assert.ok(row);
  assert.equal(row.status, 'resolved');
  assert.equal(row.source_type, 'manual_override');
  assert.equal(row.value, '59');
  assert.equal(row.confidence, 1);
  assert.equal(row.metadata_json.source, 'manual_override');
  assert.equal(row.metadata_json.review_status, 'approved');
  assert.equal(row.metadata_json.reviewed_by, 'reviewer_1');
  assert.equal(row.metadata_json.runtime_gate.applied, true);
  assert.equal(row.metadata_json.evidence.snippet_id, 'snp_manual_1');
});

test('rebuildReviewOverridesFromJson reseeds candidate-selection override rows and demotes prior resolved values', async (t) => {
  const { config, category, helperRoot, specDb } = await createHarness(t);
  const productId = 'mouse-review-reseed-candidate';
  specDb.insertFieldCandidate({
    productId,
    fieldKey: 'weight',
    sourceId: 'cef-old-weight',
    sourceType: 'cef',
    value: '58',
    confidence: 0.92,
    model: 'model-a',
    validationJson: { valid: true, repairs: [], rejections: [] },
    metadataJson: {},
    status: 'resolved',
  });
  await writeOverrideEnvelope({
    config,
    category,
    products: {
      [productId]: {
        category,
        product_id: productId,
        review_status: 'in_progress',
        overrides: {
          weight: {
            field: 'weight',
            override_source: 'candidate_selection',
            candidate_id: 'cand_weight_1',
            override_value: '59',
            override_reason: 'bulk_green_approve',
            override_provenance: {
              url: 'https://example.test/mouse',
              retrieved_at: '2026-01-02T03:00:00.000Z',
              snippet_id: 'snp_weight_1',
              quote: 'Weight is 59 g',
            },
            overridden_by: 'reviewer_2',
            overridden_at: '2026-01-02T03:01:00.000Z',
            value: '59',
          },
        },
      },
    },
  });

  const stats = await rebuildReviewOverridesFromJson({ specDb, helperRoot });

  assert.equal(stats.overrides_seeded, 1);
  const oldRow = specDb.getFieldCandidateBySourceId(productId, 'weight', 'cef-old-weight');
  assert.equal(oldRow.status, 'candidate');
  const sourceId = 'candidate_override:mouse-review-reseed-candidate:weight:cand_weight_1';
  const row = specDb.getFieldCandidateBySourceId(productId, 'weight', sourceId);
  assert.ok(row);
  assert.equal(row.status, 'resolved');
  assert.equal(row.source_type, 'candidate_override');
  assert.equal(row.value, '59');
  assert.equal(row.metadata_json.source, 'candidate_override');
  assert.equal(row.metadata_json.override_source, 'candidate_selection');
  assert.equal(row.metadata_json.candidate_id, 'cand_weight_1');
  assert.equal(row.metadata_json.reviewer, 'reviewer_2');
});

test('rebuildReviewOverridesFromJson is idempotent for durable override source ids', async (t) => {
  const { config, category, helperRoot, specDb } = await createHarness(t);
  const productId = 'mouse-review-reseed-idempotent';
  await writeOverrideEnvelope({
    config,
    category,
    products: {
      [productId]: {
        category,
        product_id: productId,
        review_status: 'in_progress',
        overrides: {
          weight: {
            field: 'weight',
            override_source: 'manual_entry',
            candidate_id: 'manual-review-reseed-idempotent',
            override_value: '60',
            override_provenance: {
              url: 'https://example.test/mouse',
              quote: 'Weight is 60 g',
            },
            value: '60',
          },
        },
      },
    },
  });

  await rebuildReviewOverridesFromJson({ specDb, helperRoot });
  await rebuildReviewOverridesFromJson({ specDb, helperRoot });

  assert.equal(specDb.countFieldCandidatesBySourceId(productId, 'manual-review-reseed-idempotent'), 1);
});
