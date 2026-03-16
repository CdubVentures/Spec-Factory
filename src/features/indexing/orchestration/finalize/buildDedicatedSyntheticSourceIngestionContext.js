export function buildDedicatedSyntheticSourceIngestionContext({
  adapterManager,
  job,
  runId,
  storage,
  helperSupportiveSyntheticSources,
  adapterArtifacts,
  sourceResults,
  anchors,
  config,
  buildCandidateFieldMap,
  evaluateAnchorConflicts,
  evaluateSourceIdentity,
} = {}) {
  return {
    adapterManager,
    job,
    runId,
    storage,
    helperSupportiveSyntheticSources,
    adapterArtifacts,
    sourceResults,
    anchors,
    config,
    buildCandidateFieldMapFn: buildCandidateFieldMap,
    evaluateAnchorConflictsFn: evaluateAnchorConflicts,
    evaluateSourceIdentityFn: evaluateSourceIdentity,
  };
}
