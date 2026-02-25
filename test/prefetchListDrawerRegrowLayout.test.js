import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

test('prefetch search profile uses content-sized detail drawer and tall capped list when detail opens', () => {
  const source = readText('tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchProfilePanel.tsx');

  assert.match(
    source,
    /<DrawerShell[\s\S]*className="max-h-none"[\s\S]*scrollContent=\{false\}/,
    'Search Profile detail drawer should size to content with no internal drawer scroller',
  );

  assert.match(
    source,
    /overflow-hidden overflow-x-auto overflow-y-auto \$\{selectedQuery \? 'max-h-\[50vh\]' : 'max-h-none'\}/,
    'Search Profile main list container should stay scrollable with a tall open-state cap',
  );
});

test('prefetch query journey uses content-sized detail drawer and tall capped list when detail opens', () => {
  const source = readText('tools/gui-react/src/pages/runtime-ops/panels/PrefetchQueryJourneyPanel.tsx');

  assert.match(
    source,
    /<DrawerShell[\s\S]*className="max-h-none"[\s\S]*scrollContent=\{false\}/,
    'Query Journey detail drawer should size to content with no internal drawer scroller',
  );

  assert.match(
    source,
    /overflow-hidden overflow-x-auto overflow-y-auto \$\{selectedRow \? 'max-h-\[50vh\]' : 'max-h-none'\}/,
    'Query Journey main list container should stay scrollable with a tall open-state cap',
  );
});
