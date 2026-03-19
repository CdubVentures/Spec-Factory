import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummaryPayload } from '../src/features/indexing/orchestration/index.js';

test('buildRunSummaryPayload exposes category_authority telemetry and omits legacy helper section', () => {
  const summary = buildRunSummaryPayload({
    normalizeAmbiguityLevelFn: () => 'none',
    isHelperSyntheticSourceFn: () => false,
    buildTopEvidenceReferencesFn: () => [],
    identityReport: { pages: [] },
    sourceResults: [],
    discoveryResult: { candidates: [] },
    helperContext: { seed_urls: [], stats: {} },
    helperSupportiveSyntheticSources: [],
    helperFilledFields: [],
    helperMismatches: [],
    llmTargetFields: [],
    goldenExamples: [],
    contribution: { llmFields: [], componentFields: [] },
    manufacturerSources: [],
    needSet: { needs: [] },
    phase07PrimeSources: { summary: {} },
    phase08Extraction: { summary: {}, validator: {} },
    parserHealthRows: [],
  });

  assert.equal(
    Object.prototype.hasOwnProperty.call(summary, 'category_authority'),
    true,
    'runProduct summary telemetry should include category_authority section',
  );
  const legacyHelperSectionKey = `helper${'_files'}`;
  assert.equal(
    Object.prototype.hasOwnProperty.call(summary, legacyHelperSectionKey),
    false,
    'runProduct summary telemetry should not emit legacy category_authority compatibility section',
  );
});
