// Compatibility shim
export {
  normalizeField, hasKnownValue, normalizeComparableValue,
  normalizeQuoteSpan, normalizeOverrideEvidence, manualCandidateId,
  extractOverrideValue, extractOverrideProvenance, sortDeep,
  writeJsonStable, removeFieldFromList, addFieldToList,
  reviewKeys, latestKeys, readOverrideFile, findCandidateRows,
  buildCandidateOverrideEntry, buildCandidateMap,
  selectCandidateForValue, readReviewProductPayload,
  listOverrideDocs, writeStorageJson,
} from '../features/review/domain/overrideHelpers.js';
