// WHY: Contract test verifying that the generated TS interfaces in product.generated.ts
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
import { extractInterfaceKeys, assertContractKeysInInterface } from '../../../../shared/tests/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/product.generated.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('catalogShapeAlignment', () => {
  it('CatalogProductGen contains all CATALOG_PRODUCT_KEYS', () => {
    assertContractKeysInInterface(typesSource, CATALOG_PRODUCT_KEYS, 'CatalogProductGen');
  });

  it('CatalogRowGen contains all CATALOG_ROW_KEYS', () => {
    assertContractKeysInInterface(typesSource, CATALOG_ROW_KEYS, 'CatalogRowGen');
  });

  it('CatalogRowGen must NOT contain CatalogProduct-only keys', () => {
    const catalogOnlyKeys = CATALOG_PRODUCT_KEYS.filter(
      (k) => !CATALOG_ROW_KEYS.includes(k),
    );
    ok(catalogOnlyKeys.length > 0, 'CATALOG_PRODUCT_KEYS should have keys absent from CATALOG_ROW_KEYS');
    const tsKeys = extractInterfaceKeys(typesSource, 'CatalogRowGen');
    ok(tsKeys !== null, 'interface CatalogRowGen not found in product.generated.ts');
    const tsKeySet = new Set(tsKeys);
    const leaked = catalogOnlyKeys.filter((k) => tsKeySet.has(k));
    ok(
      leaked.length === 0,
      `CatalogRowGen must not contain CatalogProduct-only keys: [${leaked.join(', ')}]`,
    );
  });

  it('BrandGen contains all BRAND_KEYS', () => {
    assertContractKeysInInterface(typesSource, BRAND_KEYS, 'BrandGen');
  });
});
