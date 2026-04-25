import { memo, useMemo } from 'react';
import { buildModeBadge, resolveVariantColorAtoms } from '../selectors/pifSelectors.ts';
import { variantBadgeBgStyle } from '../helpers/pifColorUtils.ts';
import {
  FinderRunTimestamp,
  FinderRunModelBadge,
  FinderRunPromptDetails,
  FinderDiscoveryDetails,
  ColorSwatch,
} from '../../../shared/ui/finder/index.ts';
import type { DiscoverySection } from '../../../shared/ui/finder/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { pullFormatDate } from '../../../utils/dateTime.ts';
import type { ProductImageFinderRun } from '../types.ts';

interface PifRunHistoryRowProps {
  readonly run: ProductImageFinderRun;
  readonly hexMap: Map<string, string>;
  readonly editions: Record<string, { display_name?: string; colors?: string[] }>;
  readonly onDelete: (runNumber: number) => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly insideLoop?: boolean;
}

export const PifRunHistoryRow = memo(function PifRunHistoryRow({
  run,
  hexMap,
  editions,
  onDelete,
  expanded,
  onToggle,
  insideLoop = false,
}: PifRunHistoryRowProps) {
  const images = run.selected?.images || [];
  const errors = run.response?.download_errors || [];
  const log = run.response?.discovery_log;
  const badge = buildModeBadge(run, { insideLoop });

  // Resolve variant color atoms → hex for swatch (editions look up their combo)
  const variantKey = run.response?.variant_key || '';
  const variantLabel = run.response?.variant_label || run.response?.variant_key || '--';
  const colorAtoms = resolveVariantColorAtoms(variantKey, editions);
  const hexParts = colorAtoms.map(a => hexMap.get(a.trim()) || '');

  const discoverySections = useMemo((): DiscoverySection[] => {
    if (!log) return [];
    const sections: DiscoverySection[] = [];
    if (log.queries_run?.length) sections.push({ title: 'Queries Run', format: 'lines', items: log.queries_run });
    if (log.urls_checked?.length) sections.push({ title: 'URLs Checked', format: 'lines', items: log.urls_checked });
    if (log.notes?.length) sections.push({ title: 'Notes', format: 'lines', items: log.notes });
    return sections;
  }, [log]);

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
          #{run.run_number}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{pullFormatDate(run.ran_at) || '--'}</span>
        <FinderRunTimestamp
          startedAt={run.started_at || run.response?.started_at}
          durationMs={run.duration_ms ?? run.response?.duration_ms}
        />
        {run.model && (
          <FinderRunModelBadge
            model={run.model}
            accessMode={run.access_mode}
            effortLevel={run.effort_level}
            fallbackUsed={run.fallback_used}
            thinking={run.thinking}
            webSearch={run.web_search}
          />
        )}
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] sf-text-primary font-medium"
          style={variantBadgeBgStyle(hexParts)}
        >
          <ColorSwatch hexParts={hexParts} />
          {variantLabel}
        </span>
        {badge && <Chip label={badge.label} className={badge.className} />}
        <div className="flex-1" />
        <Chip label={`${images.length} img`} className={images.length > 0 ? 'sf-chip-success' : 'sf-chip-neutral'} />
        {errors.length > 0 && <Chip label={`${errors.length} err`} className="sf-chip-danger" />}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(run.run_number); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t sf-border-soft flex flex-col gap-3">
          {/* Download errors */}
          {errors.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1">Download Errors</div>
              <div className="flex flex-col gap-1">
                {errors.map((e, i) => (
                  <div key={i} className="text-[10px] font-mono sf-status-text-danger">
                    {e.view}: {e.error} {e.url ? `(${e.url})` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discovery log */}
          {log && <FinderDiscoveryDetails
            title="Discovery Log"
            sections={discoverySections}
            storageKey={`pif:discoveryLog:${run.run_number}`}
          />}

          {/* System prompt, user message, LLM response */}
          <FinderRunPromptDetails
            systemPrompt={run.prompt?.system}
            userMessage={run.prompt?.user}
            response={run.response}
            storageKeyPrefix={`pif:runPrompt:${run.run_number}`}
          />
        </div>
      )}
    </div>
  );
});
