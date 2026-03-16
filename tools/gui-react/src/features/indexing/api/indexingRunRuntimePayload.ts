type IndexingRunRuntimePayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunRuntimePayloadInput {
  runtimeScreencastEnabled: boolean;
  parsedRuntimeScreencastFps: number;
  parsedRuntimeScreencastQuality: number;
  parsedRuntimeScreencastMaxWidth: number;
  parsedRuntimeScreencastMaxHeight: number;
  runtimeTraceEnabled: boolean;
  parsedRuntimeTraceFetchRing: number;
  parsedRuntimeTraceLlmRing: number;
  runtimeTraceLlmPayloads: boolean;
  parsedDaemonConcurrency: number;
  parsedDaemonGracefulShutdownTimeoutMs: number;
  importsRoot: string;
  parsedImportsPollSeconds: number;
  parsedIdentityGatePublishThreshold: number;
  parsedIndexingResumeSeedLimit: number;
  parsedIndexingResumePersistLimit: number;
  eventsJsonWrite: boolean;
  indexingSchemaPacketsValidationEnabled: boolean;
  indexingSchemaPacketsValidationStrict: boolean;
  queueJsonWrite: boolean;
  billingJsonWrite: boolean;
  intelJsonWrite: boolean;
  corpusJsonWrite: boolean;
  learningJsonWrite: boolean;
  cacheJsonWrite: boolean;
  authoritySnapshotEnabled: boolean;
}

export function buildIndexingRunRuntimePayload(
  input: BuildIndexingRunRuntimePayloadInput,
): Record<string, IndexingRunRuntimePayloadPrimitive> {
  return {
    runtimeScreencastEnabled: input.runtimeScreencastEnabled,
    runtimeScreencastFps: Math.max(1, input.parsedRuntimeScreencastFps),
    runtimeScreencastQuality: Math.max(10, input.parsedRuntimeScreencastQuality),
    runtimeScreencastMaxWidth: Math.max(320, input.parsedRuntimeScreencastMaxWidth),
    runtimeScreencastMaxHeight: Math.max(240, input.parsedRuntimeScreencastMaxHeight),
    runtimeTraceEnabled: input.runtimeTraceEnabled,
    runtimeTraceFetchRing: Math.max(10, input.parsedRuntimeTraceFetchRing),
    runtimeTraceLlmRing: Math.max(10, input.parsedRuntimeTraceLlmRing),
    runtimeTraceLlmPayloads: input.runtimeTraceLlmPayloads,
    daemonConcurrency: Math.max(1, input.parsedDaemonConcurrency),
    daemonGracefulShutdownTimeoutMs: Math.max(1000, input.parsedDaemonGracefulShutdownTimeoutMs),
    importsRoot: String(input.importsRoot || '').trim(),
    importsPollSeconds: Math.max(1, input.parsedImportsPollSeconds),
    identityGatePublishThreshold: Math.max(0, Math.min(1, input.parsedIdentityGatePublishThreshold)),
    indexingResumeSeedLimit: Math.max(1, input.parsedIndexingResumeSeedLimit),
    indexingResumePersistLimit: Math.max(1, input.parsedIndexingResumePersistLimit),
    eventsJsonWrite: input.eventsJsonWrite,
    indexingSchemaPacketsValidationEnabled: input.indexingSchemaPacketsValidationEnabled,
    indexingSchemaPacketsValidationStrict: input.indexingSchemaPacketsValidationStrict,
    queueJsonWrite: input.queueJsonWrite,
    billingJsonWrite: input.billingJsonWrite,
    intelJsonWrite: input.intelJsonWrite,
    corpusJsonWrite: input.corpusJsonWrite,
    learningJsonWrite: input.learningJsonWrite,
    cacheJsonWrite: input.cacheJsonWrite,
    authoritySnapshotEnabled: input.authoritySnapshotEnabled,
  };
}
