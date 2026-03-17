export async function runDedicatedSyntheticSourceIngestionPhase({
  adapterManager,
  job = {},
  runId = '',
  storage,
  helperSupportiveSyntheticSources = [],
  adapterArtifacts = [],
  sourceResults = [],
  anchors = {},
  config = {},
  buildCandidateFieldMapFn,
  evaluateAnchorConflictsFn,
  evaluateSourceIdentityFn,
} = {}) {
  const dedicated = await adapterManager.runDedicatedAdapters({
    job,
    runId,
    storage,
  });
  adapterArtifacts.push(...(dedicated.adapterArtifacts || []));

  const allSyntheticSources = [
    ...(dedicated.syntheticSources || []),
    ...helperSupportiveSyntheticSources,
  ];
  for (const syntheticSource of allSyntheticSources) {
    const candidateMap = buildCandidateFieldMapFn(syntheticSource.fieldCandidates || []);
    const anchorCheck = evaluateAnchorConflictsFn(anchors, candidateMap);
    const identity = evaluateSourceIdentityFn(
      {
        ...syntheticSource,
        title: syntheticSource.title,
        identityCandidates: syntheticSource.identityCandidates,
        connectionHint: candidateMap.connection,
      },
      job.identityLock || {},
      {},
    );

    const anchorStatus =
      anchorCheck.majorConflicts.length > 0
        ? 'failed_major_conflict'
        : anchorCheck.conflicts.length > 0
          ? 'minor_conflicts'
          : 'pass';

    sourceResults.push({
      ...syntheticSource,
      identity,
      anchorCheck,
      anchorStatus,
    });
  }

  return {
    dedicated,
    allSyntheticSources,
    appendedSyntheticSourceCount: allSyntheticSources.length,
  };
}
