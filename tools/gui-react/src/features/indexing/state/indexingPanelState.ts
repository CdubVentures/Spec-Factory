import {
  getIndexingPanelCollapsedDefault,
  INDEXING_TOP_PANEL_COLLAPSE_IDS,
  type IndexingTopPanelCollapseId,
} from '../../../shared/ui/finder/indexingPanelCollapseDefaults.ts';

export function deriveIndexingPanelCollapsed(collapseValues: Record<string, boolean>) {
  const result = {} as Record<IndexingTopPanelCollapseId, boolean>;
  for (const key of INDEXING_TOP_PANEL_COLLAPSE_IDS) {
    result[key] = collapseValues[`indexing:panel:${key}`] ?? getIndexingPanelCollapsedDefault(key);
  }
  return result;
}

