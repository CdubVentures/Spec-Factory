import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CATALOG_ENTRY = path.resolve('src/features/catalog/index.js');

test('catalog feature contract exports canonical identity capabilities after compatibility retirement', async () => {
  const catalog = await import(pathToFileURL(CATALOG_ENTRY).href);

  assert.equal(typeof catalog.resolveProductIdentity, 'function');
  assert.equal(typeof catalog.resolveAuthoritativeProductIdentity, 'function');
  assert.equal(typeof catalog.inferIdentityFromProductId, 'function');
  // WHY: loadProductCatalog retired — product.json is the sole disk SSOT, SQL is cache.
  assert.equal(catalog.loadProductCatalog, undefined);
});
