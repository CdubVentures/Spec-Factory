import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  clickGridCell,
  createReviewLaneGuiHarness,
  ensureButtonVisible,
  getItemFieldStateId,
  getStrictKeyReviewState,
  waitForCondition,
} from './helpers/reviewLaneGuiHarness.js';

test('review grid GUI keeps primary actions and shared-lane affordances scoped correctly', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneGuiHarness(t);
  if (!harness) return;

  const { baseUrl, db, page } = harness;
  await harness.openReviewGrid();

  await clickGridCell(page, PRODUCT_A, 'weight');
  await ensureButtonVisible(page, 'Accept');
  await ensureButtonVisible(page, 'Confirm');

  const gridCandidatesSection = page.locator('section').filter({ hasText: /Candidates \(/ }).first();
  const gridAcceptButton = gridCandidatesSection
    .locator('span[title="49"]')
    .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Accept"]')
    .first();
  await gridAcceptButton.click();

  const weightSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'weight');
  assert.ok(weightSlotId);
  await waitForCondition(async () => {
    const state = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'grid_key',
      itemIdentifier: PRODUCT_A,
      fieldKey: 'weight',
      itemFieldStateId: weightSlotId,
    });
    return state?.user_accept_primary_status === 'accepted';
  }, 15_000, 120, 'grid_item_accept_primary');

  const gridAcceptedValueCard = page.locator('section')
    .filter({ hasText: /Candidates \(/ })
    .first()
    .locator('span[title="49"]')
    .first();
  const gridConfirmAfterAccept = gridAcceptedValueCard
    .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Confirm"]')
    .first();
  await waitForCondition(async () => (await gridConfirmAfterAccept.count()) > 0, 15_000, 120, 'grid_confirm_still_visible_after_accept');

  await clickGridCell(page, PRODUCT_A, 'dpi');
  await ensureButtonVisible(page, 'Confirm');
  await page.getByRole('button', { name: 'Confirm' }).first().click();
  await waitForCondition(async () => {
    const payload = await fetch(`${baseUrl}/api/v1/review/${CATEGORY}/candidates/${PRODUCT_A}/dpi`).then((res) => res.json());
    return payload?.keyReview?.primaryStatus === 'confirmed' && payload?.keyReview?.userAcceptPrimary == null;
  }, 15_000, 120, 'grid_item_confirm_primary');

  await clickGridCell(page, PRODUCT_A, 'connection');
  const connectionSection = page.locator('section').filter({ hasText: /Candidates \(/ }).first();
  assert.equal(await connectionSection.getByRole('button', { name: 'Accept Shared' }).count(), 0);
  assert.equal(await connectionSection.getByRole('button', { name: 'Confirm Shared' }).count(), 0);
  assert.equal(await connectionSection.locator('text=AI Shared Pending').count(), 0);
});
