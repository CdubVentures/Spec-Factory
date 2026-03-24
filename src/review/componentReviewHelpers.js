// Compatibility shim
export {
  parseReviewItemAttributes, resolveFieldRulesEntries,
  resolveReviewEnabledEnumFieldSet, makerTokensFromReviewItem,
  reviewItemMatchesMakerLane, componentLaneSlug, isTestModeCategory,
  discoveredFromSource, normalizeDiscoveryRows, enforceNonDiscoveredRows,
  safeReadJson, listJsonFiles, resolveDeclaredComponentPropertyColumns,
  mergePropertyColumns, resolvePropertyFieldMeta,
} from '../features/review/domain/componentReviewHelpers.js';
