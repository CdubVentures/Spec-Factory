import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve('src');
const LEGACY_SHIMS = [
  path.resolve('src/ingest/excelSeed.js'),
  path.resolve('src/ingest/excelCategorySync.js'),
  path.resolve('src/catalog/workbookProductLoader.js'),
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listSourceFiles(dirPath) {
  const out = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!fullPath.endsWith('.js') && !fullPath.endsWith('.mjs')) continue;
      out.push(fullPath);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

test('runtime contract surfaces do not contain legacy excel hint tokens', () => {
  const targets = [
    path.resolve('src/ingest/categoryCompile.js'),
    path.resolve('src/review/reviewGridData.js'),
  ];
  for (const filePath of targets) {
    const source = readText(filePath);
    assert.equal(
      source.includes('excel_hints'),
      false,
      `${path.relative(process.cwd(), filePath)} should not contain excel_hints`,
    );
    assert.equal(
      source.includes('rule.excel'),
      false,
      `${path.relative(process.cwd(), filePath)} should not read rule.excel compatibility blocks`,
    );
  }
});

test('runtime source files do not import excel shim modules directly', () => {
  const bannedImportTokens = [
    "from './excelSeed.js'",
    "from '../ingest/excelSeed.js'",
    "from './excelCategorySync.js'",
    "from '../ingest/excelCategorySync.js'",
    "from './workbookProductLoader.js'",
    "from '../catalog/workbookProductLoader.js'",
  ];
  const sourceFiles = listSourceFiles(SRC_ROOT);
  const offenders = [];
  for (const filePath of sourceFiles) {
    const source = readText(filePath);
    for (const token of bannedImportTokens) {
      if (source.includes(token)) {
        offenders.push(`${path.relative(process.cwd(), filePath)} => ${token}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('legacy workbook/excel shim modules are removed', () => {
  for (const shimPath of LEGACY_SHIMS) {
    assert.equal(
      fs.existsSync(shimPath),
      false,
      `${path.relative(process.cwd(), shimPath)} should be removed`,
    );
  }
});

test('canonical modules do not expose legacy workbook/excel alias exports', () => {
  const catalogSeedSource = readText(path.resolve('src/ingest/catalogSeed.js'));
  assert.equal(catalogSeedSource.includes('extractExcelSeedData'), false);
  assert.equal(catalogSeedSource.includes('buildFieldOrderFromExcelSeed'), false);
  assert.equal(catalogSeedSource.includes('syncJobsFromExcelSeed'), false);

  const schemaSyncSource = readText(path.resolve('src/ingest/categorySchemaSync.js'));
  assert.equal(schemaSyncSource.includes('syncCategorySchemaFromExcel'), false);

  const catalogLoaderSource = readText(path.resolve('src/catalog/catalogProductLoader.js'));
  assert.equal(catalogLoaderSource.includes('loadWorkbookProducts'), false);
  assert.equal(catalogLoaderSource.includes('loadWorkbookProductsWithFields'), false);
});
