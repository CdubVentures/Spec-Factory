import { copyContext } from '../shared/contextUtils.js';

export function buildRunCompletedEventContext(context = {}) {
  return copyContext(context);
}
