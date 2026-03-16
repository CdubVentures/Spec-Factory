export async function runSourceProcessingPhase({
  source = {},
  hostBudgetRow = {},
  sourceFetch = { pageData: {}, fetchDurationMs: 0 },
  artifactSequence = 0,
  buildSourceFetchClassificationPhaseFn = () => ({ fetchContentType: '', sourceFetchOutcome: '' }),
  classifyFetchOutcomeFn = () => 'error',
  runSourceArtifactsPhaseFn = async () => ({ nextArtifactSequence: artifactSequence }),
  runSourceExtractionFn = async () => {},
  runSourceArtifactsPhaseContext = {},
  nowMsFn = () => Date.now(),
} = {}) {
  const pageData = sourceFetch.pageData;
  const fetchDurationMs = sourceFetch.fetchDurationMs;
  const parseStartedAtMs = nowMsFn();
  const sourceStatusCode = Number.parseInt(String(pageData.status || 0), 10) || 0;
  const sourceFetchClassificationPhase = buildSourceFetchClassificationPhaseFn({
    source,
    pageData,
    classifyFetchOutcomeFn,
  });
  const fetchContentType = sourceFetchClassificationPhase.fetchContentType;
  const sourceFetchOutcome = sourceFetchClassificationPhase.sourceFetchOutcome;

  const { nextArtifactSequence, ...artifactContext } = await runSourceArtifactsPhaseFn({
    source,
    pageData,
    sourceStatusCode,
    fetchDurationMs,
    fetchContentType,
    sourceFetchOutcome,
    artifactSequence,
    ...runSourceArtifactsPhaseContext
  });

  await runSourceExtractionFn({
    source,
    pageData,
    sourceStatusCode,
    fetchDurationMs,
    fetchContentType,
    sourceFetchOutcome,
    parseStartedAtMs,
    hostBudgetRow,
    ...artifactContext
  });

  return {
    nextArtifactSequence
  };
}
