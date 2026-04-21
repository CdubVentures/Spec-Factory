import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { FINDER_PANELS } from '../../state/finderPanelRegistry.generated.ts';
import { FINDER_TAB_META } from '../finderTabMeta.ts';

describe('FINDER_TAB_META sync with FINDER_PANELS', () => {
  it('has exactly one entry per FINDER_PANELS id', () => {
    const registryIds = FINDER_PANELS.map((p) => p.id).sort();
    const metaIds = Object.keys(FINDER_TAB_META).sort();
    deepStrictEqual(metaIds, registryIds);
  });

  it('every entry exposes the required shape', () => {
    for (const id of Object.keys(FINDER_TAB_META)) {
      const entry = FINDER_TAB_META[id as keyof typeof FINDER_TAB_META];
      ok(typeof entry.icon === 'string' && entry.icon.length > 0, `${id}: icon`);
      ok(typeof entry.iconClass === 'string' && entry.iconClass.length > 0, `${id}: iconClass`);
      ok(typeof entry.shortName === 'string' && entry.shortName.length > 0, `${id}: shortName`);
      ok(typeof entry.useTabSummary === 'function', `${id}: useTabSummary`);
    }
  });
});
