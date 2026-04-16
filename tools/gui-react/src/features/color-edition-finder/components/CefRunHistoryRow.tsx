/**
 * CefRunHistoryRow — extracted, memoized run history row for the CEF panel.
 *
 * Mirrors the PifRunHistoryRow pattern: own file, memo()-wrapped,
 * uses shared finder components for discovery details and prompt display.
 */
import { memo, useMemo } from 'react';
import {
  FinderRunTimestamp,
  FinderRunModelBadge,
  FinderRunPromptDetails,
  DiscoverySummaryBar,
  FinderDiscoveryDetails,
  ColorSwatch,
} from '../../../shared/ui/finder/index.ts';
import type { DiscoverySection } from '../../../shared/ui/finder/index.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import type { RunHistoryRow } from '../selectors/colorEditionFinderSelectors.ts';
import type { ColorRegistryEntry } from '../types.ts';

interface CefRunHistoryRowProps {
  readonly row: RunHistoryRow;
  readonly colorRegistry: readonly ColorRegistryEntry[];
  readonly onDelete: (runNumber: number) => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

export const CefRunHistoryRow = memo(function CefRunHistoryRow({
  row,
  colorRegistry,
  onDelete,
  expanded,
  onToggle,
}: CefRunHistoryRowProps) {
  const hexMap = useMemo(() => new Map(colorRegistry.map(c => [c.name, c.hex])), [colorRegistry]);
  const selColors = row.selected?.colors ?? [];
  const selEditions = row.selected?.editions ?? {};

  const discoverySections = useMemo((): DiscoverySection[] => {
    const log = row.discoveryLog;
    const sections: DiscoverySection[] = [];
    if (row.siblingsExcluded.length > 0) {
      sections.push({ title: 'Siblings Excluded', format: 'chips', chipClass: 'sf-chip-danger', items: row.siblingsExcluded });
    }
    if (log.confirmedCount > 0) {
      sections.push({ title: 'Confirmed from Known', format: 'chips', chipClass: 'sf-chip-success', items: log.confirmedFromKnown });
    }
    if (log.addedNewCount > 0) {
      sections.push({ title: 'Added New', format: 'chips', chipClass: 'sf-chip-accent', items: log.addedNew });
    }
    if (log.rejectedCount > 0) {
      sections.push({ title: 'Rejected from Known', format: 'chips', chipClass: 'sf-chip-danger', items: log.rejectedFromKnown });
    }
    if (log.urlsCheckedCount > 0) {
      sections.push({ title: 'URLs Checked', format: 'lines', items: log.urlsChecked });
    }
    if (log.queriesRunCount > 0) {
      sections.push({ title: 'Queries Run', format: 'lines', items: log.queriesRun });
    }
    return sections;
  }, [row.discoveryLog, row.siblingsExcluded]);

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
          #{row.runNumber}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{row.ranAt?.split('T')[0] ?? ''}</span>
        <FinderRunTimestamp startedAt={row.startedAt} durationMs={row.durationMs} />
        {row.model && (
          <FinderRunModelBadge
            model={row.model}
            accessMode={row.accessMode}
            effortLevel={row.effortLevel}
            fallbackUsed={row.fallbackUsed}
            thinking={row.thinking}
            webSearch={row.webSearch}
          />
        )}
        <Chip label={`${row.colorCount} colors`} className="sf-chip-accent" />
        <Chip label={`${row.editionCount} editions`} className="sf-chip-purple" />
        <div className="flex-1" />
        {row.validationStatus === 'rejected' ? (
          <Chip label="Rejected" className="sf-chip-danger" />
        ) : (
          <Chip label="Valid" className="sf-chip-success" />
        )}
        {row.isLatest && <Chip label="LATEST" className="sf-chip-teal-strong" />}
        {row.rejectionSummary && (
          <span className="text-[9px] font-mono sf-text-muted truncate max-w-[180px]" title={row.rejectionSummary}>
            {row.rejectionSummary}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(row.runNumber); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t sf-border-soft flex flex-col gap-3">
          {/* Selected output summary */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1.5">Selected Output</div>
            <div className="flex flex-wrap gap-1 mb-1">
              {selColors.map(name => {
                const parts = name.split('+').map(a => hexMap.get(a.trim()) || '');
                return (
                  <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 sf-surface-panel rounded text-[10px] font-mono sf-text-primary">
                    <ColorSwatch hexParts={parts} size="sm" />
                    {name}
                  </span>
                );
              })}
            </div>
            {Object.keys(selEditions).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.keys(selEditions).map(slug => (
                  <span key={slug} className="text-[10px] font-mono font-semibold sf-chip-purple px-1.5 py-0.5 rounded">
                    {slug}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Discovery summary + details */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1.5">Discovery Summary</div>
            <DiscoverySummaryBar log={row.discoveryLog} />
          </div>

          <FinderDiscoveryDetails
            sections={discoverySections}
            storageKey={`cef:discovery:${row.runNumber}`}
          />

          {/* System prompt, user message, LLM response */}
          <FinderRunPromptDetails
            systemPrompt={row.systemPrompt}
            userMessage={row.userMessage}
            response={row.responseJson}
            storageKeyPrefix={`cef:prompt:${row.runNumber}`}
          />
        </div>
      )}
    </div>
  );
});
