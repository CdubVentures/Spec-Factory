import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEnumConsistencyFormatGuidance,
  sanitizeEnumConsistencyDecisions,
  runEnumConsistencyReview,
} from '../src/llm/validateEnumConsistency.js';

test('sanitizeEnumConsistencyDecisions maps only to known canonical targets', () => {
  const decisions = sanitizeEnumConsistencyDecisions({
    decisions: [
      {
        value: 'Rgb Led',
        decision: 'map_to_existing',
        target_value: 'RGB LED',
        confidence: 0.9,
      },
      {
        value: 'Wireless',
        decision: 'map_to_existing',
        target_value: 'Wi-Fi',
        confidence: 0.8,
      },
    ],
  }, {
    pendingValues: ['Rgb Led', 'Wireless'],
    canonicalValues: ['RGB LED', 'Bluetooth'],
  });

  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].decision, 'map_to_existing');
  assert.equal(decisions[0].target_value, 'RGB LED');
  assert.equal(decisions[1].decision, 'uncertain');
  assert.equal(decisions[1].target_value, null);
});

test('sanitizeEnumConsistencyDecisions keeps pending order and fills defaults', () => {
  const decisions = sanitizeEnumConsistencyDecisions({
    decisions: [
      {
        value: 'Front flare',
        decision: 'keep_new',
        confidence: 0.73,
      },
    ],
  }, {
    pendingValues: ['Front Flare', 'Hum'],
    canonicalValues: ['Front Flare'],
  });

  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].value, 'Front Flare');
  assert.equal(decisions[0].decision, 'keep_new');
  assert.equal(decisions[1].value, 'Hum');
  assert.equal(decisions[1].decision, 'uncertain');
});

test('runEnumConsistencyReview returns uncertain defaults when llm is disabled', async () => {
  const result = await runEnumConsistencyReview({
    fieldKey: 'lighting',
    enumPolicy: 'open_prefer_known',
    canonicalValues: ['RGB LED'],
    pendingValues: ['Rgb Led'],
    config: { llmEnabled: false },
  });

  assert.equal(result.enabled, false);
  assert.equal(result.skipped_reason, 'llm_disabled_or_missing_key');
  assert.equal(Array.isArray(result.decisions), true);
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].decision, 'uncertain');
});

test('resolveEnumConsistencyFormatGuidance prefers explicit guidance when provided', () => {
  const guidance = resolveEnumConsistencyFormatGuidance({
    fieldKey: 'lighting',
    formatGuidance: 'Use exact pattern: XXXX zone (YYYY).',
    canonicalValues: ['1 zone (rgb)', '7 zone (led)'],
  });

  assert.equal(guidance, 'Use exact pattern: XXXX zone (YYYY).');
});

test('resolveEnumConsistencyFormatGuidance infers placeholder template from canonical values', () => {
  const guidance = resolveEnumConsistencyFormatGuidance({
    fieldKey: 'lighting',
    canonicalValues: ['1 zone (rgb)', '7 zone (led)'],
  });

  assert.ok(guidance.includes('XXXX zone (YYYY)'));
  assert.ok(guidance.includes('Placeholder convention'));
});
