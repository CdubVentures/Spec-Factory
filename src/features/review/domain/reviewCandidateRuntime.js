function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UNKNOWN_LIKE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

function isMeaningfulValue(value) {
  return !UNKNOWN_LIKE_TOKENS.has(normalizeLower(value));
}

function candidateLooksReference(candidateId, sourceToken = '') {
  const token = String(sourceToken || '').trim().toLowerCase();
  const cid = String(candidateId || '').trim();
  return cid.startsWith('ref_')
    || cid.startsWith('ref-')
    || cid.includes('::ref_')
    || cid.includes('::ref-')
    || token.includes('reference')
    || token.includes('component_db');
}

export function createReviewCandidateRuntime({
  getSpecDb,
  config = {},
  normalizePathToken,
} = {}) {
  if (typeof getSpecDb !== 'function') {
    throw new TypeError('getSpecDb must be a function');
  }

  // Stubbed — candidates table removed in 7a, callers removed in 7c-7d
  function annotateCandidatePrimaryReviews() {}
  function getPendingItemPrimaryCandidateIds() { return []; }
  async function getPendingComponentSharedCandidateIdsAsync() { return []; }
  function getPendingEnumSharedCandidateIds() { return []; }
  async function syncSyntheticCandidatesFromComponentReview() { return { upserted: 0 }; }

  async function remapPendingComponentReviewItemsForNameChange({
    category,
    componentType,
    oldName,
    newName,
    specDb = null,
  }) {
    const oldNorm = normalizeLower(oldName);
    const newValue = String(newName || '').trim();
    if (!oldNorm || !newValue || oldNorm === normalizeLower(newValue)) return { changed: 0 };

    const runtimeSpecDb = specDb || getSpecDb(category);
    if (!runtimeSpecDb) return { changed: 0 };

    let changed = 0;
    try {
      runtimeSpecDb.updateComponentReviewQueueMatchedComponentByName(category, componentType, oldName, newValue);
      // Count affected rows by querying items that now have the new name
      const updatedItems = runtimeSpecDb.getComponentReviewItems(componentType) || [];
      changed = updatedItems.filter((item) => {
        const matched = String(item?.matched_component || '').trim().toLowerCase();
        return matched === newValue.toLowerCase() && item?.status === 'pending_ai';
      }).length;
    } catch {
      // best-effort
    }

    return { changed };
  }

  async function propagateSharedLaneDecision({
    category,
    specDb,
    keyReviewState,
    laneAction,
    candidateValue = null,
  }) {
    if (!specDb || !keyReviewState) return { propagated: false };
    if (String(keyReviewState.target_kind || '') !== 'grid_key') return { propagated: false };
    if (laneAction !== 'accept') return { propagated: false };

    const fieldKey = String(keyReviewState.field_key || '').trim();
    const selectedValue = String(
      candidateValue ?? keyReviewState.selected_value ?? ''
    ).trim();
    if (!fieldKey || !isMeaningfulValue(selectedValue)) return { propagated: false };

    // Grid shared accepts are strictly slot-scoped: one item field slot action must never
    // mutate peer item slots, component property slots, or enum value slots.
    return { propagated: false };
  }

  return {
    normalizeLower,
    isMeaningfulValue,
    candidateLooksReference,
    annotateCandidatePrimaryReviews,
    getPendingItemPrimaryCandidateIds,
    getPendingComponentSharedCandidateIdsAsync,
    getPendingEnumSharedCandidateIds,
    syncSyntheticCandidatesFromComponentReview,
    remapPendingComponentReviewItemsForNameChange,
    propagateSharedLaneDecision,
  };
}
