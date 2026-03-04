import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SETTINGS_AUTHORITY_ENTRY = path.resolve('src/features/settings-authority/index.js');
const GUI_SERVER = path.resolve('src/api/guiServer.js');
const CONFIG_ROUTES = path.resolve('src/api/routes/configRoutes.js');
const STUDIO_ROUTES = path.resolve('src/api/routes/studioRoutes.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings-authority feature contract re-exports canonical settings capabilities', async () => {
  assert.equal(fs.existsSync(SETTINGS_AUTHORITY_ENTRY), true, 'feature entrypoint should exist');
  const settingsAuthority = await import(pathToFileURL(SETTINGS_AUTHORITY_ENTRY).href);

  assert.equal(typeof settingsAuthority.loadUserSettingsSync, 'function');
  assert.equal(typeof settingsAuthority.persistUserSettingsSections, 'function');
  assert.equal(typeof settingsAuthority.applyRuntimeSettingsToConfig, 'function');
  assert.equal(typeof settingsAuthority.validateUserSettingsSnapshot, 'function');
  assert.equal(Array.isArray(settingsAuthority.RUNTIME_SETTINGS_KEYS), true);
  assert.equal(Array.isArray(settingsAuthority.CONVERGENCE_SETTINGS_KEYS), true);
  assert.equal(typeof settingsAuthority.SETTINGS_DEFAULTS, 'object');
});

test('gui/api settings consumers wire through settings-authority entrypoint', () => {
  const guiServerText = readText(GUI_SERVER);
  const configRoutesText = readText(CONFIG_ROUTES);
  const studioRoutesText = readText(STUDIO_ROUTES);

  assert.equal(
    guiServerText.includes("from '../features/settings-authority/index.js'"),
    true,
    'gui server should import settings capabilities from feature contract',
  );
  assert.equal(
    configRoutesText.includes("from '../../features/settings-authority/index.js'"),
    true,
    'config routes should import settings capabilities from feature contract',
  );
  assert.equal(
    studioRoutesText.includes("from '../../features/settings-authority/index.js'"),
    true,
    'studio routes should import settings capabilities from feature contract',
  );
});
