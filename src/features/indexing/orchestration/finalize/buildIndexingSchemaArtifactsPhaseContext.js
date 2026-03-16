import { renameContextKeys } from '../shared/contextUtils.js';

export function buildIndexingSchemaArtifactsPhaseContext(context = {}) {
  return renameContextKeys(context, {
  "buildIndexingSchemaPackets": "buildIndexingSchemaPacketsFn",
  "resolveIndexingSchemaValidation": "resolveIndexingSchemaValidationFn",
  "buildIndexingSchemaSummaryPayload": "buildIndexingSchemaSummaryPayloadFn",
  "persistAnalysisArtifacts": "persistAnalysisArtifactsFn",
  "validateIndexingSchemaPackets": "validateIndexingSchemaPacketsFn"
});
}
