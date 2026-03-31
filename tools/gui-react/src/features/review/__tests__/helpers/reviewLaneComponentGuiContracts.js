import assert from 'node:assert/strict';

import {
  CATEGORY,
  clickAndWaitForDrawer,
  getStrictKeyReviewState,
  waitForCondition,
} from './reviewLaneGuiHarness.js';
import { candidateAction, clickFirstCandidateAction } from './reviewLaneGuiActionHelpers.js';

export async function runReviewLaneComponentGuiContracts({
  componentIdentifier,
  db,
  page,
  openSensorComponentView,
}) {
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

  // WHY: component lane uses shared review; CellDrawer may render either
  // confirm-primary or confirm-shared depending on the drawer context.
  const confirmPrimary = candidateAction(page, 'confirm-primary', 'cmp_dpi_25000');
  const confirmShared = candidateAction(page, 'confirm-shared', 'cmp_dpi_25000');
  await waitForCondition(
    async () => (await confirmPrimary.count()) > 0 || (await confirmShared.count()) > 0,
    15_000, 50, 'component_confirm_visible_after_accept_when_pending_candidates_remain',
  );
}
