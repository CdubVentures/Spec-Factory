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
    storagePageText.includes("isDirty ? (autoSaveEnabled ? 'Unsaved changes queued for auto save.' : 'Unsaved changes.') : 'All changes saved.'"),
    true,
    'Storage page should show autosave-pending unsaved text when autosave is enabled and plain unsaved text when autosave is disabled',
  );
  assert.equal(
    storagePageText.includes("statusText || (isStorageSaving"),
    true,
    'Storage page should prioritize explicit save success/error text over fallback autosave/manual status labels',
  );
  assert.equal(
    storagePageText.includes('isDirty && !autoSaveEnabled'),
    false,
    'Storage page should not hide unsaved status while autosave is enabled',
  );
});
