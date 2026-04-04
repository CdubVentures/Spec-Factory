import { buildReviewQueue } from '../../review-curation/index.js';

export function createQueueBillingLearningRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, toInt, config, storage, OUTPUT_ROOT, path,
    getSpecDb, broadcastWs, safeReadJson, safeStat, listFiles,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, config, storage, OUTPUT_ROOT, path,
    getSpecDb, buildReviewQueue, broadcastWs, safeReadJson, safeStat, listFiles,
  };
}
