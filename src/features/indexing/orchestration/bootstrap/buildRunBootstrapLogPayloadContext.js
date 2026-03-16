import { copyContext } from '../shared/contextUtils.js';

export function buildRunBootstrapLogPayloadContext(context = {}) {
  return copyContext(context);
}
