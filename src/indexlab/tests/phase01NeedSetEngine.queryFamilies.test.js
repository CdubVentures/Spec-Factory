import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveQueryFamilies } from './helpers/phase01NeedSetHarness.js';

describe('deriveQueryFamilies', () => {
  const cases = [
    { contentTarget: ['manual'], domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['pdf'], domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['support'], domainHints: [], expected: ['support_docs'] },
    { contentTarget: ['spec'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['product_page'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['review'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['lab_review'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['spec_sheet'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['manual_pdf'], domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['benchmark'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['teardown'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['lab'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['datasheet'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['comparison'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['reference'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['doc'], domainHints: [], expected: ['support_docs'] },
    { contentTarget: ['documentation'], domainHints: [], expected: ['support_docs'] },
    { contentTarget: ['datasheet_pdf'], domainHints: [], expected: ['manual_pdf'] },
    { contentTarget: ['spec_pdf'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['teardown_review'], domainHints: [], expected: ['manufacturer_html'] },
    { contentTarget: ['unknown_token'], domainHints: [], expected: ['fallback_web'] },
    { contentTarget: [], domainHints: [], expected: ['fallback_web'] },
    { contentTarget: [], domainHints: ['rtings.com'], expected: ['manufacturer_html'] },
    { contentTarget: ['manual', 'spec'], domainHints: [], expected: ['manual_pdf', 'manufacturer_html'] },
    { contentTarget: ['  SPEC  '], domainHints: [], expected: ['manufacturer_html'] },
  ];

  for (const { contentTarget, domainHints, expected } of cases) {
    it(`routes ${JSON.stringify(contentTarget)} + hints=${domainHints.length} -> ${JSON.stringify(expected)}`, () => {
      const result = deriveQueryFamilies(contentTarget, domainHints);
      assert.deepStrictEqual(result, expected);
    });
  }
});
