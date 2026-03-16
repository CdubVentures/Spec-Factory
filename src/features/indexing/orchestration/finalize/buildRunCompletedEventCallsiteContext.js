import { copyContext } from '../shared/contextUtils.js';

export function buildRunCompletedEventCallsiteContext(context = {}) {
  return copyContext(context);
}
