export async function persistAnalysisArtifacts({
  storage,
  keys = {},
  needSet = {},
  phase07PrimeSources = {},
  phase08Extraction = {},
  indexingSchemaPackets = {},
} = {}) {
  await storage.writeObject(
    keys.needSetRunKey,
    Buffer.from(`${JSON.stringify(needSet, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.needSetLatestKey,
    Buffer.from(`${JSON.stringify(needSet, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.phase07RunKey,
    Buffer.from(`${JSON.stringify(phase07PrimeSources, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.phase07LatestKey,
    Buffer.from(`${JSON.stringify(phase07PrimeSources, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.phase08RunKey,
    Buffer.from(`${JSON.stringify(phase08Extraction, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.phase08LatestKey,
    Buffer.from(`${JSON.stringify(phase08Extraction, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.sourcePacketsRunKey,
    Buffer.from(`${JSON.stringify(indexingSchemaPackets.sourceCollection, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.sourcePacketsLatestKey,
    Buffer.from(`${JSON.stringify(indexingSchemaPackets.sourceCollection, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.itemPacketRunKey,
    Buffer.from(`${JSON.stringify(indexingSchemaPackets.itemPacket, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.itemPacketLatestKey,
    Buffer.from(`${JSON.stringify(indexingSchemaPackets.itemPacket, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.runMetaPacketRunKey,
    Buffer.from(`${JSON.stringify(indexingSchemaPackets.runMetaPacket, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
  await storage.writeObject(
    keys.runMetaPacketLatestKey,
    Buffer.from(`${JSON.stringify(indexingSchemaPackets.runMetaPacket, null, 2)}\n`, 'utf8'),
    { contentType: 'application/json' },
  );
}
