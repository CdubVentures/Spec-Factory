import { renameContextKeys } from '../shared/contextUtils.js';

export function buildFinalizationTelemetryContext(context = {}) {
  return renameContextKeys(context, {
  "buildFinalizationEventPayloads": "buildFinalizationEventPayloadsFn",
  "emitFinalizationEvents": "emitFinalizationEventsFn"
});
}
