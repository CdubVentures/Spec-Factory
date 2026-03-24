// WHY: Contract test for product types NOT covered by catalogShapeAlignment.
// ProductSummary, QueueProduct, BrandMutationResult, BrandImpactAnalysis.

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRODUCT_SUMMARY_KEYS,
  QUEUE_PRODUCT_KEYS,
  BRAND_MUTATION_RESULT_KEYS,
  BRAND_IMPACT_ANALYSIS_KEYS,
} from '../productShapes.js';
import { assertContractKeysInInterface } from '../../../../../test/contracts/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/product.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('productShapeAlignment', () => {
  it('ProductSummary contains all PRODUCT_SUMMARY_KEYS', () => {
    assertContractKeysInInterface(typesSource, PRODUCT_SUMMARY_KEYS, 'ProductSummary');
  });

  it('QueueProduct contains all QUEUE_PRODUCT_KEYS', () => {
    assertContractKeysInInterface(typesSource, QUEUE_PRODUCT_KEYS, 'QueueProduct');
  });

  it('BrandMutationResult contains all BRAND_MUTATION_RESULT_KEYS', () => {
    assertContractKeysInInterface(typesSource, BRAND_MUTATION_RESULT_KEYS, 'BrandMutationResult');
  });

  it('BrandImpactAnalysis contains all BRAND_IMPACT_ANALYSIS_KEYS', () => {
    assertContractKeysInInterface(typesSource, BRAND_IMPACT_ANALYSIS_KEYS, 'BrandImpactAnalysis');
  });
});
