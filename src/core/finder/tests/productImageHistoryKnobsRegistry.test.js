import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FINDER_MODULE_MAP } from '../finderModuleRegistry.js';

const expectedKnobs = [
  ['priorityViewRunImageHistoryEnabled', 'Image History'],
  ['individualViewRunImageHistoryEnabled', 'Image History'],
  ['loopRunImageHistoryEnabled', 'Image History'],
  ['priorityViewRunLinkValidationEnabled', 'Link Validation'],
  ['individualViewRunLinkValidationEnabled', 'Link Validation'],
  ['loopRunLinkValidationEnabled', 'Link Validation'],
];

describe('PIF image history and link validation knobs', () => {
  const settings = FINDER_MODULE_MAP.productImageFinder.settingsSchema;
  const byKey = new Map(settings.map((entry) => [entry.key, entry]));

  for (const [key, group] of expectedKnobs) {
    it(`${key} is a visible bool setting in ${group}`, () => {
      const entry = byKey.get(key);
      assert.ok(entry, `${key} must be registered on productImageFinder`);
      assert.equal(entry.type, 'bool');
      assert.equal(entry.default, false);
      assert.equal(entry.uiGroup, group);
      assert.notEqual(entry.hidden, true);
    });
  }

  it('adds exactly three Image History knobs and three Link Validation knobs', () => {
    const imageHistory = settings.filter((entry) => entry.uiGroup === 'Image History');
    const linkValidation = settings.filter((entry) => entry.uiGroup === 'Link Validation');
    assert.equal(imageHistory.length, 3);
    assert.equal(linkValidation.length, 3);
  });
});
