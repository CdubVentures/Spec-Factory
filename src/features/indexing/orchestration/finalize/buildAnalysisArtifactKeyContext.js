export function buildAnalysisArtifactKeyContext({
  storage,
  category,
  productId,
  runBase,
  summary = {},
} = {}) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  const needSetRunKey = `${runBase}/analysis/needset.json`;
  const needSetLatestKey = `${latestBase}/needset.json`;
  const phase07RunKey = `${runBase}/analysis/phase07_retrieval.json`;
  const phase07LatestKey = `${latestBase}/phase07_retrieval.json`;
  const phase08RunKey = `${runBase}/analysis/phase08_extraction.json`;
  const phase08LatestKey = `${latestBase}/phase08_extraction.json`;
  const sourcePacketsRunKey = `${runBase}/analysis/source_indexing_extraction_packets.json`;
  const sourcePacketsLatestKey = `${latestBase}/source_indexing_extraction_packets.json`;
  const itemPacketRunKey = `${runBase}/analysis/item_indexing_extraction_packet.json`;
  const itemPacketLatestKey = `${latestBase}/item_indexing_extraction_packet.json`;
  const runMetaPacketRunKey = `${runBase}/analysis/run_meta_packet.json`;
  const runMetaPacketLatestKey = `${latestBase}/run_meta_packet.json`;

  summary.needset = {
    ...(summary.needset || {}),
    key: needSetRunKey,
    latest_key: needSetLatestKey,
  };
  summary.phase07 = {
    ...(summary.phase07 || {}),
    key: phase07RunKey,
    latest_key: phase07LatestKey,
  };
  summary.phase08 = {
    ...(summary.phase08 || {}),
    key: phase08RunKey,
    latest_key: phase08LatestKey,
  };

  return {
    latestBase,
    needSetRunKey,
    needSetLatestKey,
    phase07RunKey,
    phase07LatestKey,
    phase08RunKey,
    phase08LatestKey,
    sourcePacketsRunKey,
    sourcePacketsLatestKey,
    itemPacketRunKey,
    itemPacketLatestKey,
    runMetaPacketRunKey,
    runMetaPacketLatestKey,
  };
}
