import { saveFieldStudioMap, validateFieldStudioMap } from '../../../ingest/categoryCompile.js';
import { buildFieldLabelsMap } from '../../review/domain/index.js';
import { cleanVariant } from '../../catalog/index.js';
import { generateCategoryAuditReportPack } from '../../category-audit/reportPack.js';

export function createStudioRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, config, HELPER_ROOT, OUTPUT_ROOT, safeReadJson, safeStat,
    listFiles, fs, path, sessionCache, invalidateFieldRulesCache,
    getSpecDb, getSpecDbReady, storage, startProcess, broadcastWs,
    reviewLayoutByCategory, appDb,
  } = options;

  return {
    jsonRes, readJsonBody, config, HELPER_ROOT, OUTPUT_ROOT, safeReadJson, safeStat,
    listFiles, fs, path, sessionCache, saveFieldStudioMap,
    validateFieldStudioMap, invalidateFieldRulesCache, buildFieldLabelsMap,
    getSpecDb, getSpecDbReady, storage, startProcess, broadcastWs,
    reviewLayoutByCategory, cleanVariant,
    appDb, generateCategoryAuditReportPack,
  };
}
