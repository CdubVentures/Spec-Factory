export async function runSourceProcessingDispatchPhase({
  phasePayload = {},
  artifactSequence = 0,
  context = {},
  runSourceProcessingPhaseFn = async () => ({ nextArtifactSequence: artifactSequence })
} = {}) {
  const sourceProcessingPhase = await runSourceProcessingPhaseFn({
    ...phasePayload,
    artifactSequence,
    ...context,
  });

  return {
    nextArtifactSequence: sourceProcessingPhase.nextArtifactSequence
  };
}
