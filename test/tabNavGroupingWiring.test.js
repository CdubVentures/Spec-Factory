import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TAB_NAV_PATH = path.resolve('tools/gui-react/src/components/layout/TabNav.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('main-header tab grouping keeps product paired with overview and catalog paired with categories', () => {
  const text = readText(TAB_NAV_PATH);

  const overviewIndex = text.indexOf("label: 'Overview'");
  const selectedProductIndex = text.indexOf("label: 'Selected Product'");
  const categoriesIndex = text.indexOf("label: 'Categories'");
  const catalogIndex = text.indexOf("label: 'Catalog'");

  assert.notEqual(overviewIndex, -1, 'Overview tab should exist');
  assert.notEqual(selectedProductIndex, -1, 'Selected Product tab should exist');
  assert.notEqual(categoriesIndex, -1, 'Categories tab should exist');
  assert.notEqual(catalogIndex, -1, 'Catalog tab should exist');

  assert.equal(
    overviewIndex < selectedProductIndex,
    true,
    'Selected Product should be grouped immediately after Overview',
  );
  assert.equal(
    selectedProductIndex < categoriesIndex,
    true,
    'Categories group should come after the Overview + Selected Product group',
  );
  assert.equal(
    categoriesIndex < catalogIndex,
    true,
    'Catalog should remain grouped with Categories',
  );

  assert.equal(
    /path:\s*'\/product'[\s\S]*?label:\s*'Selected Product'[\s\S]*?dividerAfter:\s*true/.test(text),
    true,
    'Selected Product group should end with a divider',
  );
  assert.equal(
    /path:\s*'\/catalog'[\s\S]*?label:\s*'Catalog'[\s\S]*?dividerAfter:\s*true/.test(text),
    true,
    'Categories + Catalog group should end with a divider',
  );
});

test('main-header tab active styling matches studio tab accent-blue contract', () => {
  const text = readText(TAB_NAV_PATH);

  assert.equal(
    text.includes("const activeCls = 'border-accent text-accent';"),
    true,
    'main header tabs should use the same accent-blue active contract as studio tabs',
  );
  assert.equal(
    text.includes("const activeCls = 'border-indigo-500 dark:border-indigo-300 text-slate-900 dark:text-slate-100';"),
    false,
    'main header tabs should not keep the old indigo/slate active class bundle',
  );
});

test('main-header tab container uses studio bottom border token contract', () => {
  const text = readText(TAB_NAV_PATH);

  assert.equal(
    text.includes("const borderCls = 'border-b sf-border-default';"),
    true,
    'main header nav should use the same bottom border token contract as studio tabs',
  );
  assert.equal(
    text.includes("'border-b-2 border-indigo-300/60'"),
    false,
    'main header nav should not use test-mode-only indigo border styling',
  );
  assert.equal(
    text.includes("'border-b border-white/10'"),
    false,
    'main header nav should not use the old white/10 border styling',
  );
});
