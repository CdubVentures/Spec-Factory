import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexlabRouteContext } from '../indexlabRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'toInt', 'toFloat', 'config', 'safeJoin', 'safeReadJson', 'path',
  'INDEXLAB_ROOT', 'OUTPUT_ROOT', 'processStatus', 'readJsonBody', 'broadcastWs',
  'runDataStorageState', 'storage', 'getIndexLabRoot', 'readIndexLabRunMeta',
  'resolveIndexLabRunDirectory', 'readIndexLabRunEvents', 'readIndexLabRunNeedSet',
  'readIndexLabRunSearchProfile', 'readIndexLabRunPhase07Retrieval',
  'readIndexLabRunPhase08Extraction', 'readIndexLabRunDynamicFetchDashboard',
  'readIndexLabRunSourceIndexingPackets', 'readIndexLabRunItemIndexingPacket',
  'readIndexLabRunRunMetaPacket', 'readIndexLabRunSerpExplorer',
  'readIndexLabRunLlmTraces', 'readIndexLabRunAutomationQueue',
  'readIndexLabRunEvidenceIndex', 'listIndexLabRuns',
  'buildRoundSummaryFromEvents', 'buildSearchHints', 'buildAnchorsSuggestions',
  'buildKnownValuesSuggestions', 'queryIndexSummary', 'urlIndexSummary',
  'highYieldUrls', 'promptIndexSummary', 'readKnobSnapshots',
  'evaluateAllSections', 'buildEvidenceReport', 'buildEffectiveSettingsSnapshot',
  'buildScreenshotManifestFromEvents', 'computeCompoundCurve', 'diffRunPlans',
  'buildFieldMapFromPacket', 'aggregateCrossRunMetrics', 'aggregateHostHealth',
];

const CORE_KEYS = [
  'jsonRes', 'toInt', 'toFloat', 'config', 'safeJoin', 'safeReadJson', 'path',
  'INDEXLAB_ROOT', 'OUTPUT_ROOT', 'processStatus', 'readJsonBody', 'broadcastWs',
  'runDataStorageState', 'storage', 'getIndexLabRoot',
];

test('createIndexlabRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createIndexlabRouteContext(null), TypeError);
  assert.throws(() => createIndexlabRouteContext('str'), TypeError);
  assert.throws(() => createIndexlabRouteContext([1]), TypeError);
});

test('createIndexlabRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createIndexlabRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createIndexlabRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createIndexlabRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createIndexlabRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createIndexlabRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
