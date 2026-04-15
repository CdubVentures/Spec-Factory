/**
 * PagerNavFooter — page navigation strip for bottom of finder history sections.
 *
 * WHY: Matches BillingEntryTable's "← Prev [1] [2] ... [N] Next →" pattern.
 * Reuses existing sf-pager-btn / sf-pager-btn-active CSS classes.
 */

import { memo } from 'react';

interface PagerNavFooterProps {
  readonly page: number;
  readonly totalPages: number;
  readonly showingLabel: string;
  readonly onPageChange: (page: number) => void;
}

export const PagerNavFooter = memo(function PagerNavFooter({
  page,
  totalPages,
  showingLabel,
  onPageChange,
}: PagerNavFooterProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-[11px] sf-text-muted pt-3 border-t sf-border-soft">
      <span>{showingLabel}</span>
      <div className="flex gap-0.5">
        <button
          className="sf-pager-btn"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          &larr; Prev
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = page < 3 ? i : page - 2 + i;
          if (p >= totalPages) return null;
          return (
            <button
              key={p}
              className={p === page ? 'sf-pager-btn sf-pager-btn-active' : 'sf-pager-btn'}
              onClick={() => onPageChange(p)}
            >
              {p + 1}
            </button>
          );
        })}
        {totalPages > 5 && page < totalPages - 3 && (
          <>
            <span className="px-1">&hellip;</span>
            <button className="sf-pager-btn" onClick={() => onPageChange(totalPages - 1)}>
              {totalPages}
            </button>
          </>
        )}
        <button
          className="sf-pager-btn"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
});
