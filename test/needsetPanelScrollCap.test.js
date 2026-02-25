import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

test('NeedSet main rows table keeps capped height with internal scroll', () => {
  const source = readText('tools/gui-react/src/pages/indexing/panels/NeedSetPanel.tsx');

  const match = source.match(/<div className="([^"]+)">\s*<table className="min-w-full text-xs">/);
  assert.ok(match, 'NeedSet rows table container should exist');

  const classes = match[1];
  assert.match(classes, /\boverflow-x-auto\b/, 'NeedSet rows table should keep horizontal scroll');
  assert.match(classes, /\boverflow-y-auto\b/, 'NeedSet rows table should scroll vertically when capped');
  assert.match(classes, /\bmax-h-/, 'NeedSet rows table should keep a max height cap');
  assert.match(source, /onSortChange\('need_score'\)/, 'Need score header should remain present in the capped table');
});
