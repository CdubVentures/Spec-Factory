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
    /if \(saveStudioDocsMut\.isPending\)[\s\S]*if \(saveStudioDocsMut\.isError\)[\s\S]*if \(hasUnsavedChanges\)[\s\S]*if \(effectiveAutoSaveEnabled\)/,
    'save status precedence should be pending -> error -> unsaved -> autosave idle labels',
  );
  assert.match(
    studioPageText,
    /label:\s*effectiveAutoSaveEnabled\s*\?\s*["']Unsaved \(Auto-Save Pending\)["']\s*:\s*["']Unsaved["']/,
    'autosave-on unsaved edits should report pending unsaved state instead of up-to-date',
  );
  assert.match(
    studioPageText,
    /label:\s*\(saveStudioDocsMut\.error as Error\)\?\.message\s*\|\|\s*["']Save failed["']/,
    'save status should surface save mutation errors',
  );
});
