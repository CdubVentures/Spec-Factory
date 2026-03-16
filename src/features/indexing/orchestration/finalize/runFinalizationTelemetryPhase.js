export function runFinalizationTelemetryPhase({
  logger,
  productId,
  runId,
  category,
  needSet,
  needSetRunKey,
  phase07PrimeSources,
  phase07RunKey,
  phase08Extraction,
  phase08RunKey,
  indexingSchemaPackets,
  sourcePacketsRunKey,
  itemPacketRunKey,
  runMetaPacketRunKey,
  buildFinalizationEventPayloadsFn,
  emitFinalizationEventsFn,
} = {}) {
  const finalizationEventPayloads = buildFinalizationEventPayloadsFn({
    productId,
    runId,
    category,
    needSet,
    needSetRunKey,
    phase07PrimeSources,
    phase07RunKey,
    phase08Extraction,
    phase08RunKey,
    indexingSchemaPackets,
    sourcePacketsRunKey,
    itemPacketRunKey,
    runMetaPacketRunKey,
  });

  emitFinalizationEventsFn({
    logger,
    finalizationEventPayloads,
  });

  return { finalizationEventPayloads };
}
