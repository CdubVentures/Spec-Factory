import test from 'node:test';
import { createReviewLaneGuiHarness } from './helpers/reviewLaneGuiHarness.js';
import { runReviewLaneGridGuiContracts } from './helpers/reviewLaneGridGuiContracts.js';
import { runReviewLaneEnumGuiContracts } from './helpers/reviewLaneEnumGuiContracts.js';
import { runReviewLaneComponentGuiContracts } from './helpers/reviewLaneComponentGuiContracts.js';
import { runThemeProfileGuiContract } from '../../../pages/layout/__tests__/helpers/themeProfileGuiContractHelper.js';

test('review lane GUI contracts share one seeded harness without weakening lane-specific coverage', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneGuiHarness(t);

  await t.test('app-shell appearance controls hydrate persisted theme profile and persist runtime changes', async () => {
    await runThemeProfileGuiContract(harness);
  });

  await runReviewLaneGridGuiContracts(t, harness);
  await runReviewLaneEnumGuiContracts(t, harness);
  await runReviewLaneComponentGuiContracts(t, harness);
});
