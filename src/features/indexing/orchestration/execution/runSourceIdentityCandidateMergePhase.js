export function runSourceIdentityCandidateMergePhase({
  extractionIdentityCandidates = {},
  adapterIdentityCandidates = {},
  llmIdentityCandidates = {},
  identityLock = {},
} = {}) {
  const mergedIdentityCandidates = {
    ...(extractionIdentityCandidates || {}),
    ...(adapterIdentityCandidates || {})
  };

  for (const [key, value] of Object.entries(llmIdentityCandidates || {})) {
    if (String(identityLock?.[key] || '').trim() !== '') {
      continue;
    }
    if (!mergedIdentityCandidates[key]) {
      mergedIdentityCandidates[key] = value;
    }
  }

  return { mergedIdentityCandidates };
}
