export function buildSourceFetchProcessingDispatchContext({
  sourceFetchContext = {},
  sourceProcessingContext = {},
  runSourceFetchDispatchPhaseFn = async () => ({ sourceFetch: { ok: false }, fetchWorkerSeq: 0 }),
  runSourceFetchPhaseFn = async () => ({ ok: false }),
  runSourceProcessingDispatchPhaseFn = async () => ({ nextArtifactSequence: 0 }),
  runSourceProcessingPhaseFn = async () => ({ nextArtifactSequence: 0 }),
} = {}) {
  return {
    sourceFetchContext,
    sourceProcessingContext,
    runSourceFetchDispatchPhaseFn,
    runSourceFetchPhaseFn,
    runSourceProcessingDispatchPhaseFn,
    runSourceProcessingPhaseFn,
  };
}
