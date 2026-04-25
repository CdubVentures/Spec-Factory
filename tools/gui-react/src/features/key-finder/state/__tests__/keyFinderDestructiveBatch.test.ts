/**
 * Key Finder destructive bulk operations.
 *
 * BEHAVIORAL class: header-level Unpub all / Delete all must visibly wait for
 * every requested key and surface failures instead of dismissing immediately.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatKeyFinderDestructiveBatchFailure,
  runKeyFinderDestructiveBatch,
} from '../keyFinderDestructiveBatch.ts';

describe('Key Finder destructive batch helper', () => {
  it('awaits every field and reports all successes', async () => {
    const calls: string[] = [];

    const result = await runKeyFinderDestructiveBatch({
      fieldKeys: ['sensor_model', 'polling_rate'],
      mutate: async ({ fieldKey }) => {
        calls.push(fieldKey);
      },
    });

    assert.deepEqual(calls.sort(), ['polling_rate', 'sensor_model']);
    assert.equal(result.attempted, 2);
    assert.deepEqual([...result.succeeded].sort(), ['polling_rate', 'sensor_model']);
    assert.deepEqual(result.failed, []);
  });

  it('waits for successes even when one field fails and formats a useful message', async () => {
    const calls: string[] = [];

    const result = await runKeyFinderDestructiveBatch({
      fieldKeys: ['dpi', 'sensor_model', 'polling_rate'],
      mutate: async ({ fieldKey }) => {
        calls.push(fieldKey);
        if (fieldKey === 'sensor_model') {
          throw new Error('API 409: key_busy');
        }
      },
    });

    assert.deepEqual(calls.sort(), ['dpi', 'polling_rate', 'sensor_model']);
    assert.deepEqual([...result.succeeded].sort(), ['dpi', 'polling_rate']);
    assert.deepEqual(result.failed, [{ fieldKey: 'sensor_model', message: 'API 409: key_busy' }]);
    assert.equal(
      formatKeyFinderDestructiveBatchFailure('Delete', result),
      'Delete failed for 1 of 3 key(s): sensor_model: API 409: key_busy',
    );
  });
});
