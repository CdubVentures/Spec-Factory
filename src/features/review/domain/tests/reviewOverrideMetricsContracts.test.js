import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approveGreenOverrides,
  buildReviewMetrics,
  finalizeOverrides,
} from '../overrideWorkflow.js';
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
  await seedLatestArtifacts(harness);
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
