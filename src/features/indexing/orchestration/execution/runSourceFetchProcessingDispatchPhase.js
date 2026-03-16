export async function runSourceFetchProcessingDispatchPhase({
  phasePayload = {},
  fetchWorkerSeq = 0,
  artifactSequence = 0,
  sourceFetchContext = {},
  sourceProcessingContext = {},
  runSourceFetchDispatchPhaseFn = async () => ({
    sourceFetch: { ok: false },
    fetchWorkerSeq: Number(fetchWorkerSeq || 0)
  }),
  runSourceProcessingDispatchPhaseFn = async () => ({
    nextArtifactSequence: Number(artifactSequence || 0)
  }),
  runSourceFetchPhaseFn = async () => ({ ok: false }),
  runSourceProcessingPhaseFn = async () => ({
    nextArtifactSequence: Number(artifactSequence || 0)
  }),
} = {}) {
  const sourceFetchDispatchResult = await runSourceFetchDispatchPhaseFn({
    phasePayload,
    fetchWorkerSeq,
    context: sourceFetchContext,
    runSourceFetchPhaseFn,
  });
  const sourceFetch = sourceFetchDispatchResult.sourceFetch || { ok: false };
  const nextFetchWorkerSeq = Number(sourceFetchDispatchResult.fetchWorkerSeq || 0);

  if (!sourceFetch.ok) {
    return {
      sourceFetchOk: false,
      sourceFetch,
      fetchWorkerSeq: nextFetchWorkerSeq,
      artifactSequence,
    };
  }

  const sourceProcessingDispatchResult = await runSourceProcessingDispatchPhaseFn({
    phasePayload: {
      source: phasePayload.source,
      hostBudgetRow: phasePayload.hostBudgetRow,
      sourceFetch,
    },
    artifactSequence,
    context: sourceProcessingContext,
    runSourceProcessingPhaseFn,
  });

  return {
    sourceFetchOk: true,
    sourceFetch,
    fetchWorkerSeq: nextFetchWorkerSeq,
    artifactSequence: Number(sourceProcessingDispatchResult.nextArtifactSequence || artifactSequence),
  };
}
