// WHY: Generic extraction artifact panel — shared layout for screenshots, videos,
// and future capture plugins. O(1) scaling: add a config object, not a new component.

import { Fragment, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { formatBytes, truncateUrl } from '../../helpers.ts';
import type { ExtractionPluginData, ExtractionPluginEntry } from '../../types.ts';

// WHY: Generic record — plugins spread their own fields via the builder.
interface ArtifactRecord extends ExtractionPluginEntry {
  display_label: string;
  filenames: string[];
  file_sizes: number[];
  total_bytes: number;
  [key: string]: unknown;
}

interface DomainGroup {
  domain: string;
  entries: ArtifactRecord[];
  totalCount: number;
  totalBytes: number;
}

export interface ArtifactPanelConfig {
  pluginKey: string;
  title: string;
  subtitle: string;
  chipLabel: string;
  tip: string;
  emptyIcon: string;
  emptyHeading: string;
  emptyDescription: string;
  countField: string;
  countLabel: string;
  locationPrefix: string;
  previewType: 'image' | 'video';
  assetUrl: (runId: string, entry: ArtifactRecord, filename: string) => string;
  extraHeroStats?: (records: ArtifactRecord[]) => ReactNode;
  extraHeroBand?: (records: ArtifactRecord[]) => ReactNode;
  extraColumns?: string[];
  renderExtraCell?: (entry: ArtifactRecord, col: string) => ReactNode;
  renderExtraSummaryCell?: (group: DomainGroup, col: string) => ReactNode;
}

interface ExtractionArtifactPanelProps {
  config: ArtifactPanelConfig;
  data: ExtractionPluginData;
  persistScope: string;
  runId: string;
}

export function ExtractionArtifactPanel({ config, data, persistScope, runId }: ExtractionArtifactPanelProps) {
  const scrollRef = usePersistedScroll(`scroll:extraction${config.pluginKey}:${persistScope}`);
  const [expanded, toggleExpanded, replaceExpanded] = usePersistedExpandMap(
    `runtimeOps:extraction:${config.pluginKey}:expanded:${persistScope}`,
  );
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  const records = data.entries as ArtifactRecord[];

  const stats = useMemo(() => {
    let totalCount = 0;
    let totalBytes = 0;
    for (const r of records) {
      totalCount += Number(r[config.countField]) || 0;
      totalBytes += r.total_bytes || 0;
    }
    return { totalCount, totalBytes };
  }, [records, config.countField]);

  const groups = useMemo((): DomainGroup[] => {
    const map = new Map<string, ArtifactRecord[]>();
    for (const r of records) {
      const key = r.host || r.worker_id || 'unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([domain, entries]) => ({
        domain,
        entries,
        totalCount: entries.reduce((s, e) => s + (Number(e[config.countField]) || 0), 0),
        totalBytes: entries.reduce((s, e) => s + (e.total_bytes || 0), 0),
      }));
  }, [records, config.countField]);

  const expandableDomains = useMemo(() => groups.filter((g) => g.entries.length > 0), [groups]);
  const allExpanded = expandableDomains.length > 0
    && expandableDomains.every((g) => expanded[g.domain]);

  const handlePreview = useCallback((entry: ArtifactRecord, filename: string) => {
    if (!runId) return;
    setPreviewSrc(config.assetUrl(runId, entry, filename));
  }, [runId, config]);

  const openFolder = useCallback(() => {
    if (!runId) return;
    fetch(`/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/extraction/open-folder/${config.pluginKey}`)
      .catch(() => {});
  }, [runId, config.pluginKey]);

  const hasRecords = records.length > 0;
  useEffect(() => {
    if (!runId || !hasRecords) return;
    fetch(`/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/extraction/resolve-folder/${config.pluginKey}`)
      .then((r) => r.json() as Promise<{ path: string | null }>)
      .then((body) => { if (body.path) setResolvedPath(body.path); })
      .catch(() => {});
  }, [runId, config.pluginKey, hasRecords]);

  if (!data.entries.length) {
    return (
      <StageEmptyState
        icon={config.emptyIcon}
        heading={config.emptyHeading}
        description={config.emptyDescription}
      />
    );
  }

  const extraCols = config.extraColumns ?? [];
  const baseColumns = ['domain', 'urls', 'worker', config.countLabel.toLowerCase(), 'size', ...extraCols, 'location', ''];

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">{config.title}</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; {config.subtitle}</span>
        </>}
        trailing={<>
          <Chip label={config.chipLabel} className="sf-chip-info" />
          <Tip text={config.tip} />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={data.total} label="URLs Captured" />
          <HeroStat value={stats.totalCount} label={config.countLabel} colorClass="text-[var(--sf-token-accent)]" />
          <HeroStat value={formatBytes(stats.totalBytes)} label="Total Size" />
          {config.extraHeroStats?.(records)}
        </HeroStatGrid>
        {config.extraHeroBand?.(records)}
        {resolvedPath && (
          <div className="flex items-center gap-2 mt-1">
            <span className="sf-text-nano sf-text-muted uppercase tracking-wide font-semibold">Storage</span>
            <Chip label="LOCAL" className="sf-chip-neutral" />
            <button
              type="button"
              onClick={openFolder}
              title={resolvedPath}
              className="font-mono text-[11px] sf-text-subtle hover:sf-text-primary hover:underline cursor-pointer truncate max-w-[600px]"
            >
              {resolvedPath}
            </button>
          </div>
        )}
      </HeroBand>

      <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
        <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">
          capture log &middot; {groups.length} domain{groups.length !== 1 ? 's' : ''} &middot; {data.total} url{data.total !== 1 ? 's' : ''}
        </span>
        {expandableDomains.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const g of expandableDomains) next[g.domain] = !allExpanded;
              replaceExpanded(next);
            }}
            className="px-2 py-0.5 rounded sf-text-caption font-medium sf-icon-button hover:sf-primary-button transition-colors"
          >
            {allExpanded ? 'Close All' : 'Open All'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto border sf-border-soft rounded-sm">
        <table className="min-w-full text-xs">
          <thead className="sf-surface-elevated sticky top-0">
            <tr>
              <th className="py-2 px-1 w-6 border-b sf-border-soft" />
              {baseColumns.map((h) => (
                <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.domain}>
                <tr
                  className="border-b sf-border-soft hover:sf-surface-elevated cursor-pointer"
                  onClick={() => toggleExpanded(g.domain)}
                >
                  <td className="py-1.5 px-1 text-center sf-text-subtle w-6">
                    <span className="sf-text-caption">{expanded[g.domain] ? '\u25BC' : '\u25B6'}</span>
                  </td>
                  <td className="py-1.5 px-4 font-mono sf-text-primary">
                    {g.domain}
                    <span className="ml-1.5 text-[10px] sf-text-subtle font-normal">({g.entries.length})</span>
                  </td>
                  <td className="py-1.5 px-4 font-mono sf-text-subtle">{g.entries.length}</td>
                  <td className="py-1.5 px-4 sf-text-subtle">-</td>
                  <td className="py-1.5 px-4 font-mono sf-text-subtle">{g.totalCount}</td>
                  <td className="py-1.5 px-4 font-mono sf-text-subtle">{formatBytes(g.totalBytes)}</td>
                  {extraCols.map((col) => (
                    <td key={col} className="py-1.5 px-4">{config.renderExtraSummaryCell?.(g, col) ?? <span className="sf-text-subtle">-</span>}</td>
                  ))}
                  <td className="py-1.5 px-4 sf-text-subtle">-</td>
                  <td />
                </tr>

                {expanded[g.domain] && g.entries.map((entry, i) => (
                  <tr key={`${g.domain}-${i}`} className="sf-surface-panel border-b sf-border-soft">
                    <td />
                    <td colSpan={2} className="py-1 px-4 pl-8">
                      {entry.url ? (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sf-text-caption font-mono sf-link-accent truncate max-w-[24rem] block"
                          title={entry.url}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {truncateUrl(entry.url, 60)}
                        </a>
                      ) : (
                        <div className="sf-text-caption font-mono sf-text-muted">(URL pending)</div>
                      )}
                    </td>
                    <td className="py-1 px-4 font-mono sf-text-subtle">{entry.display_label || entry.worker_id}</td>
                    <td className="py-1 px-4 font-mono sf-text-subtle">{Number(entry[config.countField]) || 0}</td>
                    <td className="py-1 px-4 font-mono sf-text-subtle">
                      {Array.isArray(entry.file_sizes) && entry.file_sizes.length > 1
                        ? entry.file_sizes.map((s) => formatBytes(s)).join(', ')
                        : formatBytes(entry.total_bytes || 0)}
                    </td>
                    {extraCols.map((col) => (
                      <td key={col} className="py-1 px-4">{config.renderExtraCell?.(entry, col) ?? <span className="sf-text-muted sf-text-nano">-</span>}</td>
                    ))}
                    <td className="py-1 px-4">
                      {Array.isArray(entry.filenames) && entry.filenames.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {entry.filenames.map((fn, fi) => {
                            const sep = resolvedPath?.includes('\\') ? '\\' : '/';
                            const fullFilePath = resolvedPath
                              ? `${resolvedPath}${sep}${fn}`
                              : `${config.locationPrefix}${fn}`;
                            return (
                              <button
                                key={fi}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openFolder(); }}
                                title={fullFilePath}
                                className="flex items-center gap-1.5 text-left group cursor-pointer"
                              >
                                <Chip label="LOCAL" className="sf-chip-neutral group-hover:sf-chip-info transition-colors shrink-0" />
                                <span className="sf-text-caption font-mono sf-text-subtle group-hover:sf-text-primary group-hover:underline truncate max-w-[400px]">
                                  {fullFilePath}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="sf-text-muted sf-text-nano">not persisted</span>
                      )}
                    </td>
                    <td className="py-1 px-2">
                      <div className="flex gap-1 justify-end">
                        {Array.isArray(entry.filenames) && entry.filenames.length > 0 ? (
                          entry.filenames.map((fn, fi) => (
                            <button
                              key={fi}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handlePreview(entry, fn); }}
                              title={fn}
                              className="px-1 py-0.5 rounded sf-text-caption sf-icon-button hover:sf-primary-button transition-colors"
                            >
                              &#x1F50D;
                            </button>
                          ))
                        ) : (
                          <span className="sf-text-nano sf-text-muted">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {previewSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setPreviewSrc(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {config.previewType === 'video' ? (
              <video
                src={previewSrc}
                controls
                autoPlay
                muted
                playsInline
                className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
                onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
              />
            ) : (
              <img
                src={previewSrc}
                alt="Preview"
                className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <button
              type="button"
              onClick={() => setPreviewSrc(null)}
              className="absolute top-2 right-2 w-8 h-8 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 text-sm"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
