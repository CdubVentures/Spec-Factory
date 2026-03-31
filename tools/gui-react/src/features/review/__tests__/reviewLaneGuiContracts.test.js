import test from 'node:test';
import { createReviewLaneGuiHarness } from './helpers/reviewLaneGuiHarness.js';
import { runReviewLaneGridGuiContracts } from './helpers/reviewLaneGridGuiContracts.js';
import { runReviewLaneEnumGuiContracts } from './helpers/reviewLaneEnumGuiContracts.js';
import { runReviewLaneComponentGuiContracts } from './helpers/reviewLaneComponentGuiContracts.js';
import { runThemeProfileGuiContract } from '../../../pages/layout/__tests__/helpers/themeProfileGuiContractHelper.js';

test('review lane GUI contracts keep lane-specific actions scoped across grid, enum, and component surfaces', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneGuiHarness(t);

  await t.test('app-shell appearance controls hydrate persisted theme profile and persist runtime changes', async () => {
    await runThemeProfileGuiContract(harness);
  });

  await t.test('grid lane keeps primary actions isolated from shared-lane affordances', async () => {
    await runReviewLaneGridGuiContracts(harness);
  });

  await t.test('enum lane accept only mutates the enum shared lane', async () => {
    await runReviewLaneEnumGuiContracts(harness);
  });

  await t.test('component lane keeps pending badges and confirm actions scoped to component state', async () => {
    await runReviewLaneComponentGuiContracts(harness);
  });
});
