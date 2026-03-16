import { copyContext } from '../shared/contextUtils.js';

export function buildRunTraceWriterPhaseCallsiteContext(context = {}) {
  return copyContext(context);
}
