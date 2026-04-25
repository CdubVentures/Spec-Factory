import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import {
  getIndexingPanelCollapsedDefault,
  INDEXING_PANEL_COLLAPSE_DEFAULTS,
  INDEXING_PANEL_COLLAPSE_IDS,
} from '../../../../shared/ui/finder/indexingPanelCollapseDefaults.ts';

describe('Indexing Lab panel collapse defaults', () => {
  it('keeps picker plus every finder tab panel open on first view', () => {
    deepStrictEqual(INDEXING_PANEL_COLLAPSE_IDS, [
      'picker',
      'pipeline',
      'cef',
      'pif',
      'rdf',
      'sku',
      'key',
    ]);

    for (const panelId of INDEXING_PANEL_COLLAPSE_IDS) {
      strictEqual(
        getIndexingPanelCollapsedDefault(panelId),
        false,
        `${panelId} should default open`,
      );
      strictEqual(INDEXING_PANEL_COLLAPSE_DEFAULTS[panelId], false);
    }
  });
});
