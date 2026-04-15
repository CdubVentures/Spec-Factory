/**
 * useShowMore — accumulating "show more" for nested/expanded group rows.
 *
 * WHY: Loop groups and eval variant groups can contain many sub-rows.
 * Rendering all at once when expanded is a DOM bomb. This hook starts
 * at `batchSize` visible items and accumulates on each "Show more" click.
 */

import { useState, useEffect, useCallback } from 'react';

interface UseShowMoreResult {
  readonly visibleCount: number;
  readonly showMore: () => void;
  readonly hasMore: boolean;
  readonly label: string;
}

export function useShowMore(totalItems: number, batchSize = 10): UseShowMoreResult {
  const [visibleCount, setVisibleCount] = useState(batchSize);

  // Reset when totalItems changes (e.g. items deleted from group)
  useEffect(() => { setVisibleCount(batchSize); }, [totalItems, batchSize]);

  const hasMore = visibleCount < totalItems;

  const showMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + batchSize, totalItems));
  }, [batchSize, totalItems]);

  const label = totalItems === 0
    ? ''
    : hasMore
      ? `Showing ${visibleCount} of ${totalItems} \u00B7 Show more`
      : '';

  return { visibleCount, showMore, hasMore, label };
}
