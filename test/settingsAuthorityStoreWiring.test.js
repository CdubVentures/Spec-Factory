import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_AUTHORITY_STORE = path.resolve('tools/gui-react/src/stores/settingsAuthorityStore.ts');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings authority store exposes hydrate-once, patch, and reset APIs', () => {
  assert.equal(fs.existsSync(SETTINGS_AUTHORITY_STORE), true, 'settings authority store module should exist');
  const text = readText(SETTINGS_AUTHORITY_STORE);

  assert.equal(text.includes('useSettingsAuthorityStore = create'), true, 'settings authority store should use a subscribe/select store');
  assert.equal(text.includes('hydrateOnce:'), true, 'settings authority store should expose a hydrate-once API');
  assert.equal(text.includes('patchSnapshot:'), true, 'settings authority store should expose a patch update API');
  assert.equal(text.includes('resetSnapshot:'), true, 'settings authority store should expose a reset API');
  assert.equal(text.includes('if (get().hydrated) return;'), true, 'hydrate-once should no-op after first hydration');
  assert.equal(text.includes('readSettingsAuthoritySnapshot'), true, 'settings authority store should expose a shared snapshot reader');
  assert.equal(text.includes('uiSettingsPersistState'), true, 'settings authority snapshot should include ui settings persistence state');
  assert.equal(text.includes('uiSettingsPersistMessage'), true, 'settings authority snapshot should include ui settings persistence error message');
});

test('settings authority bootstrap publishes snapshots to the shared settings authority store', () => {
  const text = readText(SETTINGS_AUTHORITY);

  assert.equal(text.includes("useSettingsAuthorityStore((s) => s.hydrateOnce)"), true, 'settings authority bootstrap should consume hydrate-once API');
  assert.equal(text.includes("useSettingsAuthorityStore((s) => s.patchSnapshot)"), true, 'settings authority bootstrap should consume patch API');
  assert.equal(text.includes('const authoritySnapshot = useMemo<SettingsAuthoritySnapshot>(() => ({'), true, 'settings authority bootstrap should compute a canonical snapshot payload');
  assert.equal(text.includes('hydrateAuthoritySnapshot(authoritySnapshot);'), true, 'settings authority bootstrap should hydrate shared store once');
  assert.equal(text.includes('patchAuthoritySnapshot(authoritySnapshot);'), true, 'settings authority bootstrap should patch shared store for live snapshot updates');
  assert.equal(text.includes('return authoritySnapshot;'), true, 'settings authority bootstrap return should align with published snapshot payload');
});
