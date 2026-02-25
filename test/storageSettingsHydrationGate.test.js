import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('storage settings writes are hydration-gated before save/autosave', () => {
  const storagePageText = readText(STORAGE_PAGE);

  assert.equal(
    storagePageText.includes('useSettingsAuthorityStore'),
    true,
    'Storage page should read hydration readiness from shared settings authority snapshot',
  );

  assert.equal(
    storagePageText.includes('autoSaveEnabled: autoSaveEnabled && storageSettingsReady'),
    true,
    'Storage autosave should remain disabled until hydration is complete',
  );

  assert.equal(
    storagePageText.includes('() => storageSettingsReady && !isStorageSaving && isDirty'),
    true,
    'Manual save should remain disabled until hydration is complete',
  );

  assert.equal(
    storagePageText.includes('const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);'),
    false,
    'Storage page should not keep a component-local hydration mirror when shared snapshot readiness is available',
  );
});
