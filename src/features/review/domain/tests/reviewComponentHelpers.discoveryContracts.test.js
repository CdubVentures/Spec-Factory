import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeDiscoveryRows,
  enforceNonDiscoveredRows,
} from '../componentReviewHelpers.js';

test('normalizeDiscoveryRows trims discovery sources, infers pipeline-style discovery, and preserves explicit flags', () => {
  const rows = [
    { discovery_source: ' Pipeline ', name: 'a' },
    { discovery_source: 'ai_discovered', name: 'b' },
    { discovery_source: 'reference', discovered: false, name: 'c' },
  ];

  const result = normalizeDiscoveryRows(rows);

  assert.equal(result[0].discovery_source, 'Pipeline');
  assert.equal(result[0].discovered, true);
  assert.equal(result[1].discovered, true);
  assert.equal(result[2].discovered, false);
});

test('enforceNonDiscoveredRows caps backlog in test mode and preserves non-test categories', () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    discovery_source: 'reference',
    discovered: false,
    name: `item-${index}`,
  }));

  const testModeResult = enforceNonDiscoveredRows(rows, '_test_mouse');
  assert.equal(testModeResult.filter((row) => !row.discovered).length, 3);

  const nonTestResult = enforceNonDiscoveredRows([{ discovery_source: 'reference', discovered: false }], 'mouse');
  assert.equal(nonTestResult[0].discovered, false);
});

test('enforceNonDiscoveredRows keeps one undiscovered anchor in test mode when all rows would otherwise be discovered', () => {
  const rows = [
    { discovery_source: 'pipeline', linked_products: ['mouse-a'] },
    { discovery_source: 'pipeline', linked_products: [] },
    { discovery_source: 'discovered', linked_products: ['mouse-b'] },
  ];

  const result = enforceNonDiscoveredRows(rows, '_test_mouse');

  assert.equal(result.filter((row) => !row.discovered).length, 1);
  assert.equal(result[1].discovered, false);
});
