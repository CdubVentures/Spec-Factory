import { copyContext } from '../shared/contextUtils.js';

export function buildIdentityReportPersistencePhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
