export async function resolveIndexingSchemaValidation({
  config,
  indexingSchemaPackets,
  logger,
  productId,
  runId,
  category,
  validateIndexingSchemaPacketsFn,
} = {}) {
  if (config.indexingSchemaPacketsValidationEnabled === false) {
    return null;
  }

  const indexingSchemaValidation = await validateIndexingSchemaPacketsFn({
    sourceCollection: indexingSchemaPackets.sourceCollection,
    itemPacket: indexingSchemaPackets.itemPacket,
    runMetaPacket: indexingSchemaPackets.runMetaPacket,
    schemaRoot: config.indexingSchemaPacketsSchemaRoot || ''
  });
  if (!indexingSchemaValidation.valid) {
    const sampleErrors = (indexingSchemaValidation.errors || []).slice(0, 12);
    logger.error('indexing_schema_packets_validation_failed', {
      productId,
      runId,
      category,
      schema_root: indexingSchemaValidation.schema_root,
      error_count: Number(indexingSchemaValidation.error_count || 0),
      errors: sampleErrors
    });
    if (config.indexingSchemaPacketsValidationStrict !== false) {
      throw new Error(
        `indexing_schema_packets_schema_invalid (${Number(indexingSchemaValidation.error_count || 0)} errors)`
      );
    }
  }

  return indexingSchemaValidation;
}
