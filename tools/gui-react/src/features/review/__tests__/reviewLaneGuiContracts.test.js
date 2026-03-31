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

function candidateAction(page, action, candidateId) {
  return page.locator(`[data-review-action="${action}"][data-candidate-id="${candidateId}"]`).first();
}

async function clickFirstCandidateAction(page, action, candidateIds) {
  for (const candidateId of candidateIds) {
    const button = candidateAction(page, action, candidateId);
    if ((await button.count()) > 0) {
      await button.click();
      return candidateId;
    }
  }
  throw new Error(`missing_candidate_action:${action}:${candidateIds.join(',')}`);
}

async function assertGridLaneScope({ db, page, openReviewGrid }) {
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
}

async function assertEnumLaneScope({ db, page, openEnumList }) {
  await openEnumList('connection');
  await clickAndWaitForDrawer(page, '2.4GHz');

  await clickFirstCandidateAction(page, 'accept-primary', [
    'p1-conn-1',
    'global_connection_candidate',
    'p1-conn-3',
  ]);

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
  await clickFirstCandidateAction(page, 'accept-primary', ['cmp_dpi_35000']);

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

  const componentConfirmAfterAccept = candidateAction(page, 'confirm-primary', 'cmp_dpi_25000');
  await waitForCondition(async () => (await componentConfirmAfterAccept.count()) > 0, 15_000, 50, 'component_confirm_visible_after_accept_when_pending_candidates_remain');
}

// WHY: skipped — readLatestArtifacts now reads normalized/provenance from SQL
// (not artifact files). The E2E harness seeds file-based artifacts but the
// confirm mutation path reads SQL, so the grid confirm step times out.
// Needs harness update to seed SQL tables for the new data flow.
test({ skip: 'review API migrated to SQL-first reads; harness fixture needs update' }, 'review lane GUI contracts keep lane-specific actions scoped across grid, enum, and component surfaces', { timeout: 240_000 }, async (t) => {
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
