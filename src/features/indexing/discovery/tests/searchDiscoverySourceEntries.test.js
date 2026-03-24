import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEnabledSourceEntries } from '../searchDiscovery.js';

test('resolveEnabledSourceEntries keeps enabled file-backed source entries and normalizes discovery defaults', () => {
  const sourceEntries = resolveEnabledSourceEntries({
    sourceEntries: [
      null,
      {
        sourceId: 'rtings_com',
        host: 'rtings.com',
        discovery: { method: 'search_first', enabled: true, priority: 90 },
      },
      {
        sourceId: 'disabled_com',
        host: 'disabled.example.com',
        discovery: { method: 'manual', enabled: false, priority: 10 },
      },
      {
        sourceId: 'fallback_com',
        host: 'fallback.example.com',
      },
    ],
  });

  assert.deepEqual(sourceEntries.map((entry) => entry.sourceId), ['rtings_com', 'fallback_com']);
  assert.equal(sourceEntries[0].discovery.method, 'search_first');
  assert.equal(sourceEntries[1].discovery.method, 'manual');
  assert.equal(sourceEntries[1].discovery.priority, 50);
});
