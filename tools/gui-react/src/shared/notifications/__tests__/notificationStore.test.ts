import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearNotifications,
  dismissNotification,
  enqueueNotification,
  getNotificationSnapshot,
  notifyError,
  subscribeNotifications,
} from '../notificationStore.ts';

beforeEach(() => {
  clearNotifications();
});

describe('notification store', () => {
  it('normalizes errors into visible queue entries', () => {
    const notification = notifyError(new Error('API 500: write failed'), {
      source: 'mutation',
    });

    assert.equal(notification.severity, 'error');
    assert.equal(notification.source, 'mutation');
    assert.equal(notification.title, 'Mutation failed');
    assert.equal(notification.message, 'API 500: write failed');
    assert.deepEqual(getNotificationSnapshot(), [notification]);
  });

  it('falls back to a useful message for non-error throwables', () => {
    const notification = notifyError('', { source: 'query' });

    assert.equal(notification.title, 'Query failed');
    assert.equal(notification.message, 'An unexpected error occurred.');
  });

  it('notifies subscribers and supports dismiss and clear operations', () => {
    const sizes: number[] = [];
    const unsubscribe = subscribeNotifications(() => {
      sizes.push(getNotificationSnapshot().length);
    });

    const first = enqueueNotification({
      severity: 'error',
      title: 'Query failed',
      message: 'Network unavailable',
      source: 'query',
    });
    dismissNotification(first.id);
    clearNotifications();
    unsubscribe();

    assert.deepEqual(sizes, [1, 0, 0]);
  });

  it('keeps the newest notifications when the queue reaches its limit', () => {
    for (let index = 1; index <= 5; index += 1) {
      enqueueNotification({
        severity: 'error',
        title: `Failure ${index}`,
        message: `Message ${index}`,
        source: 'manual',
      });
    }

    assert.deepEqual(
      getNotificationSnapshot().map((entry) => entry.title),
      ['Failure 2', 'Failure 3', 'Failure 4', 'Failure 5'],
    );
  });
});
