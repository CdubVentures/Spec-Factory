import { runFieldContractTests } from '../../../tests/fieldContractTestRunner.js';
import { mergeDiscoveredEnums } from '../../../features/publisher/validation/mergeDiscoveredEnums.js';
import { buildDiscoveredEnumMap } from '../../../features/publisher/buildDiscoveredEnumMap.js';

export function createTestModeRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody,
    getSpecDbReady, resolveCategoryAlias, appDb,
  } = options;

  return {
    jsonRes, readJsonBody,
    getSpecDbReady, resolveCategoryAlias, appDb,
    runFieldContractTests,
    mergeDiscoveredEnums,
    buildDiscoveredEnumMap,
  };
}
