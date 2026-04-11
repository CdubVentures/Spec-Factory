function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UNKNOWN_LIKE_TOKENS = new Set(['', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

function isMeaningfulValue(value) {
  if (value == null) return false;
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
} = {}) {
  if (typeof getSpecDb !== 'function') {
    throw new TypeError('getSpecDb must be a function');
  }

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

  return {
    normalizeLower,
    isMeaningfulValue,
    candidateLooksReference,
    remapPendingComponentReviewItemsForNameChange,
  };
}
