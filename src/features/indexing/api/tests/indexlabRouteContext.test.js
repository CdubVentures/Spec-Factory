import test from 'node:test';
import { createIndexlabRouteContext } from '../indexlabRouteContext.js';
import {
  assertRouteContextContract,
  assertRouteContextRejectsInvalidInput,
} from '../../../../shared/tests/helpers/routeContextContractHarness.js';

const FORWARDED_KEYS = [
  'jsonRes', 'toInt', 'toFloat', 'config', 'safeJoin', 'safeReadJson', 'path',
  'INDEXLAB_ROOT', 'OUTPUT_ROOT', 'processStatus', 'readJsonBody', 'broadcastWs',
  'runDataStorageState', 'storage', 'getIndexLabRoot',
];

const HELPER_KEYS = [
  'readIndexLabRunMeta', 'resolveIndexLabRunDirectory',
  'readIndexLabRunEvents', 'readIndexLabRunNeedSet',
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

test('createIndexlabRouteContext throws TypeError on non-object input', () => {
  assertRouteContextRejectsInvalidInput(createIndexlabRouteContext);
});

test('createIndexlabRouteContext forwards dependencies and exposes runtime helpers', () => {
  assertRouteContextContract({
    createContext: createIndexlabRouteContext,
    forwardedKeys: FORWARDED_KEYS,
    helperKeys: HELPER_KEYS,
  });
});
