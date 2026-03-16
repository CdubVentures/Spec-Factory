import { copyContext } from '../shared/contextUtils.js';

export function buildAnalysisArtifactKeyPhaseContext(context = {}) {
  return copyContext(context);
}
