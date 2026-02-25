import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('studio save status prioritizes error and unsaved state ahead of autosave idle labels', () => {
  const studioPageText = readText(STUDIO_PAGE);

  assert.match(
    studioPageText,
    /if \(saveDraftsMut\.isPending\)[\s\S]*if \(saveDraftsMut\.isError\)[\s\S]*if \(hasUnsavedChanges\)[\s\S]*if \(effectiveAutoSaveEnabled\)/,
    'save status precedence should be pending -> error -> unsaved -> autosave idle labels',
  );
  assert.equal(
    studioPageText.includes("label: effectiveAutoSaveEnabled ? 'Unsaved (auto-save pending)' : 'Unsaved'"),
    true,
    'autosave-on unsaved edits should report pending unsaved state instead of up-to-date',
  );
  assert.equal(
    studioPageText.includes("label: (saveDraftsMut.error as Error)?.message || 'Save failed'"),
    true,
    'save status should surface save mutation errors',
  );
});
