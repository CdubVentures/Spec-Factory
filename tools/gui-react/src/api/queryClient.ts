import {
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';

import { notifyError } from '../shared/notifications/notificationStore.ts';

const ERROR_NOTIFICATION_TITLE_META_KEY = 'errorNotificationTitle';

function readErrorNotificationTitle(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const value = (meta as Record<string, unknown>)[ERROR_NOTIFICATION_TITLE_META_KEY];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        notifyError(error, {
          source: 'query',
          title: readErrorNotificationTitle(query.meta),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        notifyError(error, {
          source: 'mutation',
          title: readErrorNotificationTitle(mutation.meta),
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryClient = createAppQueryClient();
