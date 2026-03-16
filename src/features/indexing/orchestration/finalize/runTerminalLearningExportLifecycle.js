export async function runTerminalLearningExportLifecycle({
  learningExportPhaseContext,
  runLearningExportPhaseFn,
  finalizeRunLifecycleFn,
  logger,
  frontierDb,
  fieldOrder = [],
  normalized = {},
  provenance = {},
  fieldReasoning = [],
  trafficLight = {},
  emitFieldDecisionEventsFn,
} = {}) {
  const { exportInfo, finalExport, learning } = await runLearningExportPhaseFn(learningExportPhaseContext);

  await finalizeRunLifecycleFn({
    logger,
    frontierDb,
    fieldOrder,
    normalized,
    provenance,
    fieldReasoning,
    trafficLight,
    emitFieldDecisionEventsFn,
  });

  return { exportInfo, finalExport, learning };
}
