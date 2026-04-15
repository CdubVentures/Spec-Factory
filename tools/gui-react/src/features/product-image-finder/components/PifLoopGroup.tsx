import { memo } from 'react';
import { PifRunHistoryRow } from './PifRunHistoryRow.tsx';
import { resolveVariantColorAtoms } from '../selectors/pifSelectors.ts';
import { variantBadgeBgStyle } from '../helpers/pifColorUtils.ts';
import {
  FinderRunTimestamp,
  FinderRunModelBadge,
  ColorSwatch,
  useShowMore,
} from '../../../shared/ui/finder/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import type { RunGroup } from '../types.ts';

interface PifLoopGroupProps {
  readonly group: RunGroup;
  readonly hexMap: Map<string, string>;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly onDeleteRun: (runNumber: number) => void;
  readonly onDeleteLoop: (runNumbers: readonly number[]) => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly runExpandMap: Record<string, boolean>;
  readonly onToggleRunExpand: (id: string) => void;
}

export const PifLoopGroup = memo(function PifLoopGroup({
  group,
  hexMap,
  editions,
  onDeleteRun,
  onDeleteLoop,
  expanded,
  onToggle,
  runExpandMap,
  onToggleRunExpand,
}: PifLoopGroupProps) {
  const loopShowMore = useShowMore(group.runs.length, 10);
  const totalImages = group.runs.reduce((sum, r) => sum + (r.selected?.images?.length || 0), 0);
  const totalErrors = group.runs.reduce((sum, r) => sum + (r.response?.download_errors?.length || 0), 0);
  const runNumbers = group.runs.map(r => r.run_number);
  const rangeLabel = runNumbers.length > 0
    ? `#${runNumbers[0]}\u2013#${runNumbers[runNumbers.length - 1]}`
    : '';
  const date = group.runs[0]?.ran_at?.split('T')[0] ?? '--';

  // Resolve variant from first run in the loop
  const firstRun = group.runs[0];
  const variantKey = firstRun?.response?.variant_key || '';
  const variantLabel = firstRun?.response?.variant_label || variantKey.replace(/^(color|edition):/, '') || '--';
  const colorAtoms = resolveVariantColorAtoms(variantKey, editions);
  const hexParts = colorAtoms.map(a => hexMap.get(a.trim()) || '');

  return (
    <div className="sf-surface-elevated rounded-lg overflow-hidden border sf-border-soft">
      <div
        onClick={onToggle}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span className={`text-[10px] sf-text-muted shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>
          {'\u25B6'}
        </span>
        <span className="text-[13px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          {rangeLabel}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{date}</span>
        <FinderRunTimestamp
          startedAt={firstRun?.started_at || firstRun?.response?.started_at}
          durationMs={firstRun?.duration_ms ?? firstRun?.response?.duration_ms}
        />
        {firstRun?.model && (
          <FinderRunModelBadge
            model={firstRun.model}
            accessMode={firstRun.access_mode}
            effortLevel={firstRun.effort_level}
            fallbackUsed={firstRun.fallback_used}
            thinking={firstRun.thinking}
            webSearch={firstRun.web_search}
          />
        )}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sf-text-primary font-medium"
          style={variantBadgeBgStyle(hexParts)}
        >
          <ColorSwatch hexParts={hexParts} />
          {variantLabel}
        </span>
        <Chip label={`LOOP \u00B7 ${group.runs.length} calls`} className="sf-chip-accent" />
        <div className="flex-1" />
        <Chip label={`${totalImages} img`} className={totalImages > 0 ? 'sf-chip-success' : 'sf-chip-neutral'} />
        {totalErrors > 0 && <Chip label={`${totalErrors} err`} className="sf-chip-danger" />}
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteLoop(runNumbers); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t sf-border-soft space-y-1.5">
          {group.runs.slice(0, loopShowMore.visibleCount).map((run) => (
            <PifRunHistoryRow
              key={run.run_number}
              run={run}
              hexMap={hexMap}
              editions={editions}
              onDelete={onDeleteRun}
              expanded={!!runExpandMap[String(run.run_number)]}
              onToggle={() => onToggleRunExpand(String(run.run_number))}
            />
          ))}
          {loopShowMore.hasMore && (
            <button
              onClick={loopShowMore.showMore}
              className="mx-auto block text-[10px] font-bold sf-text-muted hover:text-[var(--sf-token-accent)] cursor-pointer"
            >
              {loopShowMore.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
