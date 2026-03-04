import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('run-id timestamp sanitizer avoids regex literal that tailwind content scan mis-parses as arbitrary class', () => {
  const text = readText(INDEXING_PAGE);

  assert.equal(
    text.includes('replace(/[-:.TZ]/g, \'\')'),
    false,
    'IndexingPage should avoid /[-:.TZ]/g literal so tailwind does not emit invalid arbitrary class css',
  );
  assert.equal(
    text.includes(".split('-').join('')") &&
      text.includes(".split(':').join('')") &&
      text.includes(".split('.').join('')") &&
      text.includes(".split('T').join('')") &&
      text.includes(".split('Z').join('')"),
    true,
    'IndexingPage should use explicit split/join chain for run-id timestamp sanitization',
  );
});
