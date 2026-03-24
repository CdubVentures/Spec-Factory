import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDataPropagationCountersSnapshot,
  recordQueueCleanupOutcome,
  resetDataPropagationCounters,
} from '../dataPropagationCounters.js';
import { emitDataChange } from '../../core/events/dataChangeContract.js';

test('data propagation counters: emitDataChange increments broadcast counters by event and category', () => {
  resetDataPropagationCounters();

  emitDataChange({
    broadcastWs: () => {},
    event: 'catalog-product-update',
    category: 'mouse',
    categories: ['mouse'],
  });

  const snapshot = getDataPropagationCountersSnapshot();
  assert.equal(snapshot.broadcast.total, 1);
  assert.equal(snapshot.broadcast.by_event['catalog-product-update'], 1);
  assert.equal(snapshot.broadcast.by_category.mouse, 1);
});

test('data propagation counters: global events count each scoped category once', () => {
  resetDataPropagationCounters();

  emitDataChange({
    broadcastWs: () => {},
    event: 'brand-rename',
    category: 'all',
    categories: ['mouse', 'keyboard', 'mouse'],
  });

  const snapshot = getDataPropagationCountersSnapshot();
  assert.equal(snapshot.broadcast.total, 1);
  assert.equal(snapshot.broadcast.by_event['brand-rename'], 1);
  assert.equal(snapshot.broadcast.by_category.mouse, 1);
  assert.equal(snapshot.broadcast.by_category.keyboard, 1);
});

test('data propagation counters: queue cleanup records attempts and success/failure counts', () => {
  resetDataPropagationCounters();

  recordQueueCleanupOutcome({ category: 'mouse', success: true });
  recordQueueCleanupOutcome({ category: 'mouse', success: false, reason: 'sqlite_delete_failed' });

  const snapshot = getDataPropagationCountersSnapshot();
  assert.equal(snapshot.queue_cleanup.attempt_total, 2);
  assert.equal(snapshot.queue_cleanup.success_total, 1);
  assert.equal(snapshot.queue_cleanup.failed_total, 1);
  assert.equal(snapshot.queue_cleanup.by_category.mouse.attempt_total, 2);
  assert.equal(snapshot.queue_cleanup.by_category.mouse.failed_total, 1);
  assert.equal(snapshot.queue_cleanup.last_failure_reason, 'sqlite_delete_failed');
});
