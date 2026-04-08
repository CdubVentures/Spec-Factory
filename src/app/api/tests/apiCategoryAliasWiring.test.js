import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  normalizeCategoryToken,
  createCategoryAliasResolver,
} from '../categoryAlias.js';

test('normalizeCategoryToken canonicalizes casing and separators', () => {
  const cases = [
    [' Mouse Pro ', 'mouse_pro'],
    ['Mouse!!!__', 'mouse'],
    [null, ''],
    ['', ''],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeCategoryToken(input), expected);
  }
});

test('category alias resolver leaves non-test categories untouched', () => {
  const helperRoot = path.join('C:', 'category_authority');
  const existing = new Set([
    path.join(helperRoot, 'test_headset'),
    path.join(helperRoot, 'test_keyboard'),
  ]);

  const resolveCategoryAlias = createCategoryAliasResolver({
    helperRoot,
    path,
    existsSync: (targetPath) => existing.has(targetPath),
  });

  const cases = [
    ['test_keyboard', 'test_keyboard'],
    ['test_headset', 'test_headset'],
    ['test_ghost', 'test_ghost'],
    ['mouse', 'mouse'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(resolveCategoryAlias(input), expected);
  }
});
