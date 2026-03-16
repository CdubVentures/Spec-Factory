import { copyContext } from '../shared/contextUtils.js';

export function buildRunCompletedPayloadContext(context = {}) {
  return copyContext(context);
}
