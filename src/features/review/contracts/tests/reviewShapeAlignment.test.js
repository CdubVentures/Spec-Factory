// WHY: Contract test verifying that TS interfaces in types/review.ts
// declare every field from the canonical review shape descriptors.
// Direction: contract keys ⊆ TS interface keys (superset check).

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIELD_STATE_KEYS,
  FIELD_STATE_OPTIONAL_KEYS,
  REVIEW_CANDIDATE_KEYS,
  CANDIDATE_EVIDENCE_KEYS,
  KEY_REVIEW_LANE_KEYS,
  PRODUCT_REVIEW_PAYLOAD_KEYS,
  REVIEW_LAYOUT_ROW_KEYS,
  REVIEW_LAYOUT_KEYS,
  RUN_METRICS_KEYS,
  PRODUCTS_INDEX_RESPONSE_KEYS,
  CANDIDATE_RESPONSE_KEYS,
} from '../reviewFieldContract.js';
import { assertContractKeysInInterface } from '../../../../../test/contracts/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/review.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('reviewShapeAlignment', () => {
  it('FieldState contains all FIELD_STATE_KEYS + FIELD_STATE_OPTIONAL_KEYS', () => {
    assertContractKeysInInterface(
      typesSource,
      [...FIELD_STATE_KEYS, ...FIELD_STATE_OPTIONAL_KEYS],
      'FieldState',
    );
  });

  it('ReviewCandidate contains all REVIEW_CANDIDATE_KEYS', () => {
    assertContractKeysInInterface(typesSource, REVIEW_CANDIDATE_KEYS, 'ReviewCandidate');
  });

  it('CandidateEvidence contains all CANDIDATE_EVIDENCE_KEYS', () => {
    assertContractKeysInInterface(typesSource, CANDIDATE_EVIDENCE_KEYS, 'CandidateEvidence');
  });

  it('KeyReviewLaneState contains all KEY_REVIEW_LANE_KEYS', () => {
    assertContractKeysInInterface(typesSource, KEY_REVIEW_LANE_KEYS, 'KeyReviewLaneState');
  });

  it('ProductReviewPayload contains all PRODUCT_REVIEW_PAYLOAD_KEYS', () => {
    assertContractKeysInInterface(typesSource, PRODUCT_REVIEW_PAYLOAD_KEYS, 'ProductReviewPayload');
  });

  it('ReviewLayoutRow contains all REVIEW_LAYOUT_ROW_KEYS', () => {
    assertContractKeysInInterface(typesSource, REVIEW_LAYOUT_ROW_KEYS, 'ReviewLayoutRow');
  });

  it('ReviewLayout contains all REVIEW_LAYOUT_KEYS', () => {
    assertContractKeysInInterface(typesSource, REVIEW_LAYOUT_KEYS, 'ReviewLayout');
  });

  it('RunMetrics contains all RUN_METRICS_KEYS', () => {
    assertContractKeysInInterface(typesSource, RUN_METRICS_KEYS, 'RunMetrics');
  });

  it('ProductsIndexResponse contains all PRODUCTS_INDEX_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(typesSource, PRODUCTS_INDEX_RESPONSE_KEYS, 'ProductsIndexResponse');
  });

  it('CandidateResponse contains all CANDIDATE_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(typesSource, CANDIDATE_RESPONSE_KEYS, 'CandidateResponse');
  });
});
