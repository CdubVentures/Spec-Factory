export async function runSourceExtractionDispatchPhase({
  phasePayload = {},
  phaseState = {},
  context = {},
  runSourceExtractionPhaseFn = async () => ({})
} = {}) {
  const sourceExtractionPhase = await runSourceExtractionPhaseFn({
    ...phasePayload,
    phase08FieldContexts: phaseState.phase08FieldContexts,
    phase08PrimeRows: phaseState.phase08PrimeRows,
    llmSourcesUsed: phaseState.llmSourcesUsed,
    llmCandidatesAccepted: phaseState.llmCandidatesAccepted,
    context
  });

  return {
    phase08FieldContexts: sourceExtractionPhase.phase08FieldContexts,
    phase08PrimeRows: sourceExtractionPhase.phase08PrimeRows,
    llmSourcesUsed: sourceExtractionPhase.llmSourcesUsed,
    llmCandidatesAccepted: sourceExtractionPhase.llmCandidatesAccepted
  };
}
