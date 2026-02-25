import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/storageSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('storage settings autosave flushes pending dirty payload on unmount', () => {
  const authorityText = readText(STORAGE_SETTINGS_AUTHORITY);

  assert.match(
    authorityText,
    /useEffect\(\(\) => \{[\s\S]*return \(\) => \{[\s\S]*dirtyRef\.current[\s\S]*autoSaveEnabledRef\.current[\s\S]*persistStorageSettings\(payloadRef\.current, false\)/,
    'Storage settings authority should flush pending dirty autosave payload on unmount',
  );
});
