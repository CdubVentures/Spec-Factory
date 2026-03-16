import { projectFieldRulesForConsumer } from '../../../../field-rules/consumerGate.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildIndexlabRuntimeCategoryConfig(categoryConfig = null) {
  if (!isObject(categoryConfig)) {
    return categoryConfig;
  }

  const projectedFieldRules = isObject(categoryConfig.fieldRules)
    ? projectFieldRulesForConsumer(categoryConfig.fieldRules, 'indexlab')
    : categoryConfig.fieldRules;

  return {
    ...categoryConfig,
    fieldRules: projectedFieldRules,
  };
}
