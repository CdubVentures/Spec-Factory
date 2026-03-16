import { copyContext } from '../shared/contextUtils.js';

export function buildConstraintAnalysisPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
