import { classifyFetchOutcome } from '../../../../pipeline/fetchParseWorker.js';

export function buildSourceFetchClassificationPhase({
  source = {},
  pageData = {},
  classifyFetchOutcomeFn = classifyFetchOutcome,
} = {}) {
  let fetchContentType = 'text/html';
  const finalToken = String(pageData.finalUrl || source.url || '').toLowerCase();
  if (finalToken.endsWith('.pdf')) {
    fetchContentType = 'application/pdf';
  } else if (finalToken.endsWith('.json')) {
    fetchContentType = 'application/json';
  } else if (!String(pageData.html || '').trim()) {
    fetchContentType = 'application/octet-stream';
  }
  const sourceFetchOutcome = classifyFetchOutcomeFn({
    status: Number.parseInt(String(pageData.status || 0), 10) || 0,
    contentType: fetchContentType,
    html: pageData.html || ''
  });

  return {
    fetchContentType,
    sourceFetchOutcome,
  };
}
