import { renameContextKeys } from '../shared/contextUtils.js';

export function buildRunRuntimeContext(context = {}) {
  return renameContextKeys(context, {
  "buildRunId": "buildRunIdFn"
});
}
