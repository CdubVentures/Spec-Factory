import { copyContext } from '../shared/contextUtils.js';

export function buildRuntimeOverridesLoaderPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
