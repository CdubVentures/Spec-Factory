import { Fragment, useMemo, useState, useCallback } from 'react';
import { api } from '../../../../api/client.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { formatBytes, truncateUrl } from '../../helpers.ts';
import type { ExtractionPluginData, ExtractionPluginEntry } from '../../types.ts';

// WHY: Local type cast — screenshot-specific result fields spread by the builder.
interface ScreenshotRecord extends ExtractionPluginEntry {
  display_label: string;
  screenshot_count: number;
  total_bytes: number;
  formats: string[];
  has_stitched: boolean;
  filenames: string[];
}

interface DomainGroup {
  domain: string;
  entries: ScreenshotRecord[];
  totalScreenshots: number;
  totalBytes: number;
  stitchedCount: number;
}

interface ExtractionScreenshotPanelProps {
  data: ExtractionPluginData;
  persistScope: string;
  runId: string;
}

export function ExtractionScreenshotPanel({ data, persistScope, runId }: ExtractionScreenshotPanelProps) {
  const scrollRef = usePersistedScroll(`scroll:extractionScreenshot:${persistScope}`);
  const [expanded, toggleExpanded, replaceExpanded] = usePersistedExpandMap(
    `runtimeOps:extraction:screenshot:expanded:${persistScope}`,
  );
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const records = data.entries as ScreenshotRecord[];

  const stats = useMemo(() => {
    let totalScreenshots = 0;
    let totalBytes = 0;
    let stitchedCount = 0;
    const formatSet = new Set<string>();
    for (const r of records) {
      totalScreenshots += r.screenshot_count || 0;
      totalBytes += r.total_bytes || 0;
      if (r.has_stitched) stitchedCount += 1;
      if (Array.isArray(r.formats)) for (const f of r.formats) formatSet.add(f);
    }
    return { totalScreenshots, totalBytes, stitchedCount, formats: [...formatSet] };
  }, [records]);

  // WHY: Group by host. If host is empty (pre-fix events), group by worker_id.
  const groups = useMemo((): DomainGroup[] => {
    const map = new Map<string, ScreenshotRecord[]>();
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
        totalScreenshots: entries.reduce((s, e) => s + (e.screenshot_count || 0), 0),
        totalBytes: entries.reduce((s, e) => s + (e.total_bytes || 0), 0),
        stitchedCount: entries.filter((e) => e.has_stitched).length,
      }));
  }, [records]);

  const expandableDomains = useMemo(() => groups.filter((g) => g.entries.length > 0), [groups]);
  const allExpanded = expandableDomains.length > 0
    && expandableDomains.every((g) => expanded[g.domain]);

  const handlePreview = useCallback((filename: string) => {
    if (!runId) return;
    setPreviewSrc(`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(filename)}`);
  }, [runId]);

  if (!data.entries.length) {
    return (
      <StageEmptyState
        icon="&#x1F4F7;"
        heading="No Screenshots Yet"
        description="Screenshots will appear here once the extraction phase captures page data."
      />
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Screenshots</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Page Capture</span>
        </>}
        trailing={<>
          <Chip label="Playwright &middot; Script" className="sf-chip-info" />
          <Tip text="Full-page and targeted selector screenshots captured from each URL." />
        </>}
      >
        <HeroStatGrid>
          <HeroStat value={data.total} label="URLs Captured" />
          <HeroStat value={stats.totalScreenshots} label="Screenshots" colorClass="text-[var(--sf-token-accent)]" />
          <HeroStat value={formatBytes(stats.totalBytes)} label="Total Size" />
          <HeroStat value={stats.stitchedCount} label="Stitched" />
        </HeroStatGrid>

        {stats.formats.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="sf-text-nano sf-text-muted uppercase tracking-wide font-semibold">Formats</span>
            {stats.formats.map((f) => (
              <Chip key={f} label={f.toUpperCase()} className="sf-chip-info" />
            ))}
          </div>
        )}
      </HeroBand>

      {/* WHY: Section header matches domain health table — inline count + Open/Close All */}
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

      {/* WHY: Matches domain health table wrapper — border + rounded */}
      <div className="overflow-x-auto border sf-border-soft rounded-sm">
        <table className="min-w-full text-xs">
          <thead className="sf-surface-elevated sticky top-0">
            <tr>
              <th className="py-2 px-1 w-6 border-b sf-border-soft" />
              {['domain', 'urls', 'worker', 'screenshots', 'size', 'stitched', 'location', ''].map((h) => (
                <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <DomainRow
                key={g.domain}
                group={g}
                isExpanded={Boolean(expanded[g.domain])}
                onToggle={() => toggleExpanded(g.domain)}
                onPreview={handlePreview}
                runId={runId}
              />
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
            <img
              src={previewSrc}
              alt="Screenshot preview"
              className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
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

// ── Domain parent row + URL child rows ─────────────────────────────────────

function DomainRow({ group, isExpanded, onToggle, onPreview, runId }: {
  group: DomainGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onPreview: (filename: string) => void;
  runId: string;
}) {
  const openFolder = useCallback(() => {
    if (!runId) return;
    // WHY: Direct fetch — fire-and-forget to open the local folder via OS shell.
    fetch(`/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/extraction/open-folder/screenshots`)
      .catch(() => {});
  }, [runId]);
  return (
    <Fragment>
      <tr
        className="border-b sf-border-soft hover:sf-surface-elevated cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-1.5 px-1 text-center sf-text-subtle w-6">
          <span className="sf-text-caption">{isExpanded ? '\u25BC' : '\u25B6'}</span>
        </td>
        <td className="py-1.5 px-4 font-mono sf-text-primary">
          {group.domain}
          <span className="ml-1.5 text-[10px] sf-text-subtle font-normal">({group.entries.length})</span>
        </td>
        <td className="py-1.5 px-4 font-mono sf-text-subtle">{group.entries.length}</td>
        <td className="py-1.5 px-4 sf-text-subtle">-</td>
        <td className="py-1.5 px-4 font-mono sf-text-subtle">{group.totalScreenshots}</td>
        <td className="py-1.5 px-4 font-mono sf-text-subtle">{formatBytes(group.totalBytes)}</td>
        <td className="py-1.5 px-4">
          {group.stitchedCount > 0
            ? <Chip label={String(group.stitchedCount)} className="sf-chip-info" />
            : <span className="sf-text-subtle">-</span>}
        </td>
        <td className="py-1.5 px-4 sf-text-subtle">-</td>
        <td />
      </tr>

      {isExpanded && group.entries.map((entry, i) => (
        <tr key={`${group.domain}-${i}`} className="sf-surface-panel border-b sf-border-soft">
          <td />
          <td colSpan={2} className="py-1 px-4 pl-8">
            {entry.url ? (
              <div className="sf-text-caption font-mono sf-link-accent truncate max-w-[24rem]" title={entry.url}>
                {truncateUrl(entry.url, 60)}
              </div>
            ) : (
              <div className="sf-text-caption font-mono sf-text-muted">(URL pending — run with latest code)</div>
            )}
          </td>
          <td className="py-1 px-4 font-mono sf-text-subtle">{entry.display_label || entry.worker_id}</td>
          <td className="py-1 px-4 font-mono sf-text-subtle">{entry.screenshot_count || 0}</td>
          <td className="py-1 px-4 font-mono sf-text-subtle">{formatBytes(entry.total_bytes || 0)}</td>
          <td className="py-1 px-4">
            {entry.has_stitched
              ? <Chip label="YES" className="sf-chip-info" />
              : <span className="sf-text-muted sf-text-nano">no</span>}
          </td>
          {/* WHY: Location — full path per file, clickable to open local folder. */}
          <td className="py-1 px-4">
            {Array.isArray(entry.filenames) && entry.filenames.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {entry.filenames.map((fn, fi) => (
                  <button
                    key={fi}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openFolder(); }}
                    title="Click to open folder"
                    className="flex items-center gap-1.5 text-left group cursor-pointer"
                  >
                    <Chip label="LOCAL" className="sf-chip-neutral group-hover:sf-chip-info transition-colors shrink-0" />
                    <span className="sf-text-caption font-mono sf-text-subtle group-hover:sf-text-primary group-hover:underline whitespace-nowrap">
                      screenshots/{fn}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <span className="sf-text-muted sf-text-nano">not persisted</span>
            )}
          </td>
          {/* WHY: One preview button per screenshot file. */}
          <td className="py-1 px-2">
            <div className="flex gap-1 justify-end">
              {Array.isArray(entry.filenames) && entry.filenames.length > 0 ? (
                entry.filenames.map((fn, fi) => (
                  <button
                    key={fi}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPreview(fn); }}
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
  );
}
