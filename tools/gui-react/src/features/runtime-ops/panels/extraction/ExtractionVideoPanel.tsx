import { useMemo } from 'react';
import { ExtractionArtifactPanel, type ArtifactPanelConfig } from './ExtractionArtifactPanel.tsx';
import { FormatBadge } from '../../../../shared/ui/icons/FormatBadge.tsx';
import type { ExtractionPluginData, ExtractionPluginEntry } from '../../types.ts';

interface VideoRecord extends ExtractionPluginEntry {
  format?: string;
  [key: string]: unknown;
}

const VIDEO_CONFIG: ArtifactPanelConfig = {
  pluginKey: 'video',
  title: 'Videos',
  subtitle: 'Page Recording',
  chipLabel: 'Playwright \u00B7 WebM',
  tip: 'WebM video recordings captured from each fetch worker during page interaction.',
  emptyIcon: '&#x1F3AC;',
  emptyHeading: 'No Videos Yet',
  emptyDescription: 'Video recordings will appear here once fetch workers capture page interactions.',
  countField: 'video_count',
  countLabel: 'Videos',
  locationPrefix: 'video/',
  previewType: 'video',
  assetUrl: (runId, entry, _filename) =>
    `/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/video/${encodeURIComponent(entry.worker_id)}`,
};

interface ExtractionVideoPanelProps {
  data: ExtractionPluginData;
  persistScope: string;
  runId: string;
}

export function ExtractionVideoPanel({ data, persistScope, runId }: ExtractionVideoPanelProps) {
  const records = data.entries as VideoRecord[];

  const extraHeroBand = useMemo(() => {
    const formatSet = new Set<string>();
    for (const r of records) {
      const fmt = typeof r.format === 'string' ? r.format : '';
      if (fmt) formatSet.add(fmt);
    }
    if (formatSet.size === 0) formatSet.add('webm');
    const formats = [...formatSet];
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
    ...VIDEO_CONFIG,
    extraHeroBand,
  }), [extraHeroBand]);

  return <ExtractionArtifactPanel config={config} data={data} persistScope={persistScope} runId={runId} />;
}
