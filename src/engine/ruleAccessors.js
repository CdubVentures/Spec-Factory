import { canonicalUnitToken } from './normalizationFunctions.js';
import { isObject, normalizeToken } from './engineTextHelpers.js';

// --- Priority accessors ---

export function ruleRequiredLevel(rule = {}) {
  const priority = isObject(rule.priority) ? rule.priority : {};
  return normalizeToken(priority.required_level || rule.required_level || 'optional') || 'optional';
}

export function ruleAvailability(rule = {}) {
  const priority = isObject(rule.priority) ? rule.priority : {};
  return normalizeToken(priority.availability || rule.availability || 'sometimes') || 'sometimes';
}

export function ruleDifficulty(rule = {}) {
  const priority = isObject(rule.priority) ? rule.priority : {};
  return normalizeToken(priority.difficulty || rule.difficulty || 'medium') || 'medium';
}

// --- Contract accessors ---

export function ruleType(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  return normalizeToken(contract.type || rule.data_type || rule.type || 'string') || 'string';
}

export function ruleShape(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  return normalizeToken(contract.shape || rule.output_shape || rule.shape || 'scalar') || 'scalar';
}

export function ruleUnit(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  return canonicalUnitToken(contract.unit || rule.unit || '');
}


