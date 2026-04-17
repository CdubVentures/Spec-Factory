import { memo } from 'react';
import { resolveVariantColorAtoms } from '../selectors/pifSelectors.ts';
import { variantBadgeBgStyle } from '../helpers/pifColorUtils.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import {
  FinderRunTimestamp,
  FinderRunModelBadge,
  FinderRunPromptDetails,
  ColorSwatch,
} from '../../../shared/ui/finder/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { pullFormatDate } from '../../../utils/dateTime.ts';
import type { EvalRecord } from '../types.ts';

interface EvalHistoryRowProps {
  readonly evalRecord: EvalRecord;
  readonly hexMap: Map<string, string>;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly onDelete: (evalNumber: number) => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

export const EvalHistoryRow = memo(function EvalHistoryRow({
  evalRecord,
  hexMap,
  editions,
  onDelete,
  expanded,
  onToggle,
}: EvalHistoryRowProps) {
  const isHero = evalRecord.type === 'hero';
  const label = isHero ? 'HERO' : (evalRecord.view ?? '').toUpperCase();

  // Resolve variant color atoms → hex for swatch
  const variantKey = evalRecord.variant_key || '';
  const variantLabel = evalRecord.variant_label || variantKey.replace(/^(color|edition):/, '');
  const colorAtoms = resolveVariantColorAtoms(variantKey, editions);
  const hexParts = colorAtoms.map(a => hexMap.get(a.trim()) || '');

  // Result summary for chip
  const resultSummary = isHero
    ? `${((evalRecord.result as Record<string, unknown[]>)?.heroes ?? []).length} hero${((evalRecord.result as Record<string, unknown[]>)?.heroes ?? []).length !== 1 ? 'es' : ''}`
    : `${((evalRecord.result as Record<string, unknown[]>)?.rankings ?? []).length} ranked`;

  return (
    <div className="sf-surface-panel rounded-lg overflow-hidden">
      <div
        onClick={onToggle}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span className={`text-[10px] sf-text-muted shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>
          {'\u25B6'}
        </span>
        <span className="text-[13px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          #{evalRecord.eval_number}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{pullFormatDate(evalRecord.ran_at) || '--'}</span>
        <FinderRunTimestamp
          startedAt={evalRecord.started_at}
          durationMs={evalRecord.duration_ms}
        />
        {evalRecord.model && (
          <FinderRunModelBadge
            model={evalRecord.model}
            accessMode={evalRecord.access_mode ?? undefined}
            effortLevel={evalRecord.effort_level ?? undefined}
            fallbackUsed={evalRecord.fallback_used}
            thinking={evalRecord.thinking}
            webSearch={evalRecord.web_search}
          />
        )}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sf-text-primary font-medium"
          style={variantBadgeBgStyle(hexParts)}
        >
          <ColorSwatch hexParts={hexParts} />
          {variantLabel}
        </span>
        <Chip label={label} className={isHero ? 'sf-chip-accent' : 'sf-chip-info'} />
        <div className="flex-1" />
        <Chip label={resultSummary} className="sf-chip-success" />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(evalRecord.eval_number); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <EvalExpandedContent evalRecord={evalRecord} />
      )}
    </div>
  );
});

function EvalExpandedContent({ evalRecord }: { readonly evalRecord: EvalRecord }) {
  const [resultOpen, toggleResultOpen] = usePersistedToggle(`pif:evalResult:${evalRecord.eval_number}`, false);

  return (
    <div className="px-4 pb-4 pt-1 border-t sf-border-soft flex flex-col gap-3">
      {/* Result — collapsible toggle */}
      {evalRecord.result && Object.keys(evalRecord.result).length > 0 && (
        <div className="sf-surface-panel border sf-border-soft rounded-md">
          <button
            type="button"
            onClick={toggleResultOpen}
            className="w-full px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle flex items-center gap-1 text-left"
          >
            <span className={`inline-block transition-transform duration-150 text-[8px] ${resultOpen ? 'rotate-90' : ''}`}>&#9656;</span>
            Result
          </button>
          {resultOpen && (
            <pre className="px-3 pb-3 text-[10px] font-mono sf-text-subtle whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
              {JSON.stringify(evalRecord.result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* System prompt + user message + response */}
      <FinderRunPromptDetails
        systemPrompt={evalRecord.prompt?.system}
        userMessage={evalRecord.prompt?.user}
        response={evalRecord.response}
        storageKeyPrefix={`pif:evalPrompt:${evalRecord.eval_number}`}
      />
    </div>
  );
}
