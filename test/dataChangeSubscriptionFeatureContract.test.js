import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDataChangeEventName,
  dataChangeAffectsCategory,
  dataChangeAffectsDomains,
  shouldHandleDataChangeMessage,
} from '../tools/gui-react/src/features/data-change/index.js';

test('data-change feature contract exposes subscription filter helpers', () => {
  assert.equal(typeof resolveDataChangeEventName, 'function');
  assert.equal(typeof dataChangeAffectsCategory, 'function');
  assert.equal(typeof dataChangeAffectsDomains, 'function');
  assert.equal(typeof shouldHandleDataChangeMessage, 'function');
});

test('feature subscription helpers preserve event/category/domain gating behavior', () => {
  const message = {
    event: 'review-override',
    categories: ['mouse'],
    domains: ['review'],
  };
  assert.equal(shouldHandleDataChangeMessage({ message, category: 'mouse', domains: ['review'] }), true);
  assert.equal(shouldHandleDataChangeMessage({ message, category: 'keyboard', domains: ['review'] }), false);
  assert.equal(shouldHandleDataChangeMessage({ message, category: 'mouse', domains: ['queue'] }), false);
});
