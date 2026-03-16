export async function runSourceFetchDispatchPhase({
  phasePayload = {},
  fetchWorkerSeq = 0,
  context = {},
  runSourceFetchPhaseFn = async () => ({ ok: false })
} = {}) {
  const nextFetchWorkerSeq = Number(fetchWorkerSeq || 0) + 1;
  const sourceFetch = await runSourceFetchPhaseFn({
    workerId: `fetch-${nextFetchWorkerSeq}`,
    ...phasePayload,
    ...context,
  });

  return {
    sourceFetch,
    fetchWorkerSeq: nextFetchWorkerSeq
  };
}
