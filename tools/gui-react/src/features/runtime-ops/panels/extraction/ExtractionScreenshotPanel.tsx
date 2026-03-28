import { useMemo } from 'react';
import { ExtractionArtifactPanel, type ArtifactPanelConfig } from './ExtractionArtifactPanel.tsx';
import { HeroStat } from '../../components/HeroStat.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { FormatBadge } from '../../../../shared/ui/icons/FormatBadge.tsx';
import type { ExtractionPluginData, ExtractionPluginEntry } from '../../types.ts';

interface ScreenshotRecord extends ExtractionPluginEntry {
  has_stitched: boolean;
  formats: string[];
  [key: string]: unknown;
}

const SCREENSHOT_CONFIG: ArtifactPanelConfig = {
  pluginKey: 'screenshot',
  title: 'Screenshots',
  subtitle: 'Page Capture',
  chipLabel: 'Playwright \u00B7 Script',
  tip: 'Full-page and targeted selector screenshots captured from each URL.',
  emptyIcon: '&#x1F4F7;',
  emptyHeading: 'No Screenshots Yet',
  emptyDescription: 'Screenshots will appear here once the extraction phase captures page data.',
  countField: 'screenshot_count',
  countLabel: 'Screenshots',
  locationPrefix: 'screenshots/',
  previewType: 'image',
  assetUrl: (runId, _entry, filename) =>
    filename ? `/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(filename)}` : '',
  extraColumns: ['stitched'],
  renderExtraCell: (entry, col) => {
    if (col !== 'stitched') return null;
    const r = entry as unknown as ScreenshotRecord;
    return r.has_stitched
      ? <Chip label="YES" className="sf-chip-info" />
      : <span className="sf-text-muted sf-text-nano">no</span>;
  },
  renderExtraSummaryCell: (group, col) => {
    if (col !== 'stitched') return null;
    const count = group.entries.filter((e) => (e as unknown as ScreenshotRecord).has_stitched).length;
    return count > 0
      ? <Chip label={String(count)} className="sf-chip-info" />
      : <span className="sf-text-subtle">-</span>;
  },
};

interface ExtractionScreenshotPanelProps {
  data: ExtractionPluginData;
  persistScope: string;
  runId: string;
}

export function ExtractionScreenshotPanel({ data, persistScope, runId }: ExtractionScreenshotPanelProps) {
  const records = data.entries as ScreenshotRecord[];

  const extraHeroStats = useMemo(() => {
    let stitchedCount = 0;
    for (const r of records) {
      if (r.has_stitched) stitchedCount += 1;
    }
    return () => <HeroStat value={stitchedCount} label="Stitched" />;
  }, [records]);

  const extraHeroBand = useMemo(() => {
    const formatSet = new Set<string>();
    for (const r of records) {
      if (Array.isArray(r.formats)) for (const f of r.formats) formatSet.add(f);
    }
    const formats = [...formatSet];
    if (formats.length === 0) return undefined;
    return () => (
      <div className="flex items-center gap-2">
        <span className="sf-text-nano sf-text-muted uppercase tracking-wide font-semibold">Formats</span>
        {formats.map((f) => (
          <FormatBadge key={f} format={f} />
        ))}
      </div>
    );
  }, [records]);

  const config = useMemo(() => ({
    ...SCREENSHOT_CONFIG,
    extraHeroStats,
    extraHeroBand,
  }), [extraHeroStats, extraHeroBand]);

  return <ExtractionArtifactPanel config={config} data={data} persistScope={persistScope} runId={runId} />;
}
