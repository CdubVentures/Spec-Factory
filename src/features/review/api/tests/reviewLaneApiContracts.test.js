import test from 'node:test';
import { createReviewLaneApiHarness } from './fixtures/reviewLaneApiHarness.js';
import { runReviewLaneGridContracts } from './helpers/reviewLaneGridContracts.js';
import { runReviewLaneEnumContracts } from './helpers/reviewLaneEnumContracts.js';
import { runReviewLaneComponentContracts } from './helpers/reviewLaneComponentContracts.js';
import { runReviewLaneGuardContracts } from './helpers/reviewLaneGuardContracts.js';
import { runReviewLaneReadContracts } from './helpers/reviewLaneReadContracts.js';

test('review lane API contracts share one seeded harness without weakening lane-specific coverage', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneApiHarness(t);

  await runReviewLaneGridContracts(t, harness);
  await runReviewLaneComponentContracts(t, harness);
  await runReviewLaneEnumContracts(t, harness);
  await runReviewLaneGuardContracts(t, harness);
  await runReviewLaneReadContracts(t, harness);
});
