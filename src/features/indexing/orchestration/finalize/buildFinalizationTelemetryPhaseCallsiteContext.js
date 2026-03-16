import { copyContext } from '../shared/contextUtils.js';

export function buildFinalizationTelemetryPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
