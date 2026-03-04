import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime settings hydration in IndexingPage is domain-driven through shared binding helpers', () => {
  const indexingPageText = readText(INDEXING_PAGE);

  assert.equal(
    indexingPageText.includes('createRuntimeHydrationBindings({'),
    true,
    'IndexingPage should create hydration bindings through shared runtime domain helper',
  );
  assert.equal(
    indexingPageText.includes('const runtimeHydrationBindings = useMemo('),
    true,
    'IndexingPage should keep a single hydration binding contract reference',
  );
  assert.equal(
    indexingPageText.includes('hydrateRuntimeSettingsFromBindings('),
    true,
    'IndexingPage should hydrate runtime settings through shared runtime domain hydrator',
  );
  assert.equal(
    indexingPageText.includes('const runtimeStringHydrationBindings = useMemo(() => (['),
    false,
    'IndexingPage should not keep page-local string binding tables once extracted',
  );
  assert.equal(
    indexingPageText.includes('const runtimeNumberHydrationBindings = useMemo(() => (['),
    false,
    'IndexingPage should not keep page-local number binding tables once extracted',
  );
  assert.equal(
    indexingPageText.includes('const runtimeBooleanHydrationBindings = useMemo(() => (['),
    false,
    'IndexingPage should not keep page-local boolean binding tables once extracted',
  );
});
