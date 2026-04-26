import type { QueryClient } from '@tanstack/react-query';
import {
  DATA_CHANGE_EVENT_DOMAIN_FALLBACK,
  invalidateDataChangeQueries,
} from '../../data-change/index.js';

interface InvalidateFieldRulesQueriesOptions {
  readonly event?: string;
}

const DEFAULT_FIELD_RULES_EVENT = 'field-studio-map-saved';

function resolveKnownEvent(event: string): string {
  if (Object.prototype.hasOwnProperty.call(DATA_CHANGE_EVENT_DOMAIN_FALLBACK, event)) {
    return event;
  }
  throw new Error(`Unknown data-change event: ${event}`);
}

export function invalidateFieldRulesQueries(
  qc: QueryClient,
  category: string,
  options: InvalidateFieldRulesQueriesOptions = {},
) {
  const event = resolveKnownEvent(options.event ?? DEFAULT_FIELD_RULES_EVENT);
  invalidateDataChangeQueries({
    queryClient: qc,
    message: {
      type: 'data-change',
      event,
    },
    categories: [category],
    fallbackCategory: category,
  });
}
