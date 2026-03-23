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
} from '../../src/features/catalog/contracts/catalogShapes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../tools/gui-react/src/types/product.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

function extractInterfaceKeys(source, interfaceName) {
  const pattern = new RegExp(
    `(?:export\\s+)?interface\\s+${interfaceName}\\s*(?:extends\\s+([^{]+))?\\{`,
  );
  const match = source.match(pattern);
  if (!match) return null;

  const keys = [];
  if (match[1]) {
    const parents = match[1].split(',').map((p) => p.trim()).filter(Boolean);
    for (const parent of parents) {
      const parentKeys = extractInterfaceKeys(source, parent);
      if (parentKeys) keys.push(...parentKeys);
    }
  }

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let blockEnd = startIdx;
  for (let i = startIdx; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    if (depth === 0) blockEnd = i;
  }

  const block = source.slice(startIdx, blockEnd);
  let nestedDepth = 0;
  for (const line of block.split('\n')) {
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') nestedDepth++;
      if (ch === '}' || ch === ']' || ch === ')') nestedDepth = Math.max(0, nestedDepth - 1);
    }
    if (nestedDepth <= 1) {
      const fieldMatch = line.match(/^\s{2}(\w+)\??:/);
      if (fieldMatch) keys.push(fieldMatch[1]);
    }
  }
  return keys;
}

function assertContractKeysInInterface(contractKeys, interfaceName) {
  const tsKeys = extractInterfaceKeys(typesSource, interfaceName);
  ok(tsKeys !== null, `interface ${interfaceName} not found in product.ts`);
  const tsKeySet = new Set(tsKeys);
  const missing = contractKeys.filter((k) => !tsKeySet.has(k));
  ok(
    missing.length === 0,
    `${interfaceName} is missing contract keys: [${missing.join(', ')}]`,
  );
}

describe('catalogShapeAlignment', () => {
  it('CatalogProduct contains all CATALOG_PRODUCT_KEYS', () => {
    assertContractKeysInInterface(CATALOG_PRODUCT_KEYS, 'CatalogProduct');
  });

  it('CatalogRow contains all CATALOG_ROW_KEYS', () => {
    assertContractKeysInInterface(CATALOG_ROW_KEYS, 'CatalogRow');
  });

  it('Brand contains all BRAND_KEYS', () => {
    assertContractKeysInInterface(BRAND_KEYS, 'Brand');
  });
});
