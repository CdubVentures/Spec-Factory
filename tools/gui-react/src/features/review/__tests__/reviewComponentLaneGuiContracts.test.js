import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  clickAndWaitForDrawer,
  createReviewLaneGuiHarness,
  getStrictKeyReviewState,
  waitForCondition,
} from './helpers/reviewLaneGuiHarness.js';

test('review components GUI keeps pending badges and confirm actions scoped to component lanes', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneGuiHarness(t);
  if (!harness) return;

  const { componentIdentifier, db, page } = harness;
  await harness.openSensorComponentView();

  const componentNameRow = page.locator('tr', { has: page.locator('span[title="PAW3950"]') }).first();
  const componentNameCell = componentNameRow.locator('td').first();
  assert.equal(await componentNameCell.locator('span[title="Shared AI review pending"]').count(), 0);
  assert.equal(await componentNameCell.locator('span[title="Item AI review pending"]').count(), 0);

  await clickAndWaitForDrawer(page, '35000');
  const componentCandidatesSection = page.locator('section').filter({ hasText: /Candidates \(/ }).first();
  const componentAcceptButton = componentCandidatesSection
    .locator('span[title="35000"]')
    .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Accept"]')
    .first();
  await componentAcceptButton.click();

  await waitForCondition(async () => {
    const state = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'component_key',
      fieldKey: 'dpi_max',
      componentIdentifier,
      propertyKey: 'dpi_max',
    });
    return state?.user_accept_shared_status === 'accepted' && state?.ai_confirm_shared_status === 'pending';
  }, 15_000, 120, 'component_accept');

  const componentConfirmAfterAccept = componentCandidatesSection
    .locator('xpath=.//button[normalize-space()="Confirm"]')
    .first();
  await waitForCondition(async () => (await componentConfirmAfterAccept.count()) > 0, 15_000, 120, 'component_confirm_visible_after_accept_when_pending_candidates_remain');
});
