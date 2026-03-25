import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY,
  PRODUCT_A,
  clickAndWaitForDrawer,
  clickGridCell,
  createReviewLaneGuiHarness,
  ensureButtonVisible,
  getItemFieldStateId,
  getStrictKeyReviewState,
  waitForCondition,
} from './helpers/reviewLaneGuiHarness.js';
import { runThemeProfileGuiContract } from '../../../pages/layout/__tests__/helpers/themeProfileGuiContractHelper.js';

async function assertGridLaneScope({ db, page, openReviewGrid }) {
  await openReviewGrid();

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
  }, 15_000, 50, 'grid_item_accept_primary');

  const gridAcceptedValueCard = page.locator('section')
    .filter({ hasText: /Candidates \(/ })
    .first()
    .locator('span[title="49"]')
    .first();
  const gridConfirmAfterAccept = gridAcceptedValueCard
    .locator('xpath=ancestor::div[contains(@class,"border")][1]//button[normalize-space()="Confirm"]')
    .first();
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
}

async function assertEnumLaneScope({ db, page, openEnumList }) {
  await openEnumList('connection');
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
  }, 15_000, 50, 'enum_accept');
}

async function assertComponentLaneScope({ componentIdentifier, db, page, openSensorComponentView }) {
  await openSensorComponentView();

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
  }, 15_000, 50, 'component_accept');

  const componentConfirmAfterAccept = componentCandidatesSection
    .locator('xpath=.//button[normalize-space()="Confirm"]')
    .first();
  await waitForCondition(async () => (await componentConfirmAfterAccept.count()) > 0, 15_000, 50, 'component_confirm_visible_after_accept_when_pending_candidates_remain');
}

test('review lane GUI contracts keep lane-specific actions scoped across grid, enum, and component surfaces', { timeout: 240_000 }, async (t) => {
  const harness = await createReviewLaneGuiHarness(t);
  if (!harness) return;

  await t.test('app-shell appearance controls hydrate persisted theme profile and persist runtime changes', async () => {
    await runThemeProfileGuiContract(harness);
  });

  await t.test('grid lane keeps primary actions isolated from shared-lane affordances', async () => {
    await assertGridLaneScope(harness);
  });

  await t.test('enum lane accept only mutates the enum shared lane', async () => {
    await assertEnumLaneScope(harness);
  });

  await t.test('component lane keeps pending badges and confirm actions scoped to component state', async () => {
    await assertComponentLaneScope(harness);
  });
});
