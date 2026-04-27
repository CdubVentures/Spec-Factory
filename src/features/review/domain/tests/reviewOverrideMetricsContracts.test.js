import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  approveGreenOverrides,
  buildReviewMetrics,
  finalizeOverrides,
} from '../overrideWorkflow.js';
import {
  resolveConsolidatedOverridePath,
  upsertProductInConsolidated,
} from '../../../../shared/consolidatedOverrides.js';
import {
  createReviewOverrideHarness,
  seedFieldRulesArtifacts,
  seedLatestArtifacts,
  seedReviewCandidates,
  seedReviewProductPayload,
} from './helpers/reviewOverrideHarness.js';

test('buildReviewMetrics reports throughput and override ratios from finalized override docs', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-metrics',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  seedLatestArtifacts(harness);
  await seedReviewProductPayload(harness);
  await approveGreenOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    reviewer: 'reviewer_metrics',
    reason: 'bulk_green_approve',
  });
  await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: true,
  });

  const metrics = await buildReviewMetrics({
    config,
    category,
    specDb,
    windowHours: 24,
  });

  assert.equal(metrics.category, category);
  assert.equal(metrics.reviewed_products >= 1, true);
  assert.equal(metrics.in_progress_products, 0);
  assert.equal(metrics.overrides_total >= 1, true);
  assert.equal(metrics.overrides_per_product >= 1, true);
  assert.equal(metrics.products_per_hour > 0, true);
});

test('buildReviewMetrics reports in-progress override products from SQL when consolidated JSON is missing', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-metrics-sql-progress',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  seedLatestArtifacts(harness);
  await seedReviewProductPayload(harness);
  await approveGreenOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    reviewer: 'reviewer_metrics',
    reason: 'bulk_green_approve',
  });
  await fs.rm(resolveConsolidatedOverridePath({ config, category }), { force: true });

  const metrics = await buildReviewMetrics({
    config,
    category,
    specDb,
    windowHours: 24,
  });

  assert.equal(metrics.reviewed_products, 0);
  assert.equal(metrics.in_progress_products, 1);
});

test('buildReviewMetrics reports finalized override products from SQL when consolidated JSON is stale', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-metrics-sql-finalized',
  });
  const { storage, config, category, productId, specDb } = harness;
  await seedFieldRulesArtifacts(harness);
  await seedReviewCandidates(harness);
  seedLatestArtifacts(harness);
  await seedReviewProductPayload(harness);
  await approveGreenOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    reviewer: 'reviewer_metrics',
    reason: 'bulk_green_approve',
  });
  await finalizeOverrides({
    storage,
    config,
    category,
    productId,
    specDb,
    applyOverrides: true,
  });
  await upsertProductInConsolidated({
    config,
    category,
    productId,
    productEntry: {
      category,
      product_id: productId,
      review_status: 'in_progress',
      overrides: {},
    },
  });

  const metrics = await buildReviewMetrics({
    config,
    category,
    specDb,
    windowHours: 24,
  });

  assert.equal(metrics.reviewed_products, 1);
  assert.equal(metrics.in_progress_products, 0);
  assert.equal(metrics.overrides_total, 1);
});
