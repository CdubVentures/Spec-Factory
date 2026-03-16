import { DEFAULT_PANEL_COLLAPSED, PANEL_KEYS, type PanelKey } from '../types';

export function deriveIndexingPanelCollapsed(collapseValues: Record<string, boolean>) {
  const result = {} as Record<PanelKey, boolean>;
  for (const key of PANEL_KEYS) {
    result[key] = collapseValues[`indexing:panel:${key}`] ?? DEFAULT_PANEL_COLLAPSED[key];
  }
  return result;
}

