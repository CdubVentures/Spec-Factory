import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  clickAndWaitForDrawer,
  createReviewLaneGuiHarness,
  getStrictKeyReviewState,
  waitForCondition,
} from './helpers/reviewLaneGuiHarness.js';

test('review enum GUI wires accept actions into the enum shared lane only', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneGuiHarness(t);
  if (!harness) return;

  const { db, page } = harness;
  await harness.openEnumList('connection');
  await clickAndWaitForDrawer(page, '2.4GHz');

  const enumCandidatesSection = page.locator('section').filter({ hasText: /Candidates \(/ }).first();
  let enumAcceptButton = enumCandidatesSection
    .locator('span[title="candidate_id: p1-conn-1"]')
    .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Accept"]')
    .first();
  if ((await enumAcceptButton.count()) === 0) {
    enumAcceptButton = enumCandidatesSection
      .locator('span[title="candidate_id: global_connection_candidate"]')
      .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Accept"]')
      .first();
  }
  if ((await enumAcceptButton.count()) === 0) {
    enumAcceptButton = enumCandidatesSection
      .locator('span[title="2.4GHz"]')
      .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Accept"]')
      .first();
  }
  await enumAcceptButton.click();

  await waitForCondition(async () => {
    const state = getStrictKeyReviewState(db, CATEGORY, {
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: '2.4ghz',
    });
    return state?.user_accept_shared_status === 'accepted' && state?.ai_confirm_shared_status === 'pending';
  }, 15_000, 120, 'enum_accept');
});
