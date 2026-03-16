export async function runIndexingSchemaArtifactsPhase({
  runId,
  category,
  productId,
  startMs,
  summary,
  categoryConfig,
  sourceResults,
  normalized,
  provenance,
  needSet,
  phase08Extraction,
  phase07PrimeSources,
  config,
  logger,
  storage,
  keys,
  buildIndexingSchemaPacketsFn,
  resolveIndexingSchemaValidationFn,
  buildIndexingSchemaSummaryPayloadFn,
  persistAnalysisArtifactsFn,
  validateIndexingSchemaPacketsFn,
} = {}) {
  const indexingSchemaPackets = buildIndexingSchemaPacketsFn({
    runId,
    category,
    productId,
    startMs,
    summary,
    categoryConfig,
    sourceResults,
    normalized,
    provenance,
    needSet,
    phase08Extraction
  });
  const indexingSchemaValidation = await resolveIndexingSchemaValidationFn({
    config,
    indexingSchemaPackets,
    logger,
    productId,
    runId,
    category,
    validateIndexingSchemaPacketsFn,
  });
  summary.indexing_schema_packets = buildIndexingSchemaSummaryPayloadFn({
    sourcePacketsRunKey: keys.sourcePacketsRunKey,
    sourcePacketsLatestKey: keys.sourcePacketsLatestKey,
    itemPacketRunKey: keys.itemPacketRunKey,
    itemPacketLatestKey: keys.itemPacketLatestKey,
    runMetaPacketRunKey: keys.runMetaPacketRunKey,
    runMetaPacketLatestKey: keys.runMetaPacketLatestKey,
    indexingSchemaPackets,
    indexingSchemaValidation,
  });
  await persistAnalysisArtifactsFn({
    storage,
    keys,
    needSet,
    phase07PrimeSources,
    phase08Extraction,
    indexingSchemaPackets,
  });

  return { indexingSchemaPackets };
}
