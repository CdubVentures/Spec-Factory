import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CATALOG_IDENTITY_ENTRY = path.resolve('src/features/catalog-identity/index.js');
const CATALOG_ROUTES = path.resolve('src/api/routes/catalogRoutes.js');
const REVIEW_ROUTES = path.resolve('src/api/routes/reviewRoutes.js');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('catalog-identity feature contract exports canonical identity capabilities', async () => {
  assert.equal(fs.existsSync(CATALOG_IDENTITY_ENTRY), true, 'feature entrypoint should exist');
  const catalogIdentity = await import(pathToFileURL(CATALOG_IDENTITY_ENTRY).href);

  assert.equal(typeof catalogIdentity.resolveProductIdentity, 'function');
  assert.equal(typeof catalogIdentity.resolveAuthoritativeProductIdentity, 'function');
  assert.equal(typeof catalogIdentity.inferIdentityFromProductId, 'function');
  assert.equal(typeof catalogIdentity.loadProductCatalog, 'function');
});

test('catalog and review routes consume resolveProductIdentity via catalog-identity feature contract', () => {
  const catalogRoutesText = readText(CATALOG_ROUTES);
  const reviewRoutesText = readText(REVIEW_ROUTES);

  assert.equal(
    catalogRoutesText.includes("from '../../features/catalog-identity/index.js'"),
    true,
    'catalog routes should import identity resolver from feature contract',
  );
  assert.equal(
    reviewRoutesText.includes("from '../../features/catalog-identity/index.js'"),
    true,
    'review routes should import identity resolver from feature contract',
  );
});
