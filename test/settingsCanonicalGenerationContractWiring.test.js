import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_ROUTES = path.resolve('src/api/routes/configRoutes.js');
const USER_SETTINGS_SERVICE = path.resolve('src/api/services/userSettingsService.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings routes persist canonical sections first and derive runtime artifacts from canonical snapshot', () => {
  const configRoutesText = readText(CONFIG_ROUTES);

  assert.equal(
    configRoutesText.includes('async function persistCanonicalSections({'),
    true,
    'config routes should define a shared canonical section persistence helper',
  );
  assert.equal(
    configRoutesText.includes('persistUserSettingsSections({'),
    true,
    'config routes should persist user-settings through canonical section writer',
  );
  assert.equal(
    configRoutesText.includes('const artifacts = deriveSettingsArtifactsFromUserSettings(persisted);'),
    true,
    'config routes should derive runtime artifacts from persisted canonical user-settings snapshot',
  );
  assert.equal(
    configRoutesText.includes('applyDerivedSettingsArtifacts(artifacts);'),
    true,
    'config routes should apply derived runtime artifacts from canonical snapshot',
  );

  assert.match(
    configRoutesText,
    /parts\[0\] === 'ui-settings'[\s\S]*persistCanonicalSections\(\{\s*ui:\s*snapshot,/,
    'ui settings route should persist through canonical section helper',
  );
  assert.match(
    configRoutesText,
    /parts\[0\] === 'storage-settings'[\s\S]*persistCanonicalSections\(\{\s*storage:\s*storageSnapshot,/,
    'storage settings route should persist through canonical section helper',
  );
  assert.match(
    configRoutesText,
    /parts\[0\] === 'convergence-settings'[\s\S]*persistCanonicalSections\(\{\s*convergence:\s*nextConvergenceSnapshot,/,
    'convergence settings route should persist through canonical section helper',
  );
  assert.match(
    configRoutesText,
    /parts\[0\] === 'runtime-settings'[\s\S]*persistCanonicalSections\(\{\s*runtime:\s*nextRuntimeSnapshot,/,
    'runtime settings route should persist through canonical section helper',
  );
});

test('user settings service writes canonical snapshot envelope before any derived legacy artifacts are exposed', () => {
  const userSettingsServiceText = readText(USER_SETTINGS_SERVICE);

  assert.equal(
    userSettingsServiceText.includes('const payload = deriveSettingsArtifactsFromUserSettings(sections).snapshot;'),
    true,
    'persistUserSettingsSections should serialize canonical snapshot from derived sections',
  );
  assert.equal(
    userSettingsServiceText.includes('assertValidSnapshot(payload);'),
    true,
    'persistUserSettingsSections should validate canonical snapshot envelope before write',
  );
  assert.equal(
    userSettingsServiceText.includes('await writeUserSettingsFile(filePath, payload);'),
    true,
    'persistUserSettingsSections should write canonical user-settings snapshot to disk',
  );
  assert.equal(
    userSettingsServiceText.includes('legacy: {'),
    true,
    'derived artifacts contract should expose legacy projections as artifacts derived from canonical snapshot',
  );
  assert.equal(
    userSettingsServiceText.includes('runtime: snapshot.runtime,'),
    true,
    'legacy runtime projection should derive from canonical snapshot runtime section',
  );
  assert.equal(
    userSettingsServiceText.includes('convergence: snapshot.convergence,'),
    true,
    'legacy convergence projection should derive from canonical snapshot convergence section',
  );
});
