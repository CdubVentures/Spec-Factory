import assert from 'node:assert/strict';
import {
  CATEGORY,
  clickAndWaitForDrawer,
  getStrictKeyReviewState,
  waitForCondition,
} from './reviewLaneGuiHarness.js';
import { candidateAction, clickFirstCandidateAction } from './reviewLaneGuiContractUtils.js';

export async function runReviewLaneComponentGuiContracts(t, harness) {
  await t.test('component lane keeps pending badges and confirm actions scoped to component state', async () => {
    const { componentIdentifier, db, page, openSensorComponentView } = harness;

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

    const acceptedCandidateConfirm = candidateAction(page, 'confirm-shared', 'cmp_dpi_35000');
    await waitForCondition(async () => (await acceptedCandidateConfirm.count()) > 0, 15_000, 50, 'component_confirm_visible_for_pending_shared_candidate');
    assert.equal(
      await candidateAction(page, 'confirm-primary', 'cmp_dpi_35000').count(),
      0,
      'component shared confirmation should not surface a grid-lane confirm button',
    );
    const alternatePendingSharedConfirm = candidateAction(page, 'confirm-shared', 'cmp_dpi_25000');
    await waitForCondition(async () => (await alternatePendingSharedConfirm.count()) > 0, 15_000, 50, 'component_confirm_remains_available_for_peer_pending_shared_candidates');
    assert.equal(
      await candidateAction(page, 'confirm-primary', 'cmp_dpi_25000').count(),
      0,
      'component peer candidates should stay on shared-lane confirm controls only',
    );
  });
}
