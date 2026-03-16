import { copyContext } from '../shared/contextUtils.js';

export function buildRunResultPayloadContext(context = {}) {
  return copyContext(context);
}
