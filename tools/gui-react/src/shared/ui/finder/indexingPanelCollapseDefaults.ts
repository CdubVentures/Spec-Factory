import type { IndexingPanelId } from './IndexingPanelHeader.tsx';

export const INDEXING_PANEL_COLLAPSE_IDS = [
  'picker',
  'pipeline',
  'cef',
  'pif',
  'rdf',
  'sku',
  'key',
] as const satisfies readonly IndexingPanelId[];

export type IndexingPanelCollapseId = typeof INDEXING_PANEL_COLLAPSE_IDS[number];
export type IndexingTopPanelCollapseId = Extract<IndexingPanelCollapseId, 'picker' | 'pipeline'>;

export const INDEXING_TOP_PANEL_COLLAPSE_IDS = [
  'picker',
  'pipeline',
] as const satisfies readonly IndexingTopPanelCollapseId[];

export const INDEXING_PANEL_COLLAPSE_DEFAULTS: Record<IndexingPanelCollapseId, boolean> = {
  picker: false,
  pipeline: false,
  cef: false,
  pif: false,
  rdf: false,
  sku: false,
  key: false,
};

export function getIndexingPanelCollapsedDefault(panelId: IndexingPanelCollapseId): boolean {
  return INDEXING_PANEL_COLLAPSE_DEFAULTS[panelId];
}
