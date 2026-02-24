import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');
const STUDIO_PERSISTENCE_AUTHORITY = path.resolve('tools/gui-react/src/pages/studio/studioPersistenceAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('studio map and drafts writes are owned by studio persistence authority', () => {
  assert.equal(fs.existsSync(STUDIO_PERSISTENCE_AUTHORITY), true, 'studio persistence authority module should exist');

  const authorityText = readText(STUDIO_PERSISTENCE_AUTHORITY);
  const studioPageText = readText(STUDIO_PAGE);

  assert.equal(authorityText.includes('/save-drafts'), true, 'studio persistence authority should own save-drafts route usage');
  assert.equal(authorityText.includes('/field-studio-map'), true, 'studio persistence authority should own field-studio-map write route usage');
  assert.equal(studioPageText.includes('useStudioPersistenceAuthority'), true, 'Studio page should use studio persistence authority');
  assert.equal(studioPageText.includes('const saveMapMut = useMutation('), false, 'Studio page should not own map save mutation');
  assert.equal(studioPageText.includes('const saveEditsMut = useMutation('), false, 'Studio page should not own drafts save mutation');
  assert.equal(studioPageText.includes('/save-drafts'), false, 'Studio page should not directly own save-drafts route usage');
  assert.equal(studioPageText.includes('api.put<unknown>(`/studio/${category}/field-studio-map`'), false, 'Studio page should not directly own field-studio-map write route usage');
});
