// WHY: Contract test verifying that the TS interfaces in types/product.ts
// declare every field from the canonical catalog shape descriptors. If a shape
// key is missing from the TS interface, builders emit data the frontend ignores.
//
// Direction: contract keys ⊆ TS interface keys (superset check).

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATALOG_PRODUCT_KEYS,
  CATALOG_ROW_KEYS,
  BRAND_KEYS,
} from '../catalogShapes.js';
import { extractInterfaceKeys, assertContractKeysInInterface } from '../../../../../test/contracts/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/product.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('catalogShapeAlignment', () => {
  it('CatalogProduct contains all CATALOG_PRODUCT_KEYS', () => {
    assertContractKeysInInterface(typesSource, CATALOG_PRODUCT_KEYS, 'CatalogProduct');
  });

  it('CatalogRow contains all CATALOG_ROW_KEYS', () => {
    assertContractKeysInInterface(typesSource, CATALOG_ROW_KEYS, 'CatalogRow');
  });

  it('CatalogRow must NOT contain CatalogProduct-only keys', () => {
    // WHY: buildCatalog (GET /catalog/{cat}) never sends seed_urls, added_at,
    // added_by — those only come from the CRUD endpoint (GET /catalog/{cat}/products).
    // CatalogRow must be its own flat shape, not extending CatalogProduct.
    const catalogOnlyKeys = CATALOG_PRODUCT_KEYS.filter(
      (k) => !CATALOG_ROW_KEYS.includes(k),
    );
    ok(catalogOnlyKeys.length > 0, 'CATALOG_PRODUCT_KEYS should have keys absent from CATALOG_ROW_KEYS');
    const tsKeys = extractInterfaceKeys(typesSource, 'CatalogRow');
    ok(tsKeys !== null, 'interface CatalogRow not found in product.ts');
    const tsKeySet = new Set(tsKeys);
    const leaked = catalogOnlyKeys.filter((k) => tsKeySet.has(k));
    ok(
      leaked.length === 0,
      `CatalogRow must not contain CatalogProduct-only keys: [${leaked.join(', ')}]`,
    );
  });

  it('Brand contains all BRAND_KEYS', () => {
    assertContractKeysInInterface(typesSource, BRAND_KEYS, 'Brand');
  });
});
