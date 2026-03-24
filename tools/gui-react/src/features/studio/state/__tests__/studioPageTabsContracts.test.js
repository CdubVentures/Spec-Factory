import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioPageTabsModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPageTabs.ts',
    {
      prefix: 'studio-page-tabs-',
    },
  );
}

test('studio page tab ids keep the stable workflow ordering', async () => {
  const { STUDIO_TAB_IDS } = await loadStudioPageTabsModule();

  assert.deepEqual(STUDIO_TAB_IDS, ['mapping', 'keys', 'contract', 'reports']);
});
