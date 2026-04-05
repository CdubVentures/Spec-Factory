import {
  readIndexLabRunEvents, readIndexLabRunMeta, resolveIndexLabRunDirectory,
  readIndexLabRunNeedSet, readIndexLabRunSearchProfile,
  readIndexLabRunPrimeSources,
  readIndexLabRunDynamicFetchDashboard, readIndexLabRunSourceIndexingPackets,
  readIndexLabRunItemIndexingPacket, readIndexLabRunRunMetaPacket,
  readIndexLabRunSerpExplorer,
  readIndexLabRunAutomationQueue,
  listIndexLabRuns,
} from './index.js';
import { buildSearchHints, buildAnchorsSuggestions, buildKnownValuesSuggestions } from './learningSuggestionEmitter.js';
import {
  evaluateAllSections, buildEvidenceReport, buildEffectiveSettingsSnapshot,
  buildScreenshotManifestFromEvents,
} from '../validation/index.js';
import {
  computeCompoundCurve, diffRunPlans, buildFieldMapFromPacket,
  aggregateCrossRunMetrics, aggregateHostHealth,
} from '../analytics/index.js';
import { buildRoundSummaryFromEvents } from '../domain/roundSummary.js';

export function createIndexlabRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, toInt, toFloat, config, safeJoin, safeReadJson, path, INDEXLAB_ROOT,
    processStatus,
    readJsonBody, broadcastWs, storage, OUTPUT_ROOT,
    getIndexLabRoot, getSpecDb,
  } = options;

  return {
    jsonRes, toInt, toFloat, config, safeJoin, safeReadJson, path, INDEXLAB_ROOT,
    processStatus, readJsonBody, broadcastWs, storage, OUTPUT_ROOT,
    getIndexLabRoot, getSpecDb,
    readIndexLabRunMeta, resolveIndexLabRunDirectory,
    readIndexLabRunEvents, readIndexLabRunNeedSet, readIndexLabRunSearchProfile,
    readIndexLabRunPrimeSources,
    readIndexLabRunDynamicFetchDashboard, readIndexLabRunSourceIndexingPackets,
    readIndexLabRunItemIndexingPacket, readIndexLabRunRunMetaPacket,
    readIndexLabRunSerpExplorer,
    readIndexLabRunAutomationQueue,
    listIndexLabRuns, buildRoundSummaryFromEvents, buildSearchHints,
    buildAnchorsSuggestions, buildKnownValuesSuggestions,
    evaluateAllSections, buildEvidenceReport, buildEffectiveSettingsSnapshot,
    buildScreenshotManifestFromEvents, computeCompoundCurve, diffRunPlans,
    buildFieldMapFromPacket, aggregateCrossRunMetrics, aggregateHostHealth,
  };
}
