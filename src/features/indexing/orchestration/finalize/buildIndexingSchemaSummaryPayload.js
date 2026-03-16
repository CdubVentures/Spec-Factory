export function buildIndexingSchemaSummaryPayload({
  sourcePacketsRunKey,
  sourcePacketsLatestKey,
  itemPacketRunKey,
  itemPacketLatestKey,
  runMetaPacketRunKey,
  runMetaPacketLatestKey,
  indexingSchemaPackets,
  indexingSchemaValidation,
} = {}) {
  return {
    source_packets_key: sourcePacketsRunKey,
    source_packets_latest_key: sourcePacketsLatestKey,
    item_packet_key: itemPacketRunKey,
    item_packet_latest_key: itemPacketLatestKey,
    run_meta_packet_key: runMetaPacketRunKey,
    run_meta_packet_latest_key: runMetaPacketLatestKey,
    source_packet_count: Number(indexingSchemaPackets?.sourceCollection?.source_packet_count || 0),
    item_packet_id: String(indexingSchemaPackets?.itemPacket?.item_packet_id || '').trim() || null,
    run_packet_id: String(indexingSchemaPackets?.runMetaPacket?.run_packet_id || '').trim() || null,
    validation: indexingSchemaValidation
      ? {
        enabled: true,
        valid: Boolean(indexingSchemaValidation.valid),
        schema_root: indexingSchemaValidation.schema_root,
        error_count: Number(indexingSchemaValidation.error_count || 0)
      }
      : {
        enabled: false,
        valid: null,
        schema_root: null,
        error_count: 0
      }
  };
}
