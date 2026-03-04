import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('studio drafts autosave flushes pending dirty edits on unmount', () => {
  const studioPageText = readText(STUDIO_PAGE);

  assert.match(
    studioPageText,
    /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{[\s\S]*?effectiveAutoSaveEnabled[\s\S]*?saveFromStore\(\{\s*force:\s*true\s*\}\)/,
    'Studio drafts autosave should flush pending dirty edits on unmount',
  );
});

test('studio map autosave flushes pending dirty map payload on unmount', () => {
  const studioPageText = readText(STUDIO_PAGE);

  assert.match(
    studioPageText,
    /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{[\s\S]*?autoSaveMapEnabled[\s\S]*?mapHydrated\.current[\s\S]*?onSaveMap\(nextMap\)/,
    'Studio map autosave should flush pending dirty map payload on unmount',
  );
});
