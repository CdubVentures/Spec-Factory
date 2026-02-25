import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime settings hydration in IndexingPage is binding-driven (single wiring path)', () => {
  const indexingPageText = readText(INDEXING_PAGE);

  assert.equal(
    indexingPageText.includes('const runtimeStringHydrationBindings = useMemo(() => (['),
    true,
    'IndexingPage should define string runtime hydration bindings',
  );
  assert.equal(
    indexingPageText.includes('const runtimeNumberHydrationBindings = useMemo(() => (['),
    true,
    'IndexingPage should define number runtime hydration bindings',
  );
  assert.equal(
    indexingPageText.includes('const runtimeBooleanHydrationBindings = useMemo(() => (['),
    true,
    'IndexingPage should define boolean runtime hydration bindings',
  );
  assert.match(
    indexingPageText,
    /for \(const binding of runtimeStringHydrationBindings\)/,
    'IndexingPage should hydrate string runtime settings by iterating shared binding metadata',
  );
  assert.match(
    indexingPageText,
    /for \(const binding of runtimeNumberHydrationBindings\)/,
    'IndexingPage should hydrate numeric runtime settings by iterating shared binding metadata',
  );
  assert.match(
    indexingPageText,
    /for \(const binding of runtimeBooleanHydrationBindings\)/,
    'IndexingPage should hydrate boolean runtime settings by iterating shared binding metadata',
  );
  assert.equal(
    indexingPageText.includes("if (typeof d.profile === 'string' && d.profile) setProfile"),
    false,
    'IndexingPage should avoid hand-written per-key hydration branches that drift over time',
  );
});
