import {
  readIndexLabRunEvents, readIndexLabRunMeta, resolveIndexLabRunDirectory,
  readIndexLabRunNeedSet, readIndexLabRunSearchProfile,
  readIndexLabRunPhase07Retrieval, readIndexLabRunPhase08Extraction,
  readIndexLabRunDynamicFetchDashboard, readIndexLabRunSourceIndexingPackets,
  readIndexLabRunItemIndexingPacket, readIndexLabRunRunMetaPacket,
  readIndexLabRunSerpExplorer, readIndexLabRunLlmTraces,
  readIndexLabRunAutomationQueue, readIndexLabRunEvidenceIndex,
  listIndexLabRuns,
} from './index.js';
import { buildSearchHints, buildAnchorsSuggestions, buildKnownValuesSuggestions } from '../learning/index.js';
import { queryIndexSummary, urlIndexSummary, highYieldUrls, promptIndexSummary } from '../discovery/index.js';
import { readKnobSnapshots } from '../telemetry/index.js';
import {
  evaluateAllSections, buildEvidenceReport, buildEffectiveSettingsSnapshot,
  buildScreenshotManifestFromEvents,
} from '../validation/index.js';
import {
  computeCompoundCurve, diffRunPlans, buildFieldMapFromPacket,
  aggregateCrossRunMetrics, aggregateHostHealth,
} from '../analytics/index.js';
import { buildRoundSummaryFromEvents } from '../../../api/roundSummary.js';

export function createIndexlabRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, toInt, toFloat, config, safeJoin, safeReadJson, path, INDEXLAB_ROOT,
    processStatus,
  } = options;

  return {
    jsonRes, toInt, toFloat, config, safeJoin, safeReadJson, path, INDEXLAB_ROOT,
    processStatus, readIndexLabRunMeta, resolveIndexLabRunDirectory,
    readIndexLabRunEvents, readIndexLabRunNeedSet, readIndexLabRunSearchProfile,
    readIndexLabRunPhase07Retrieval, readIndexLabRunPhase08Extraction,
    readIndexLabRunDynamicFetchDashboard, readIndexLabRunSourceIndexingPackets,
    readIndexLabRunItemIndexingPacket, readIndexLabRunRunMetaPacket,
    readIndexLabRunSerpExplorer, readIndexLabRunLlmTraces,
    readIndexLabRunAutomationQueue, readIndexLabRunEvidenceIndex,
    listIndexLabRuns, buildRoundSummaryFromEvents, buildSearchHints,
    buildAnchorsSuggestions, buildKnownValuesSuggestions, queryIndexSummary,
    urlIndexSummary, highYieldUrls, promptIndexSummary, readKnobSnapshots,
    evaluateAllSections, buildEvidenceReport, buildEffectiveSettingsSnapshot,
    buildScreenshotManifestFromEvents, computeCompoundCurve, diffRunPlans,
    buildFieldMapFromPacket, aggregateCrossRunMetrics, aggregateHostHealth,
  };
}
