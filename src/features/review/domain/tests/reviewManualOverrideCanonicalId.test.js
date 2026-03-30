import test from 'node:test';
import assert from 'node:assert/strict';

import { buildManualOverrideCandidateId } from '../../../../utils/candidateIdentifier.js';
import { setManualOverride } from '../overrideWorkflow.js';
import {
  createReviewOverrideHarness,
  readOverridePayload,
} from './helpers/reviewOverrideHarness.js';

test('setManualOverride writes a canonical manual override candidate id', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'mouse-review-manual',
  });
  const { storage, config, category, productId, specDb } = harness;

  const manual = await setManualOverride({
    storage,
    config,
    category,
    productId,
    specDb,
    field: 'weight',
    value: '59',
    reason: 'Official spec table',
    reviewer: 'reviewer_1',
    evidence: {
      url: 'https://manufacturer.example/spec',
      quote: 'Weight: 59 g',
      quote_span: [0, 12],
    },
  });

  const overridePayload = await readOverridePayload(harness);
  assert.equal(
    manual.candidate_id,
    buildManualOverrideCandidateId({
      category,
      productId,
      fieldKey: 'weight',
      value: '59',
      evidenceUrl: 'https://manufacturer.example/spec',
      evidenceQuote: 'Weight: 59 g',
    }),
  );
  assert.equal(overridePayload.overrides.weight.override_source, 'manual_entry');
  assert.equal(
    overridePayload.overrides.weight.override_provenance.url,
    'https://manufacturer.example/spec',
  );
  assert.equal(overridePayload.overrides.weight.override_value, '59');
});
