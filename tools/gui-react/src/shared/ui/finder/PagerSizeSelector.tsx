/**
 * PagerSizeSelector — discrete page-size buttons for finder section headers.
 *
 * WHY: Matches BillingEntryTable's "Show [10] [20] [50]" pattern exactly.
 * Reuses existing sf-pager-btn / sf-pager-btn-active CSS classes.
 */

import { memo } from 'react';

const DEFAULT_SIZES = [10, 20, 50] as const;

interface PagerSizeSelectorProps {
  readonly sizes?: readonly number[];
  readonly pageSize: number;
  readonly onPageSizeChange: (size: number) => void;
}

export const PagerSizeSelector = memo(function PagerSizeSelector({
  sizes = DEFAULT_SIZES,
  pageSize,
  onPageSizeChange,
}: PagerSizeSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] sf-text-muted">Show</span>
      {sizes.map((size) => (
        <button
          key={size}
          className={size === pageSize ? 'sf-pager-btn sf-pager-btn-active' : 'sf-pager-btn'}
          onClick={() => onPageSizeChange(size)}
        >
          {size}
        </button>
      ))}
    </div>
  );
});
