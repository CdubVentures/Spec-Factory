import { ExtractionArtifactPanel, type ArtifactPanelConfig } from './ExtractionArtifactPanel.tsx';
import type { ExtractionPluginData } from '../../types.ts';

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
  formatFields: ['format'],
  assetUrl: (runId, entry, _filename) =>
    `/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/video/${encodeURIComponent(entry.worker_id)}`,
};

interface ExtractionVideoPanelProps {
  data: ExtractionPluginData;
  persistScope: string;
  runId: string;
}

export function ExtractionVideoPanel({ data, persistScope, runId }: ExtractionVideoPanelProps) {
  return <ExtractionArtifactPanel config={VIDEO_CONFIG} data={data} persistScope={persistScope} runId={runId} />;
}
