import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  normalizeCategoryToken,
  createCategoryAliasResolver,
} from '../src/app/api/categoryAlias.js';

test('normalizeCategoryToken canonicalizes casing and separators', () => {
  assert.equal(normalizeCategoryToken(' Mouse Pro '), 'mouse_pro');
  assert.equal(normalizeCategoryToken('test-Mouse  '), 'test_mouse');
  assert.equal(normalizeCategoryToken('_test_mouse'), '_test_mouse');
  assert.equal(normalizeCategoryToken(''), '');
});

test('category alias resolver redirects test_ aliases to canonical underscored category when needed', () => {
  const helperRoot = path.join('C:', 'category_authority');
  const existing = new Set([
    path.join(helperRoot, '_test_mouse'),
    path.join(helperRoot, 'test_keyboard'),
  ]);

  const resolveCategoryAlias = createCategoryAliasResolver({
    helperRoot,
    path,
    existsSync: (targetPath) => existing.has(targetPath),
  });

  assert.equal(resolveCategoryAlias('test_mouse'), '_test_mouse');
  assert.equal(resolveCategoryAlias('test_keyboard'), 'test_keyboard');
  assert.equal(resolveCategoryAlias('_test_runtime'), '_test_runtime');
  assert.equal(resolveCategoryAlias('mouse'), 'mouse');
});
