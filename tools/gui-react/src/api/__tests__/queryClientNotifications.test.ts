import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createAppQueryClient } from '../queryClient.ts';
import {
  clearNotifications,
  getNotificationSnapshot,
} from '../../shared/notifications/notificationStore.ts';

beforeEach(() => {
  clearNotifications();
});

describe('app query client notifications', () => {
  it('routes failed shared queries to the global notification queue', async () => {
    const queryClient = createAppQueryClient();

    await assert.rejects(
      queryClient.fetchQuery({
        queryKey: ['audit', 'query'],
        queryFn: async () => {
          throw new Error('catalog query unavailable');
        },
        retry: false,
      }),
    );

    const notifications = getNotificationSnapshot();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].source, 'query');
    assert.equal(notifications[0].title, 'Query failed');
    assert.equal(notifications[0].message, 'catalog query unavailable');
  });

  it('routes failed shared mutations to the global notification queue', async () => {
    const queryClient = createAppQueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['audit', 'mutation'],
      mutationFn: async () => {
        throw new Error('rollback mutation failed');
      },
      retry: false,
    });

    await assert.rejects(mutation.execute(undefined));

    const notifications = getNotificationSnapshot();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].source, 'mutation');
    assert.equal(notifications[0].title, 'Mutation failed');
    assert.equal(notifications[0].message, 'rollback mutation failed');
  });

  it('uses mutation metadata for rollback-specific user notices', async () => {
    const queryClient = createAppQueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['audit', 'rollback'],
      mutationFn: async () => {
        throw new Error('server rejected optimistic update');
      },
      meta: {
        errorNotificationTitle: 'Product update reverted',
      },
      retry: false,
    });

    await assert.rejects(mutation.execute(undefined));

    const notifications = getNotificationSnapshot();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].source, 'mutation');
    assert.equal(notifications[0].title, 'Product update reverted');
    assert.equal(notifications[0].message, 'server rejected optimistic update');
  });
});
