import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

test('normalizeRuntimeDraft mirrors canonical category-authority aliases into helper-file aliases', async () => {
  const [{ normalizeRuntimeDraft }, { RUNTIME_SETTING_DEFAULTS }] = await Promise.all([
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalization.ts',
      { prefix: 'runtime-flow-draft-alias-canonical-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/stores/settingsManifest.ts',
      { prefix: 'runtime-flow-draft-alias-defaults-canonical-' },
    ),
  ]);

  const normalized = normalizeRuntimeDraft({
    categoryAuthorityRoot: 'category-root-canonical',
    categoryAuthorityEnabled: false,
    indexingCategoryAuthorityEnabled: true,
  }, RUNTIME_SETTING_DEFAULTS);

  assert.equal(normalized.categoryAuthorityRoot, 'category-root-canonical');
  assert.equal(normalized.helperFilesRoot, 'category-root-canonical');
  assert.equal(normalized.categoryAuthorityEnabled, false);
  assert.equal(normalized.helperFilesEnabled, false);
  assert.equal(normalized.indexingCategoryAuthorityEnabled, true);
  assert.equal(normalized.indexingHelperFilesEnabled, true);
});

test('normalizeRuntimeDraft mirrors helper-file aliases into canonical category-authority aliases', async () => {
  const [{ normalizeRuntimeDraft }, { RUNTIME_SETTING_DEFAULTS }] = await Promise.all([
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowDraftNormalization.ts',
      { prefix: 'runtime-flow-draft-alias-helper-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/stores/settingsManifest.ts',
      { prefix: 'runtime-flow-draft-alias-defaults-helper-' },
    ),
  ]);

  const normalized = normalizeRuntimeDraft({
    helperFilesRoot: 'helper-root-canonical',
    helperFilesEnabled: false,
    indexingHelperFilesEnabled: true,
  }, RUNTIME_SETTING_DEFAULTS);

  assert.equal(normalized.helperFilesRoot, 'helper-root-canonical');
  assert.equal(normalized.categoryAuthorityRoot, 'helper-root-canonical');
  assert.equal(normalized.helperFilesEnabled, false);
  assert.equal(normalized.categoryAuthorityEnabled, false);
  assert.equal(normalized.indexingHelperFilesEnabled, true);
  assert.equal(normalized.indexingCategoryAuthorityEnabled, true);
});
