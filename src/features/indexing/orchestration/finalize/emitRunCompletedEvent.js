export function emitRunCompletedEvent({
  logger,
  runCompletedPayload,
} = {}) {
  logger.info('run_completed', runCompletedPayload);
}
