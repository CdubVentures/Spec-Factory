export function resolveSourceFetchProcessingDispatchState({
  sourceFetchProcessingDispatchResult = {},
  fetchWorkerSeq = 0,
  artifactSequence = 0,
} = {}) {
  return {
    fetchWorkerSeq: Number(
      sourceFetchProcessingDispatchResult.fetchWorkerSeq ?? fetchWorkerSeq
    ),
    artifactSequence: Number(
      sourceFetchProcessingDispatchResult.artifactSequence ?? artifactSequence
    ),
    sourceFetchOk: Boolean(sourceFetchProcessingDispatchResult.sourceFetchOk),
  };
}
