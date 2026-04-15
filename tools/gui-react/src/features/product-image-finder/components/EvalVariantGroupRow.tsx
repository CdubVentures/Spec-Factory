import { memo } from 'react';
import { EvalHistoryRow } from './EvalHistoryRow.tsx';
import { resolveVariantColorAtoms } from '../selectors/pifSelectors.ts';
import { variantBadgeBgStyle } from '../helpers/pifColorUtils.ts';
import {
  FinderRunTimestamp,
  FinderRunModelBadge,
  ColorSwatch,
  useShowMore,
} from '../../../shared/ui/finder/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import type { EvalVariantGroup } from '../types.ts';

interface EvalVariantGroupRowProps {
  readonly group: EvalVariantGroup;
  readonly hexMap: Map<string, string>;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly onDeleteEval: (evalNumber: number) => void;
  readonly onDeleteVariantEvals: (evalNumbers: readonly number[]) => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly evalExpandMap: Record<string, boolean>;
  readonly onToggleEvalExpand: (id: string) => void;
}

export const EvalVariantGroupRow = memo(function EvalVariantGroupRow({
  group,
  hexMap,
  editions,
  onDeleteEval,
  onDeleteVariantEvals,
  expanded,
  onToggle,
  evalExpandMap,
  onToggleEvalExpand,
}: EvalVariantGroupRowProps) {
  const evalShowMore = useShowMore(group.evals.length, 10);
  const variantKey = group.variantKey;
  const firstEval = group.evals[0];
  const variantLabel = firstEval?.variant_label || variantKey.replace(/^(color|edition):/, '');
  const colorAtoms = resolveVariantColorAtoms(variantKey, editions);
  const hexParts = colorAtoms.map(a => hexMap.get(a.trim()) || '');

  const evalNumbers = group.evals.map(e => e.eval_number);
  const viewCount = group.evals.filter(e => e.type === 'view').length;
  const heroEvalCount = group.evals.filter(e => e.type === 'hero').length;
  const countParts: string[] = [];
  if (viewCount > 0) countParts.push(`${viewCount} view`);
  if (heroEvalCount > 0) countParts.push(`${heroEvalCount} hero`);

  const rangeLabel = evalNumbers.length > 0
    ? `#${evalNumbers[0]}\u2013#${evalNumbers[evalNumbers.length - 1]}`
    : '';
  const date = firstEval?.ran_at?.split('T')[0] ?? '--';

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
          startedAt={firstEval?.started_at}
          durationMs={firstEval?.duration_ms}
        />
        {firstEval?.model && (
          <FinderRunModelBadge
            model={firstEval.model}
            accessMode={firstEval.access_mode ?? undefined}
            effortLevel={firstEval.effort_level ?? undefined}
            fallbackUsed={firstEval.fallback_used}
            thinking={firstEval.thinking}
            webSearch={firstEval.web_search}
          />
        )}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sf-text-primary font-medium"
          style={variantBadgeBgStyle(hexParts)}
        >
          <ColorSwatch hexParts={hexParts} />
          {variantLabel}
        </span>
        <Chip label={`EVAL \u00B7 ${group.evals.length} calls`} className="sf-chip-accent" />
        <div className="flex-1" />
        {countParts.length > 0 && (
          <Chip label={countParts.join(' \u00B7 ')} className="sf-chip-success" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteVariantEvals(evalNumbers); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t sf-border-soft space-y-1.5">
          {group.evals.slice(0, evalShowMore.visibleCount).map((ev) => (
            <EvalHistoryRow
              key={ev.eval_number}
              evalRecord={ev}
              hexMap={hexMap}
              editions={editions}
              onDelete={onDeleteEval}
              expanded={!!evalExpandMap[String(ev.eval_number)]}
              onToggle={() => onToggleEvalExpand(String(ev.eval_number))}
            />
          ))}
          {evalShowMore.hasMore && (
            <button
              onClick={evalShowMore.showMore}
              className="mx-auto block text-[10px] font-bold sf-text-muted hover:text-[var(--sf-token-accent)] cursor-pointer"
            >
              {evalShowMore.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
