import { copyContext } from '../shared/contextUtils.js';

export function buildSummaryArtifactsPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
