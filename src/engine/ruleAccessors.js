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

export function ruleEffort(rule = {}) {
  const priority = isObject(rule.priority) ? rule.priority : {};
  const raw = Number.parseFloat(String(priority.effort || rule.effort || ''));
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  const difficulty = ruleDifficulty(rule);
  if (difficulty === 'hard') return 8;
  if (difficulty === 'medium') return 5;
  if (difficulty === 'easy') return 2;
  return 3;
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

// --- Evidence accessors ---

export function ruleEvidenceRequired(rule = {}) {
  const evidence = isObject(rule.evidence) ? rule.evidence : {};
  if (evidence.required !== undefined) return Boolean(evidence.required);
  if (rule.evidence_required !== undefined) return Boolean(rule.evidence_required);
  return false;
}
