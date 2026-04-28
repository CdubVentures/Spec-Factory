import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterFinderSettingsByEntryScope,
  getFinderSettingsEntryScopeOptions,
  hasMixedFinderSettingsEntryScopes,
} from '../moduleSettingsEntryScope.ts';

test('PIF exposes global and per-category entry-scope panes', () => {
  assert.equal(hasMixedFinderSettingsEntryScopes('productImageFinder'), true);
  assert.deepEqual(
    getFinderSettingsEntryScopeOptions('productImageFinder').map((option) => option.scope),
    ['global', 'category'],
  );
});

test('PIF entry-scope filtering keeps global knobs separate from category view contracts', () => {
  const globalKeys = filterFinderSettingsByEntryScope('productImageFinder', 'global').map((entry) => entry.key);
  const categoryKeys = filterFinderSettingsByEntryScope('productImageFinder', 'category').map((entry) => entry.key);

  assert.ok(globalKeys.includes('evalEnabled'));
  assert.ok(globalKeys.includes('heroCount'));
  assert.equal(globalKeys.includes('viewConfig'), false);
  assert.equal(globalKeys.includes('carouselScoredViews'), false);

  assert.ok(categoryKeys.includes('viewConfig'));
  assert.ok(categoryKeys.includes('carouselScoredViews'));
  assert.equal(categoryKeys.includes('evalEnabled'), false);
  assert.equal(categoryKeys.includes('heroCount'), false);
});

test('global-only finder modules do not request a second entry-scope pane', () => {
  assert.equal(hasMixedFinderSettingsEntryScopes('colorEditionFinder'), false);
  assert.deepEqual(
    getFinderSettingsEntryScopeOptions('colorEditionFinder').map((option) => option.scope),
    ['global'],
  );
});
