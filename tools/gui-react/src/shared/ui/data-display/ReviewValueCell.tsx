import { memo, type ReactNode } from 'react';
import { trafficColor, trafficTextColor } from '../../../utils/colors.ts';
import { pct } from '../../../utils/formatting.ts';
import { hasKnownValue, formatCellValue } from '../../../utils/fieldNormalize.ts';
import { CellTooltip, type CellTooltipState } from '../feedback/CellTooltip.tsx';
import { FlagIcon } from '../icons/FlagIcon.tsx';

export interface ReviewValueCellState extends CellTooltipState {
  selected: CellTooltipState['selected'] & {
    value: unknown;
  };
  overridden?: boolean;
}

interface ReviewValueCellProps {
  state?: ReviewValueCellState | null;
  hasRun?: boolean;
  selected?: boolean;
  className?: string;
  valueClassName?: string;
  unknownLabel?: string;
  showConfidence?: boolean;
  showOverrideBadge?: boolean;
  valueMaxChars?: number;
  emptyWhenNoRun?: ReactNode;
  emptyWhenMissing?: ReactNode;
  pendingAIShared?: boolean;
  showLinkedProductBadge?: boolean;
  linkedProductCount?: number;
  showSourceCountBadge?: boolean;
  sourceCount?: number;
  flagCount?: number;
}

function joinClassNames(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// WHY: Memoized so a parent re-render (e.g. typing in a sibling editing cell)
// doesn't cascade through every cell. Default shallow equality is sufficient
// because props are scalars + a stable `state` ref from the row's properties.
function ReviewValueCellInner({
  state,
  hasRun = true,
  selected = false,
  className,
  valueClassName,
  unknownLabel = '',
  showConfidence = false,
  showOverrideBadge = false,
  valueMaxChars = 40,
  emptyWhenNoRun = null,
  emptyWhenMissing = null,
  pendingAIShared = false,
  showLinkedProductBadge = false,
  linkedProductCount = 0,
  showSourceCountBadge = false,
  sourceCount = 0,
  flagCount = 0,
}: ReviewValueCellProps) {
  const hasShared = pendingAIShared;
  const normalizedLinkedProductCount = Number.isFinite(Number(linkedProductCount))
    ? Math.max(0, Math.trunc(Number(linkedProductCount)))
    : 0;
  const normalizedSourceCount = Number.isFinite(Number(sourceCount))
    ? Math.max(0, Math.trunc(Number(sourceCount)))
    : 0;
  if (hasRun === false) {
    return <>{emptyWhenNoRun}</>;
  }
  if (!state || !state.selected) {
    return <>{emptyWhenMissing}</>;
  }

  const color = state.selected.color;
  const known = hasKnownValue(state.selected.value);
  const rawText = known ? formatCellValue(state.selected.value) : unknownLabel;
  const displayText = known && valueMaxChars > 0
    ? rawText.slice(0, valueMaxChars)
    : rawText;

  return (
    <div
      className={joinClassNames([
        'flex items-center gap-1.5 min-w-0',
        selected && 'ring-2 ring-accent ring-inset rounded px-0.5',
        className,
      ])}
    >
      {/* Tooltip trigger wraps the dot + confidence for a bigger hover target */}
      <CellTooltip state={state}>
        <span className="sf-review-value-cell-trigger inline-flex items-center gap-1 cursor-help rounded-full px-0.5 py-0.5 -my-0.5 transition-colors flex-shrink-0">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${hasShared ? '' : trafficColor(color)}`}
            style={hasShared ? { background: 'var(--sf-token-state-timeout-fg)' } : undefined}
          />
          {showConfidence && state.selected.confidence > 0 && (
            <span className="text-[9px] sf-text-subtle flex-shrink-0 tabular-nums">
              {pct(state.selected.confidence)}
            </span>
          )}
        </span>
      </CellTooltip>
      {showConfidence && state.selected.confidence > 0 && known && (
        <span className="sf-text-subtle flex-shrink-0 text-[8px] leading-none">·</span>
      )}
      <span
        className={joinClassNames([
          'truncate text-[11px]',
          hasShared ? 'sf-text-timeout' : known ? trafficTextColor(color) : 'sf-status-text-muted',
          valueClassName,
        ])}
        title={rawText}
      >
        {displayText}
      </span>
      {showOverrideBadge && Boolean(state.overridden) && (
        <span className="text-[9px] sf-status-text-warning font-bold flex-shrink-0" title="Overridden">
          OVR
        </span>
      )}
      {hasShared && (
        <span className="px-1 py-0.5 rounded text-[8px] font-bold sf-callout-timeout shrink-0" title="Shared AI review pending">AI</span>
      )}
      {showLinkedProductBadge && normalizedLinkedProductCount > 0 && (
        <span
          className="px-1 py-0.5 rounded text-[8px] font-bold sf-callout-info shrink-0"
          title={`${normalizedLinkedProductCount} linked product${normalizedLinkedProductCount !== 1 ? 's' : ''}`}
        >
          LP {normalizedLinkedProductCount}
        </span>
      )}
      {showSourceCountBadge && normalizedSourceCount > 0 && (
        <span
          className="px-1 py-0.5 rounded text-[8px] font-bold sf-callout-info shrink-0"
          title={`${normalizedSourceCount} candidate source${normalizedSourceCount !== 1 ? 's' : ''}`}
        >
          SC {normalizedSourceCount}
        </span>
      )}
      {flagCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[9px] sf-status-text-warning flex-shrink-0" title={`${flagCount} flag${flagCount > 1 ? 's' : ''}`}>
          <FlagIcon className="w-2.5 h-2.5" />
          <span>{flagCount}</span>
        </span>
      )}
    </div>
  );
}

export const ReviewValueCell = memo(ReviewValueCellInner);
