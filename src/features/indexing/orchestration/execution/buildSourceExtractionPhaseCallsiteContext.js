import { copyContext } from '../shared/contextUtils.js';

export function buildSourceExtractionPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
