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
    storagePageText.includes('const [hasHydratedFromServer, setHasHydratedFromServer] = useState(false);'),
    true,
    'Storage page should track hydrate-ready state',
  );

  assert.equal(
    storagePageText.includes('autoSaveEnabled: autoSaveEnabled && hasHydratedFromServer'),
    true,
    'Storage autosave should remain disabled until hydration is complete',
  );

  assert.equal(
    storagePageText.includes('() => hasHydratedFromServer && !isStorageSaving && isDirty'),
    true,
    'Manual save should remain disabled until hydration is complete',
  );
});
