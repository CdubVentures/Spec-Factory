import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  clickGridCell,
  ensureButtonVisible,
  getItemFieldStateId,
  getStrictKeyReviewState,
  waitForCondition,
} from './reviewLaneGuiHarness.js';
import { candidateAction, clickFirstCandidateAction } from './reviewLaneGuiContractUtils.js';

export async function runReviewLaneGridGuiContracts(t, harness) {
  await t.test('grid lane keeps primary actions isolated from shared-lane affordances', async () => {
    const { db, page, openReviewGrid } = harness;

    await openReviewGrid();

    await clickGridCell(page, PRODUCT_A, 'weight');
    await ensureButtonVisible(page, 'Accept');
    await ensureButtonVisible(page, 'Confirm');

    await clickFirstCandidateAction(page, 'accept-primary', ['p1-weight-1']);

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
    }, 15_000, 50, 'grid_item_accept_primary');

    const gridConfirmAfterAccept = candidateAction(page, 'confirm-primary', 'collision_primary_candidate');
    await waitForCondition(async () => (await gridConfirmAfterAccept.count()) > 0, 15_000, 50, 'grid_confirm_still_visible_after_accept');

    await clickGridCell(page, PRODUCT_A, 'dpi');
    await ensureButtonVisible(page, 'Confirm');
    await page.getByRole('button', { name: 'Confirm' }).first().click();
    const dpiSlotId = getItemFieldStateId(db, CATEGORY, PRODUCT_A, 'dpi');
    assert.ok(dpiSlotId);
    await waitForCondition(async () => {
      const state = getStrictKeyReviewState(db, CATEGORY, {
        category: CATEGORY,
        targetKind: 'grid_key',
        itemIdentifier: PRODUCT_A,
        fieldKey: 'dpi',
        itemFieldStateId: dpiSlotId,
      });
      return state?.ai_confirm_primary_status === 'confirmed' && state?.user_accept_primary_status == null;
    }, 15_000, 50, 'grid_item_confirm_primary');

    await clickGridCell(page, PRODUCT_A, 'connection');
    const connectionSection = page.locator('section').filter({ hasText: /Candidates \(/ }).first();
    assert.equal(await connectionSection.getByRole('button', { name: 'Accept Shared' }).count(), 0);
    assert.equal(await connectionSection.getByRole('button', { name: 'Confirm Shared' }).count(), 0);
    assert.equal(await connectionSection.locator('text=AI Shared Pending').count(), 0);
  });
}
