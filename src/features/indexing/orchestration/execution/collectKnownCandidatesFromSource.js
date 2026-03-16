export function collectKnownCandidatesFromSource(mergedFieldCandidatesWithEvidence = []) {
  const sourceFieldValueMap = {};
  const knownCandidatesFromSource = (mergedFieldCandidatesWithEvidence || [])
    .filter((candidate) => {
      const value = String(candidate.value || '').trim().toLowerCase();
      return value && value !== 'unk';
    })
    .map((candidate) => {
      const field = String(candidate.field || '').trim();
      if (field && sourceFieldValueMap[field] === undefined) {
        sourceFieldValueMap[field] = String(candidate.value || '');
      }
      return field;
    })
    .filter(Boolean);
  return {
    sourceFieldValueMap,
    knownCandidatesFromSource
  };
}
