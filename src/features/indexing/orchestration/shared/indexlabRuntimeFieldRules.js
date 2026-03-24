import { projectFieldRulesForConsumer } from '../../../../field-rules/consumerGate.js';
import { isObject } from '../../../../shared/primitives.js';

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
