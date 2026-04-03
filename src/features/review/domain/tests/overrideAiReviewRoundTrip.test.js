import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../../../db/specDb.js';
import { readOverrideFile } from '../overrideHelpers.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function seedOverrideFixture(db, { productId, fieldKey, candidateId, aiReview }) {
  // Insert product
  db.upsertProduct({ category: 'mouse', product_id: productId, brand: 'Test', model: 'M1' });

  // Insert candidate
  db.insertCandidate({
    candidate_id: candidateId,
    category: 'mouse',
    product_id: productId,
    field_key: fieldKey,
    value: 'test-value',
    source: 'pipeline',
    host: 'example.com',
    method: 'css',
  });

  // Insert overridden item_field_state
  db.upsertItemFieldState({
    productId,
    fieldKey,
    value: 'test-value',
    confidence: 1.0,
    source: 'override',
    acceptedCandidateId: candidateId,
    overridden: true,
    needsAiReview: false,
    aiReviewComplete: true,
    overrideSource: 'candidate_selection',
    overrideValue: 'test-value',
    overriddenAt: '2026-04-01T00:00:00.000Z',
  });

  // Insert product review state
  db.upsertProductReviewState({
    productId,
    reviewStatus: 'approved',
    reviewStartedAt: '2026-04-01T00:00:00.000Z',
    reviewedAt: '2026-04-01T01:00:00.000Z',
  });

  // Insert candidate review with AI state
  if (aiReview) {
    db.upsertReview({
      candidateId,
      contextType: 'item',
      contextId: productId,
      humanAccepted: true,
      humanAcceptedAt: '2026-04-01T00:00:00.000Z',
      aiReviewStatus: aiReview.ai_review_status || 'not_run',
      aiConfidence: aiReview.ai_confidence ?? null,
      aiReason: aiReview.ai_reason ?? null,
      aiReviewedAt: aiReview.ai_reviewed_at ?? null,
      aiReviewModel: aiReview.ai_review_model ?? null,
      humanOverrideAi: Boolean(aiReview.human_override_ai),
      humanOverrideAiAt: aiReview.human_override_ai_at ?? null,
    });
  } else {
    db.upsertReview({
      candidateId,
      contextType: 'item',
      contextId: productId,
      humanAccepted: true,
      humanAcceptedAt: '2026-04-01T00:00:00.000Z',
      aiReviewStatus: 'not_run',
      humanOverrideAi: false,
    });
  }
}

// ── readOverrideFile AI review ──────────────────────────────────────────────

describe('readOverrideFile AI review state', () => {
  test('includes ai_review when candidate has AI review state', async () => {
    const db = createHarness();
    try {
      seedOverrideFixture(db, {
        productId: 'mouse-test-01',
        fieldKey: 'weight',
        candidateId: 'cand-001',
        aiReview: {
          ai_review_status: 'accepted',
          ai_confidence: 0.92,
          ai_reason: 'Strong evidence from multiple sources',
          ai_reviewed_at: '2026-04-01T00:30:00.000Z',
          ai_review_model: 'claude-3-5-sonnet',
        },
      });

      const envelope = await readOverrideFile(null, { specDb: db, category: 'mouse', productId: 'mouse-test-01' });
      assert.ok(envelope);
      const weightOverride = envelope.overrides.weight;
      assert.ok(weightOverride);
      assert.ok(weightOverride.ai_review, 'ai_review sub-object should exist');
      assert.equal(weightOverride.ai_review.ai_review_status, 'accepted');
      assert.equal(weightOverride.ai_review.ai_confidence, 0.92);
      assert.equal(weightOverride.ai_review.ai_reason, 'Strong evidence from multiple sources');
      assert.equal(weightOverride.ai_review.ai_review_model, 'claude-3-5-sonnet');
    } finally {
      db.close();
    }
  });

  test('omits ai_review when status is not_run', async () => {
    const db = createHarness();
    try {
      seedOverrideFixture(db, {
        productId: 'mouse-test-02',
        fieldKey: 'dpi',
        candidateId: 'cand-002',
        aiReview: null,
      });

      const envelope = await readOverrideFile(null, { specDb: db, category: 'mouse', productId: 'mouse-test-02' });
      assert.ok(envelope);
      const dpiOverride = envelope.overrides.dpi;
      assert.ok(dpiOverride);
      assert.equal(dpiOverride.ai_review, undefined, 'ai_review should not exist when not_run');
    } finally {
      db.close();
    }
  });

  test('includes human_override_ai fields when human overrode AI', async () => {
    const db = createHarness();
    try {
      seedOverrideFixture(db, {
        productId: 'mouse-test-03',
        fieldKey: 'sensor',
        candidateId: 'cand-003',
        aiReview: {
          ai_review_status: 'rejected',
          ai_confidence: 0.4,
          ai_reason: 'Insufficient evidence',
          ai_reviewed_at: '2026-04-01T00:30:00.000Z',
          ai_review_model: 'claude-3-5-sonnet',
          human_override_ai: true,
          human_override_ai_at: '2026-04-01T01:00:00.000Z',
        },
      });

      const envelope = await readOverrideFile(null, { specDb: db, category: 'mouse', productId: 'mouse-test-03' });
      const sensorOverride = envelope.overrides.sensor;
      assert.ok(sensorOverride.ai_review);
      assert.equal(sensorOverride.ai_review.human_override_ai, true);
      assert.equal(sensorOverride.ai_review.human_override_ai_at, '2026-04-01T01:00:00.000Z');
    } finally {
      db.close();
    }
  });
});

// ── seed.js import (AI review round-trip) ───────────────────────────────────

describe('seed.js AI review import from override file', () => {
  test('seed import restores AI review fields from ai_review block', () => {
    const db = createHarness();
    try {
      // Insert candidate first (required FK)
      db.insertCandidate({
        candidate_id: 'cand-seed-01',
        category: 'mouse',
        product_id: 'mouse-seed-01',
        field_key: 'weight',
        value: '80g',
        source: 'pipeline',
        host: 'example.com',
        method: 'css',
      });

      // Simulate what seed.js does with the override ai_review block
      const ovr = {
        ai_review: {
          ai_review_status: 'accepted',
          ai_confidence: 0.95,
          ai_reason: 'Verified by multiple sources',
          ai_reviewed_at: '2026-04-01T00:30:00.000Z',
          ai_review_model: 'gemini-2.0-flash',
          human_override_ai: false,
          human_override_ai_at: null,
        },
      };
      const aiReview = ovr.ai_review || {};
      db.upsertReview({
        candidateId: 'cand-seed-01',
        contextType: 'item',
        contextId: 'mouse-seed-01',
        humanAccepted: true,
        humanAcceptedAt: '2026-04-01T00:00:00.000Z',
        aiReviewStatus: aiReview.ai_review_status || 'not_run',
        aiConfidence: aiReview.ai_confidence ?? null,
        aiReason: aiReview.ai_reason ?? null,
        aiReviewedAt: aiReview.ai_reviewed_at ?? null,
        aiReviewModel: aiReview.ai_review_model ?? null,
        humanOverrideAi: Boolean(aiReview.human_override_ai),
        humanOverrideAiAt: aiReview.human_override_ai_at ?? null,
      });

      // Verify the review was stored with AI fields
      const review = db.getReviewsForContext('item', 'mouse-seed-01')[0];
      assert.ok(review);
      assert.equal(review.ai_review_status, 'accepted');
      assert.equal(review.ai_confidence, 0.95);
      assert.equal(review.ai_reason, 'Verified by multiple sources');
      assert.equal(review.ai_review_model, 'gemini-2.0-flash');
    } finally {
      db.close();
    }
  });

  test('seed import handles missing ai_review block (backward compat)', () => {
    const db = createHarness();
    try {
      db.insertCandidate({
        candidate_id: 'cand-seed-02',
        category: 'mouse',
        product_id: 'mouse-seed-02',
        field_key: 'dpi',
        value: '25600',
        source: 'pipeline',
        host: 'example.com',
        method: 'css',
      });

      // Old override file with no ai_review block
      const ovr = {};
      const aiReview = ovr.ai_review || {};
      db.upsertReview({
        candidateId: 'cand-seed-02',
        contextType: 'item',
        contextId: 'mouse-seed-02',
        humanAccepted: true,
        humanAcceptedAt: '2026-04-01T00:00:00.000Z',
        aiReviewStatus: aiReview.ai_review_status || 'not_run',
        aiConfidence: aiReview.ai_confidence ?? null,
        aiReason: aiReview.ai_reason ?? null,
        aiReviewedAt: aiReview.ai_reviewed_at ?? null,
        aiReviewModel: aiReview.ai_review_model ?? null,
        humanOverrideAi: Boolean(aiReview.human_override_ai),
        humanOverrideAiAt: aiReview.human_override_ai_at ?? null,
      });

      const review = db.getReviewsForContext('item', 'mouse-seed-02')[0];
      assert.ok(review);
      assert.equal(review.ai_review_status, 'not_run');
      assert.equal(review.ai_confidence, null);
    } finally {
      db.close();
    }
  });
});
