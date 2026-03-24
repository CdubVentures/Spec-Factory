import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeConsumerSystem,
  isConsumerEnabled,
  resolveConsumerGate
} from '../consumerGate.js';

test('normalizeConsumerSystem canonicalizes supported system ids', () => {
  assert.equal(normalizeConsumerSystem('seed'), 'seed');
  assert.equal(normalizeConsumerSystem('SEED'), 'seed');
  assert.equal(normalizeConsumerSystem(' indexLab '), 'indexlab');
  assert.equal(normalizeConsumerSystem('IDX'), 'indexlab');
  assert.equal(normalizeConsumerSystem('review'), 'review');
  assert.equal(normalizeConsumerSystem('rev'), 'review');
  assert.equal(normalizeConsumerSystem('unknown'), null);
});

test('isConsumerEnabled defaults to enabled when no consumers block exists', () => {
  const rule = {
    contract: {
      type: 'string'
    }
  };

  assert.equal(isConsumerEnabled(rule, 'contract.type', 'seed'), true);
  assert.equal(isConsumerEnabled(rule, 'contract.type', 'indexlab'), true);
  assert.equal(isConsumerEnabled(rule, 'contract.type', 'review'), true);
});

test('isConsumerEnabled defaults to enabled when field override is missing', () => {
  const rule = {
    consumers: {
      'enum.policy': {
        seed: false
      }
    }
  };

  assert.equal(isConsumerEnabled(rule, 'contract.type', 'seed'), true);
  assert.equal(isConsumerEnabled(rule, 'contract.type', 'indexlab'), true);
  assert.equal(isConsumerEnabled(rule, 'contract.type', 'review'), true);
});

test('isConsumerEnabled respects explicit false for a field/system pair only', () => {
  const rule = {
    consumers: {
      'contract.type': {
        seed: false,
        indexlab: false
      },
      'enum.policy': {
        review: false
      }
    }
  };

  assert.equal(isConsumerEnabled(rule, 'contract.type', 'seed'), false);
  assert.equal(isConsumerEnabled(rule, 'contract.type', 'indexlab'), false);
  assert.equal(isConsumerEnabled(rule, 'contract.type', 'review'), true);

  assert.equal(isConsumerEnabled(rule, 'enum.policy', 'review'), false);
  assert.equal(isConsumerEnabled(rule, 'enum.policy', 'seed'), true);
});

test('resolveConsumerGate reports explicit disable metadata', () => {
  const rule = {
    consumers: {
      'contract.type': {
        seed: false
      }
    }
  };

  assert.deepEqual(resolveConsumerGate(rule, 'contract.type', 'seed'), {
    fieldPath: 'contract.type',
    system: 'seed',
    enabled: false,
    explicit: true
  });

  assert.deepEqual(resolveConsumerGate(rule, 'contract.type', 'review'), {
    fieldPath: 'contract.type',
    system: 'review',
    enabled: true,
    explicit: false
  });
});

test('unknown systems remain enabled by default', () => {
  const rule = {
    consumers: {
      'contract.type': {
        seed: false
      }
    }
  };

  assert.equal(isConsumerEnabled(rule, 'contract.type', 'something_else'), true);
  assert.deepEqual(resolveConsumerGate(rule, 'contract.type', 'something_else'), {
    fieldPath: 'contract.type',
    system: 'something_else',
    enabled: true,
    explicit: false
  });
});

