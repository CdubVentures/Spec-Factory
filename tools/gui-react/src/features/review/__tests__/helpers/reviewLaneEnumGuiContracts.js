import {
  CATEGORY,
  clickAndWaitForDrawer,
  getStrictKeyReviewState,
  waitForCondition,
} from './reviewLaneGuiHarness.js';
import { clickFirstCandidateAction } from './reviewLaneGuiContractUtils.js';

export async function runReviewLaneEnumGuiContracts(t, harness) {
  await t.test('enum lane accept only mutates the enum shared lane', async () => {
    const { db, page, openEnumList } = harness;

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
  });
}
