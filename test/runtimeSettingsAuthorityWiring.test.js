import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PICKER_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/PickerPanel.tsx');
const RUNTIME_AUTHORITY = path.resolve('tools/gui-react/src/stores/runtimeSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime settings are owned by a shared authority module', () => {
  assert.equal(fs.existsSync(RUNTIME_AUTHORITY), true, 'runtime settings authority module should exist');

  const authorityText = readText(RUNTIME_AUTHORITY);
  const indexingPageText = readText(INDEXING_PAGE);
  const pickerPanelText = readText(PICKER_PANEL);

  assert.equal(authorityText.includes('/runtime-settings'), true, 'runtime settings authority should own runtime settings API route usage');
  assert.equal(
    authorityText.includes('RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS'),
    true,
    'runtime settings authority should own numeric fallback baseline defaults',
  );
  assert.equal(
    authorityText.includes('readRuntimeSettingsNumericBaseline'),
    true,
    'runtime settings authority should expose numeric baseline readers for runtime payload fallback wiring',
  );
  assert.equal(
    authorityText.includes('runtimeSettingsNumericBaselineEqual'),
    true,
    'runtime settings authority should expose numeric baseline equality helper for drift-safe updates',
  );
  assert.equal(indexingPageText.includes('useRuntimeSettingsReader'), true, 'Indexing page should consume runtime settings via reader authority');
  assert.equal(indexingPageText.includes('useRuntimeSettingsAuthority'), false, 'Indexing page should not instantiate runtime writer authority');
  assert.equal(indexingPageText.includes('useSettingsAuthorityStore'), true, 'Indexing page should read runtime readiness from shared settings authority snapshot');
  assert.equal(indexingPageText.includes('/runtime-settings'), false, 'Indexing page should not directly read/write runtime settings endpoint');
  assert.equal(indexingPageText.includes('/api/v1/runtime-settings'), false, 'Indexing page should not directly call runtime settings API URL');
  assert.equal(indexingPageText.includes('const runtimeSettingsReady = runtimeSettingsAuthorityReady && !runtimeSettingsLoading;'), true, 'Indexing page should lock run start until runtime settings hydrate through shared authority readiness');
  assert.equal(indexingPageText.includes('const canRunSingle = !isAll && !!singleProductId && runtimeSettingsReady;'), true, 'Run readiness should include runtime settings hydration');
  assert.equal(
    indexingPageText.includes("import { RuntimePanel } from './panels/RuntimePanel';"),
    false,
    'Indexing page should not import runtime settings container',
  );
  assert.equal(indexingPageText.includes('<RuntimePanel'), false, 'Indexing page should not render runtime settings container');
  assert.equal(
    indexingPageText.includes('Runtime and convergence settings now live in'),
    false,
    'Indexing page should not retain runtime migration notice text after runtime panel removal',
  );
  assert.equal(pickerPanelText.includes('runtimeSettingsReady: boolean;'), true, 'Picker panel should receive runtime settings readiness');
  assert.equal(pickerPanelText.includes('!runtimeSettingsReady'), true, 'Picker run action should be disabled until runtime settings are ready');
});
