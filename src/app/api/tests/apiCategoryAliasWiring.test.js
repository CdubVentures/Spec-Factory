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
    ['test-Mouse  ', 'test_mouse'],
    ['_test_mouse', '_test_mouse'],
    ['Mouse!!!__', 'mouse'],
    [null, ''],
    ['', ''],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeCategoryToken(input), expected);
  }
});

test('category alias resolver redirects test_ aliases to canonical underscored category when needed', () => {
  const helperRoot = path.join('C:', 'category_authority');
  const existing = new Set([
    path.join(helperRoot, '_test_mouse'),
    path.join(helperRoot, 'test_headset'),
    path.join(helperRoot, '_test_headset'),
    path.join(helperRoot, 'test_keyboard'),
  ]);

  const resolveCategoryAlias = createCategoryAliasResolver({
    helperRoot,
    path,
    existsSync: (targetPath) => existing.has(targetPath),
  });

  const cases = [
    ['test_mouse', '_test_mouse'],
    ['Test Mouse', '_test_mouse'],
    ['test_keyboard', 'test_keyboard'],
    ['test_headset', 'test_headset'],
    ['test_ghost', 'test_ghost'],
    ['_test_runtime', '_test_runtime'],
    ['mouse', 'mouse'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(resolveCategoryAlias(input), expected);
  }
});
