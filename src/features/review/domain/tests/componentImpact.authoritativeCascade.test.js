import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
  loadQueueState,
  saveQueueState,
  upsertQueueRow,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange authoritative updates all linked items and marks queue stale via SpecDb', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-a',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-b',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    upsertQueueRow(harness.specDb, 'mouse-a', 'complete');
    upsertQueueRow(harness.specDb, 'mouse-b', 'pending');
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-a',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: 'mouse-a::max_dpi::legacy-candidate',
      overridden: false,
      needsAiReview: true,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-b',
      fieldKey: 'max_dpi',
      value: '25000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: 'mouse-b::max_dpi::legacy-candidate',
      overridden: false,
      needsAiReview: true,
      aiReviewComplete: false,
    });

    const result = await cascadeComponentChange({
      storage: harness.storage,
      outputRoot: harness.outputRoot,
      category: harness.category,
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      changedProperty: 'max_dpi',
      newValue: '35000',
      variancePolicy: 'authoritative',
      constraints: [],
      loadQueueState,
      saveQueueState,
      specDb: harness.specDb,
    });

    assert.equal(result.propagation?.action, 'value_pushed');

    const stateA = harness.specDb.getItemFieldState('mouse-a').find((row) => row.field_key === 'max_dpi');
    const stateB = harness.specDb.getItemFieldState('mouse-b').find((row) => row.field_key === 'max_dpi');
    assert.equal(stateA?.value, '35000');
    assert.equal(stateB?.value, '35000');
    assert.equal(stateA?.accepted_candidate_id, null);
    assert.equal(stateB?.accepted_candidate_id, null);

    const queueA = harness.specDb.getQueueProduct('mouse-a');
    const queueB = harness.specDb.getQueueProduct('mouse-b');
    assert.equal(queueA?.status, 'stale');
    assert.equal(queueB?.status, 'stale');
    assert.equal(Array.isArray(queueA?.dirty_flags), true);
    assert.equal(queueA?.dirty_flags?.some((flag) => flag.reason === 'component_change'), true);
  } finally {
    await cleanupHarness(harness);
  }
});

test('cascadeComponentChange authoritative updates linked items only and ignores unlinked value matches', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-linked-only',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-linked-only',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.9,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-unlinked-only',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 0.7,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-unlinked-only',
      fieldKey: 'max_dpi',
      value: '27000',
      confidence: 0.7,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    upsertQueueRow(harness.specDb, 'mouse-linked-only', 'complete');
    upsertQueueRow(harness.specDb, 'mouse-unlinked-only', 'complete');

    await cascadeComponentChange({
      storage: harness.storage,
      outputRoot: harness.outputRoot,
      category: harness.category,
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      changedProperty: 'max_dpi',
      newValue: '35000',
      variancePolicy: 'authoritative',
      constraints: [],
      loadQueueState,
      saveQueueState,
      specDb: harness.specDb,
    });

    const linked = harness.specDb.getItemFieldState('mouse-linked-only').find((row) => row.field_key === 'max_dpi');
    const unlinked = harness.specDb.getItemFieldState('mouse-unlinked-only').find((row) => row.field_key === 'max_dpi');
    assert.equal(linked?.value, '35000');
    assert.equal(unlinked?.value, '27000');

    const linkedQueue = harness.specDb.getQueueProduct('mouse-linked-only');
    const unlinkedQueue = harness.specDb.getQueueProduct('mouse-unlinked-only');
    assert.equal(linkedQueue?.status, 'stale');
    assert.equal(unlinkedQueue?.status, 'complete');
  } finally {
    await cleanupHarness(harness);
  }
});

test('evaluateConstraintsForLinkedProducts uses maker-specific component values for violations', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-c',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'focus-pro',
      componentMaker: 'MakerA',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-c',
      fieldKey: 'dpi',
      value: '1500',
      confidence: 0.9,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    harness.specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'focus-pro',
      componentMaker: 'MakerA',
      propertyKey: 'max_dpi',
      value: '1000',
      confidence: 1,
      variancePolicy: null,
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    harness.specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'focus-pro',
      componentMaker: 'MakerB',
      propertyKey: 'max_dpi',
      value: '3000',
      confidence: 1,
      variancePolicy: null,
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });

    const result = harness.specDb.evaluateConstraintsForLinkedProducts(
      'sensor',
      'focus-pro',
      'MakerA',
      'dpi',
      ['dpi <= max_dpi'],
    );

    assert.equal(result.violations.includes('mouse-c'), true);

    const dpiState = harness.specDb.getItemFieldState('mouse-c').find((row) => row.field_key === 'dpi');
    assert.equal(Boolean(dpiState?.needs_ai_review), true);
  } finally {
    await cleanupHarness(harness);
  }
});
