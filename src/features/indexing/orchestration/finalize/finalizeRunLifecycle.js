export async function finalizeRunLifecycle({
  logger,
  frontierDb = null,
  fieldOrder = [],
  normalized = {},
  provenance = {},
  fieldReasoning = {},
  trafficLight = {},
  emitFieldDecisionEventsFn,
} = {}) {
  emitFieldDecisionEventsFn({
    logger,
    fieldOrder,
    normalized,
    provenance,
    fieldReasoning,
    trafficLight,
  });

  if (frontierDb) {
    await frontierDb.save();
  }

  await logger.flush();
}
