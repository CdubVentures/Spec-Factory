/**
 * Pure pagination logic — no React deps, fully testable with node --test.
 *
 * WHY: Extracted from usePagination hook so state transitions and
 * boundary math can be tested without React testing libraries.
 */

export interface PaginationInput {
  readonly totalItems: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface PaginationOutput {
  readonly totalPages: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly clampedPage: number;
  readonly showingLabel: string;
}

/**
 * Validates a raw stored page value. Returns fallback for anything
 * that isn't a finite non-negative integer.
 */
export function resolvePersistedPage(
  storedValue: string | null | undefined,
  fallback: number,
): number {
  if (typeof storedValue !== 'string' || storedValue === '') return fallback;
  const n = Number(storedValue);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return fallback;
  return n;
}

export function computePagination({ totalItems, page, pageSize }: PaginationInput): PaginationOutput {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / safePageSize) : 1;
  const clampedPage = Math.max(0, Math.min(page, totalPages - 1));

  const startIndex = clampedPage * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);

  const showingLabel = totalItems === 0
    ? 'No items'
    : `Showing ${startIndex + 1}\u2013${endIndex} of ${totalItems}`;

  return { totalPages, startIndex, endIndex, clampedPage, showingLabel };
}
