import { renameContextKeys } from '../shared/contextUtils.js';

export function buildRunLoggerBootstrapContext(context = {}) {
  return renameContextKeys(context, {
  "createEventLogger": "createEventLoggerFn"
});
}
