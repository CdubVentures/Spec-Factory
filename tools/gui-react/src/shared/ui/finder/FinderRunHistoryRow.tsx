import type { ReactNode } from 'react';
import { FinderRunTimestamp } from './FinderRunTimestamp.tsx';
import { FinderRunModelBadge } from './FinderRunModelBadge.tsx';
import { pullFormatDate } from '../../../utils/dateTime.ts';
import { RowActionButton } from '../actionButton/index.ts';

interface FinderRunHistoryRowProps {
  readonly runNumber: number;
  readonly ranAt: string;
  readonly startedAt?: string | null;
  readonly durationMs?: number | null;
  readonly model?: string;
  readonly accessMode?: string;
  readonly effortLevel?: string;
  readonly fallbackUsed?: boolean;
  readonly thinking?: boolean;
  readonly webSearch?: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onDelete: (runNumber: number) => void;
  readonly deleteDisabled?: boolean;
  /** Rendered after the model badge, before the flex-1 spacer (module-specific chips / variant labels). */
  readonly leftContent?: ReactNode;
  /** Rendered after the flex-1 spacer, before Del (status chips). */
  readonly rightContent?: ReactNode;
  /** Expanded body content (prompt/response, discovery, domain details). */
  readonly children?: ReactNode;
}

/**
 * Shared run history row chrome for every finder panel. Owns the outer
 * surface, arrow, run number, ran-at date, timestamp badge, model badge,
 * and delete button. Modules plug module-specific content via
 * {@link leftContent}, {@link rightContent}, and the expanded body.
 *
 * Canonical shape used by CEF, PIF, RDF — do NOT hand-roll a separate row
 * per finder. New finders should use this; retrofitting legacy panels is
 * a separate refactor.
 */
export function FinderRunHistoryRow({
  runNumber,
  ranAt,
  startedAt,
  durationMs,
  model,
  accessMode,
  effortLevel,
  fallbackUsed,
  thinking,
  webSearch,
  expanded,
  onToggle,
  onDelete,
  deleteDisabled = false,
  leftContent,
  rightContent,
  children,
}: FinderRunHistoryRowProps) {
  return (
    <div className="sf-surface-panel rounded-lg overflow-hidden">
      <div
        onClick={onToggle}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span
          className={`text-[10px] sf-text-muted shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        >
          {'\u25B6'}
        </span>
        <span className="text-[13px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          #{runNumber}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{pullFormatDate(ranAt)}</span>
        <FinderRunTimestamp startedAt={startedAt ?? undefined} durationMs={durationMs ?? undefined} />
        {model && (
          <FinderRunModelBadge
            model={model}
            accessMode={accessMode}
            effortLevel={effortLevel}
            fallbackUsed={fallbackUsed}
            thinking={thinking}
            webSearch={webSearch}
          />
        )}
        {leftContent}
        <div className="flex-1" />
        {rightContent}
        <RowActionButton
          intent="delete"
          label="Del"
          onClick={() => onDelete(runNumber)}
          disabled={deleteDisabled}
        />
      </div>

      {expanded && children && (
        <div className="px-4 pb-4 pt-1 border-t sf-border-soft flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
