import { renameContextKeys } from '../shared/contextUtils.js';

export function buildRunSummaryPayloadContext(context = {}) {
  return renameContextKeys(context, {
  "normalizeAmbiguityLevel": "normalizeAmbiguityLevelFn",
  "isHelperSyntheticSource": "isHelperSyntheticSourceFn",
  "buildTopEvidenceReferences": "buildTopEvidenceReferencesFn",
  "nowIso": "nowIsoFn"
});
}
