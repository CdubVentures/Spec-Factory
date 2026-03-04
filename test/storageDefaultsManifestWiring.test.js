import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_MANIFEST = path.resolve('tools/gui-react/src/stores/settingsManifest.ts');
const SHARED_DEFAULTS = path.resolve('src/shared/settingsDefaults.js');
const STORAGE_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/storageSettingsAuthority.ts');
const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('storage defaults manifest includes canonical destination and credential baseline keys', () => {
  const manifestText = readText(SETTINGS_MANIFEST);
  const sharedDefaultsText = readText(SHARED_DEFAULTS);

  assert.equal(manifestText.includes('STORAGE_SETTING_DEFAULTS'), true, 'settings manifest should define storage defaults');
  assert.match(
    manifestText,
    /import\s*\{[\s\S]*SETTINGS_DEFAULTS[\s\S]*\}\s*from\s*'..\/..\/..\/..\/src\/shared\/settingsDefaults\.js';/,
    'settings manifest should import shared defaults',
  );
  assert.equal(manifestText.includes('SETTINGS_DEFAULTS.storage'), true, 'storage defaults should be wired from shared defaults manifest');

  assert.equal(sharedDefaultsText.includes("destinationType: 'local'"), true, 'storage destination default should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes("localDirectory: ''"), true, 'storage local directory default should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes("s3Bucket: ''"), true, 'storage bucket default should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes("s3AccessKeyId: ''"), true, 'storage access key id default should be shared-manifest-owned');
});

test('storage bootstrap and page form state consume storage defaults manifest', () => {
  const storageAuthorityText = readText(STORAGE_SETTINGS_AUTHORITY);
  const storagePageText = readText(STORAGE_PAGE);

  assert.equal(storagePageText.includes('useStorageSettingsBootstrap()'), true, 'storage page should bootstrap from shared storage authority helper');

  assert.equal(storageAuthorityText.includes("localDirectory: readStorageString(raw, 'localDirectory', STORAGE_SETTING_DEFAULTS.localDirectory)"), true, 'storage settings response sanitizer should use storage manifest local directory default');
  assert.equal(storageAuthorityText.includes("s3Bucket: readStorageString(raw, 's3Bucket', STORAGE_SETTING_DEFAULTS.s3Bucket)"), true, 'storage settings response sanitizer should use storage manifest bucket default');
  assert.equal(storageAuthorityText.includes("s3Prefix: readStorageString(raw, 's3Prefix', STORAGE_SETTING_DEFAULTS.s3Prefix)"), true, 'storage settings response sanitizer should use storage manifest prefix default');
  assert.equal(storageAuthorityText.includes("s3AccessKeyId: readStorageString(raw, 's3AccessKeyId', STORAGE_SETTING_DEFAULTS.s3AccessKeyId)"), true, 'storage settings response sanitizer should use storage manifest access key default');
  assert.equal(storageAuthorityText.includes("s3Prefix: readStorageString(snapshot, 's3Prefix', STORAGE_SETTING_DEFAULTS.s3Prefix)"), true, 'storage bootstrap snapshot reader should use storage manifest prefix default');

  assert.equal(storageAuthorityText.includes('String(raw.s3Prefix || STORAGE_SETTING_DEFAULTS.s3Prefix)'), false, 'storage settings response sanitizer should not coerce explicit empty s3Prefix to defaults');
  assert.equal(storageAuthorityText.includes('String(snapshot.s3Prefix || STORAGE_SETTING_DEFAULTS.s3Prefix)'), false, 'storage snapshot bootstrap should not coerce explicit empty s3Prefix to defaults');
  assert.equal(storagePageText.includes('readStorageFormString(settings.s3Prefix, STORAGE_SETTING_DEFAULTS.s3Prefix)'), true, 'storage page form mapping should use nullish-aware prefix fallback');
  assert.equal(storagePageText.includes('String(settings.s3Prefix || STORAGE_SETTING_DEFAULTS.s3Prefix)'), false, 'storage page form mapping should not coerce explicit empty s3Prefix to defaults');
});
