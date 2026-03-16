export function emitFinalizationEvents({
  logger,
  finalizationEventPayloads = {},
} = {}) {
  logger.info('needset_computed', finalizationEventPayloads.needsetComputedPayload);
  logger.info('phase07_prime_sources_built', finalizationEventPayloads.phase07PrimeSourcesBuiltPayload);
  logger.info('phase08_extraction_context_built', finalizationEventPayloads.phase08ExtractionContextBuiltPayload);
  logger.info('indexing_schema_packets_written', finalizationEventPayloads.indexingSchemaPacketsWrittenPayload);
}
