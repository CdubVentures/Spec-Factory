// WHY: Contract test for product types NOT covered by catalogShapeAlignment.
// Generated types (ProductSummary, QueueProduct) verified against product.generated.ts.
// Manual types (BrandMutationResult, BrandImpactAnalysis) verified against product.ts.

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
import { assertContractKeysInInterface } from '../../../../shared/tests/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/product.generated.ts');
const MANUAL_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/product.ts');
const generatedSource = readFileSync(GENERATED_PATH, 'utf8');
const manualSource = readFileSync(MANUAL_PATH, 'utf8');

describe('productShapeAlignment', () => {
  it('ProductSummaryGen contains all PRODUCT_SUMMARY_KEYS', () => {
    assertContractKeysInInterface(generatedSource, PRODUCT_SUMMARY_KEYS, 'ProductSummaryGen');
  });

  it('QueueProductGen contains all QUEUE_PRODUCT_KEYS', () => {
    assertContractKeysInInterface(generatedSource, QUEUE_PRODUCT_KEYS, 'QueueProductGen');
  });

  it('BrandMutationResult contains all BRAND_MUTATION_RESULT_KEYS', () => {
    assertContractKeysInInterface(manualSource, BRAND_MUTATION_RESULT_KEYS, 'BrandMutationResult');
  });

  it('BrandImpactAnalysis contains all BRAND_IMPACT_ANALYSIS_KEYS', () => {
    assertContractKeysInInterface(manualSource, BRAND_IMPACT_ANALYSIS_KEYS, 'BrandImpactAnalysis');
  });
});
