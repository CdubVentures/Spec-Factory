// WHY: Runtime Ops panel for Crawl4AI artifacts. Thin ArtifactPanelConfig
// consumer — mirrors ExtractionScreenshotPanel / ExtractionVideoPanel pattern
// so every extraction plugin renders through the same shared primitive.
// previewType: 'download' surfaces each JSON bundle as a "open in new tab"
// link (no thumbnail — the bundle is structured JSON, not an image).

import { ExtractionArtifactPanel, type ArtifactPanelConfig } from './ExtractionArtifactPanel.tsx';
import type { ExtractionPluginData } from '../../types.ts';

const CRAWL4AI_CONFIG: ArtifactPanelConfig = {
  pluginKey: 'crawl4ai',
  title: 'Crawl4AI',
  subtitle: 'Markdown \u00B7 Tables \u00B7 Lists',
  chipLabel: 'Python \u00B7 BS4',
  tip: 'Per-URL extraction bundle written by the Python sidecar. Each JSON file carries markdown, spec tables, and lists for downstream bundle + LLM-review phases.',
  emptyIcon: '\uD83D\uDCDD',
  emptyHeading: 'No Crawl4AI Artifacts Yet',
  emptyDescription: 'Bundles appear here once the Python sidecar extracts from a fetched URL.',
  countField: 'table_count',
  countLabel: 'Tables',
  locationPrefix: 'extractions/crawl4ai/',
  previewType: 'download',
  assetUrl: (runId, _entry, filename) =>
    `/api/v1/indexlab/run/${encodeURIComponent(runId)}/runtime/extractions/crawl4ai/${encodeURIComponent(filename)}`,
};

interface ExtractionCrawl4aiPanelProps {
  data: ExtractionPluginData;
  persistScope: string;
  runId: string;
}

export function ExtractionCrawl4aiPanel({ data, persistScope, runId }: ExtractionCrawl4aiPanelProps) {
  return <ExtractionArtifactPanel config={CRAWL4AI_CONFIG} data={data} persistScope={persistScope} runId={runId} />;
}
