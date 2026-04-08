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

test('enforceNonDiscoveredRows normalizes and preserves discovery flags', () => {
  const rows = [
    { discovery_source: 'reference', discovered: false },
    { discovery_source: 'pipeline', discovered: true },
  ];

  const result = enforceNonDiscoveredRows(rows);
  assert.equal(result[0].discovered, false);
  assert.equal(result[1].discovered, true);
});
