// WHY: Contract test verifying TS interfaces in types/componentReview.ts
// declare every field from the canonical component review shape descriptors.

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPONENT_REVIEW_ITEM_KEYS,
  COMPONENT_REVIEW_PAYLOAD_KEYS,
  COMPONENT_REVIEW_LAYOUT_KEYS,
  ENUM_VALUE_REVIEW_ITEM_KEYS,
  ENUM_FIELD_REVIEW_KEYS,
  ENUM_REVIEW_PAYLOAD_KEYS,
  COMPONENT_REVIEW_FLAGGED_ITEM_KEYS,
  COMPONENT_REVIEW_DOCUMENT_KEYS,
  COMPONENT_REVIEW_BATCH_RESULT_KEYS,
} from '../componentReviewShapes.js';
import { assertContractKeysInInterface } from '../../../../shared/tests/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/componentReview.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('componentReviewShapeAlignment', () => {
  it('ComponentReviewItem contains all COMPONENT_REVIEW_ITEM_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_REVIEW_ITEM_KEYS, 'ComponentReviewItem');
  });

  it('ComponentReviewPayload contains all COMPONENT_REVIEW_PAYLOAD_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_REVIEW_PAYLOAD_KEYS, 'ComponentReviewPayload');
  });

  it('ComponentReviewLayout contains all COMPONENT_REVIEW_LAYOUT_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_REVIEW_LAYOUT_KEYS, 'ComponentReviewLayout');
  });

  it('EnumValueReviewItem contains all ENUM_VALUE_REVIEW_ITEM_KEYS', () => {
    assertContractKeysInInterface(typesSource, ENUM_VALUE_REVIEW_ITEM_KEYS, 'EnumValueReviewItem');
  });

  it('EnumFieldReview contains all ENUM_FIELD_REVIEW_KEYS', () => {
    assertContractKeysInInterface(typesSource, ENUM_FIELD_REVIEW_KEYS, 'EnumFieldReview');
  });

  it('EnumReviewPayload contains all ENUM_REVIEW_PAYLOAD_KEYS', () => {
    assertContractKeysInInterface(typesSource, ENUM_REVIEW_PAYLOAD_KEYS, 'EnumReviewPayload');
  });

  it('ComponentReviewFlaggedItem contains all COMPONENT_REVIEW_FLAGGED_ITEM_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_REVIEW_FLAGGED_ITEM_KEYS, 'ComponentReviewFlaggedItem');
  });

  it('ComponentReviewDocument contains all COMPONENT_REVIEW_DOCUMENT_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_REVIEW_DOCUMENT_KEYS, 'ComponentReviewDocument');
  });

  it('ComponentReviewBatchResult contains all COMPONENT_REVIEW_BATCH_RESULT_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_REVIEW_BATCH_RESULT_KEYS, 'ComponentReviewBatchResult');
  });
});
