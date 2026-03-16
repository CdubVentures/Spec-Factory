import { renameContextKeys } from '../shared/contextUtils.js';

export function buildSummaryArtifactsPhaseContext(context = {}) {
  return renameContextKeys(context, {
    writeSummaryMarkdownLLM: 'writeSummaryMarkdownLLMFn',
    buildMarkdownSummary: 'buildMarkdownSummaryFn',
    tsvRowFromFields: 'tsvRowFromFieldsFn',
  });
}
