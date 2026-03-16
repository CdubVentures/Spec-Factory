import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDataChangeToken,
  collectDataChangeDomains,
} from '../tools/gui-react/src/features/data-change/index.js';

test('normalizeDataChangeToken trims token text', () => {
  assert.equal(normalizeDataChangeToken('  review  '), 'review');
});

test('collectDataChangeDomains lowercases and dedupes domain filters', () => {
  assert.deepEqual(
    collectDataChangeDomains(['Review', 'review', ' Catalog ']),
    ['review', 'catalog'],
  );
});

test('collectDataChangeDomains ignores blank values', () => {
  assert.deepEqual(collectDataChangeDomains(['', '  ']), []);
});
