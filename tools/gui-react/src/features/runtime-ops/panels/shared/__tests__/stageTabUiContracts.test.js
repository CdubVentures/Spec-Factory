import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let mod;

async function getModule() {
  if (mod) return mod;
  mod = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/shared/stageTabUiContracts.ts',
    { prefix: 'stage-tab-ui-contracts-', stubs: {} },
  );
  return mod;
}

describe('buildStageTabState', () => {
  it('selected tab returns isSelected true', async () => {
    const { buildStageTabState } = await getModule();
    const result = buildStageTabState({ activeTab: 'a', tabKey: 'a' });
    assert.equal(result.isSelected, true);
    assert.equal(result.isBusy, false);
    assert.equal(result.isDisabled, false);
    assert.equal(result.ariaDisabled, false);
  });

  it('non-selected tab returns isSelected false', async () => {
    const { buildStageTabState } = await getModule();
    const result = buildStageTabState({ activeTab: 'a', tabKey: 'b' });
    assert.equal(result.isSelected, false);
  });

  it('busy tab in set returns isBusy true', async () => {
    const { buildStageTabState } = await getModule();
    const result = buildStageTabState({ activeTab: null, tabKey: 'a', busyTabs: new Set(['a']) });
    assert.equal(result.isBusy, true);
  });

  it('disabled tab returns isDisabled and ariaDisabled true', async () => {
    const { buildStageTabState } = await getModule();
    const result = buildStageTabState({ activeTab: null, tabKey: 'a', disabledTabs: new Set(['a']) });
    assert.equal(result.isDisabled, true);
    assert.equal(result.ariaDisabled, true);
  });

  it('both busy and disabled', async () => {
    const { buildStageTabState } = await getModule();
    const result = buildStageTabState({
      activeTab: 'a', tabKey: 'a',
      busyTabs: new Set(['a']),
      disabledTabs: new Set(['a']),
    });
    assert.equal(result.isSelected, true);
    assert.equal(result.isBusy, true);
    assert.equal(result.isDisabled, true);
    assert.equal(result.ariaDisabled, true);
  });
});

describe('resolveNextStageTabSelection', () => {
  it('clicking selected tab is a no-op (returns same tab)', async () => {
    const { resolveNextStageTabSelection } = await getModule();
    assert.equal(resolveNextStageTabSelection({ activeTab: 'a', tabKey: 'a' }), 'a');
  });

  it('clicking unselected selects (returns key)', async () => {
    const { resolveNextStageTabSelection } = await getModule();
    assert.equal(resolveNextStageTabSelection({ activeTab: 'a', tabKey: 'b' }), 'b');
  });

  it('clicking disabled returns current activeTab unchanged', async () => {
    const { resolveNextStageTabSelection } = await getModule();
    assert.equal(
      resolveNextStageTabSelection({ activeTab: 'a', tabKey: 'b', disabledTabs: new Set(['b']) }),
      'a',
    );
  });
});

describe('normalizeActiveStageTab', () => {
  it('null stays null', async () => {
    const { normalizeActiveStageTab } = await getModule();
    assert.equal(normalizeActiveStageTab(null, new Set()), null);
  });

  it('valid tab stays', async () => {
    const { normalizeActiveStageTab } = await getModule();
    assert.equal(normalizeActiveStageTab('a', new Set(['b'])), 'a');
  });

  it('disabled tab clears to null', async () => {
    const { normalizeActiveStageTab } = await getModule();
    assert.equal(normalizeActiveStageTab('a', new Set(['a'])), null);
  });
});
