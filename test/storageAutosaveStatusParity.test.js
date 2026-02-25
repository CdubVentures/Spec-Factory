import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('storage page status distinguishes autosave-pending unsaved state from manual-save unsaved state', () => {
  const storagePageText = readText(STORAGE_PAGE);

  assert.equal(
    storagePageText.includes("autoSaveEnabled ? 'Unsaved changes queued for auto save.' : 'Unsaved changes.'"),
    true,
    'Storage page should show autosave-pending unsaved text when autosave is enabled and plain unsaved text when autosave is disabled',
  );
  assert.equal(
    storagePageText.includes("'All changes saved.'"),
    true,
    'Storage page should retain explicit all-saved status text when no dirty/error/saving state is active',
  );
  assert.equal(
    storagePageText.includes("const storageStatusText = isStorageSaving"),
    true,
    'Storage page should compute status text with explicit precedence rooted in persistence state',
  );
  assert.equal(
    storagePageText.includes("statusKind === 'error'"),
    true,
    'Storage page should surface save errors ahead of generic unsaved/saved labels',
  );
  assert.equal(
    storagePageText.includes("setStatusKind('');"),
    false,
    'Storage page should not clear save error/ok state to empty just because local edits changed',
  );
  assert.equal(
    storagePageText.includes("setStatusText('');"),
    false,
    'Storage page should not clear save message text just because local edits changed',
  );
  assert.equal(
    storagePageText.includes('isDirty && !autoSaveEnabled'),
    false,
    'Storage page should not hide unsaved status while autosave is enabled',
  );
});
