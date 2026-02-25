import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CATEGORY_COMPILE = path.resolve('src/ingest/categoryCompile.js');
const REVIEW_GRID_DATA = path.resolve('src/review/reviewGridData.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('category compile emits canonical field_studio_hints without legacy excel_hints output', () => {
  const source = readText(CATEGORY_COMPILE);
  assert.equal(
    source.includes('field_studio_hints: fieldStudioHints,'),
    true,
    'compiled field rules should emit canonical field_studio_hints',
  );
  assert.equal(
    source.includes('excel_hints:'),
    false,
    'compiled field rules should not emit legacy excel_hints',
  );
});

test('review layout hint extraction reads field_studio hints only', () => {
  const source = readText(REVIEW_GRID_DATA);
  const fieldStudioIndex = source.indexOf('rule.field_studio_hints');
  assert.equal(fieldStudioIndex >= 0, true, 'review layout should read canonical field_studio_hints');
  assert.equal(source.includes('rule.excel_hints'), false, 'review layout should not read legacy excel_hints');
  assert.equal(source.includes('rule.excel'), false, 'review layout should not read legacy excel block');
});
