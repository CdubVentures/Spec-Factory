import type { QueryClient } from '@tanstack/react-query';
import type { EnumReviewPayload } from '../../types/componentReview.ts';

export declare function normalizeEnumReviewCategory(category: unknown): string;
export declare function getEnumReviewQueryKey(category: unknown): [string, string];
export declare function shouldEnableEnumReviewQuery(category: unknown, enabled?: boolean): boolean;

export declare function invalidateEnumReviewDataQuery(queryClient: QueryClient | null | undefined, category: unknown): void;

export declare function invalidateEnumAuthorityQueries(
  queryClient: QueryClient | null | undefined,
  category: unknown,
  options?: {
    includeReviewProductsIndex?: boolean;
    includeStudioKnownValues?: boolean;
  },
): void;

export declare function setEnumReviewQueryData(
  queryClient: QueryClient | null | undefined,
  category: unknown,
  updater: (
    previous: EnumReviewPayload | undefined,
  ) => EnumReviewPayload | undefined,
): EnumReviewPayload | undefined;
