import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDataChangeEventName,
  dataChangeAffectsCategory,
  dataChangeAffectsDomains,
  shouldHandleDataChangeMessage,
} from '../index.js';

test('resolveDataChangeEventName prefers explicit event field', () => {
  assert.equal(
    resolveDataChangeEventName({ event: 'review-override', type: 'data-change' }),
    'review-override',
  );
});

test('resolveDataChangeEventName falls back to legacy type when event is missing', () => {
  assert.equal(resolveDataChangeEventName({ type: 'queue-retry' }), 'queue-retry');
  assert.equal(resolveDataChangeEventName({ type: 'data-change' }), '');
});

test('dataChangeAffectsCategory honors scoped category payloads', () => {
  const message = { categories: ['mouse', 'keyboard'] };
  assert.equal(dataChangeAffectsCategory(message, 'mouse'), true);
  assert.equal(dataChangeAffectsCategory(message, 'printer'), false);
});

test('dataChangeAffectsDomains honors domain filters when message includes domains', () => {
  const message = { domains: ['catalog', 'review'] };
  assert.equal(dataChangeAffectsDomains(message, ['review']), true);
  assert.equal(dataChangeAffectsDomains(message, ['queue']), false);
});

test('dataChangeAffectsDomains normalizes casing and whitespace in filters and message domains', () => {
  const message = { domains: [' Review ', ' Catalog '] };
  assert.equal(dataChangeAffectsDomains(message, ['review']), true);
  assert.equal(dataChangeAffectsDomains(message, [' catalog ']), true);
  assert.equal(dataChangeAffectsDomains(message, ['queue']), false);
});

test('shouldHandleDataChangeMessage gates by event + category + domains', () => {
  const message = {
    event: 'review-override',
    categories: ['mouse'],
    domains: ['review'],
  };
  assert.equal(
    shouldHandleDataChangeMessage({ message, category: 'mouse', domains: ['review'] }),
    true,
  );
  assert.equal(
    shouldHandleDataChangeMessage({ message, category: 'keyboard', domains: ['review'] }),
    false,
  );
  assert.equal(
    shouldHandleDataChangeMessage({ message, category: 'mouse', domains: ['queue'] }),
    false,
  );
});
