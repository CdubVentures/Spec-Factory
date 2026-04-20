/**
 * Unified identity-warning and siblings-exclusion builders shared by
 * every finder that calls an LLM with a product identity in scope
 * (CEF, PIF, RDF, future).
 *
 * Every finder that asks the LLM to reason about a product variant MUST
 * call buildIdentityWarning() so the model sees consistent sibling-ambiguity
 * framing. Finders supply the field-specific noun (e.g. "colors or editions",
 * "product images", "release dates") via fieldDomainNoun.
 */

import { resolvePromptTemplate } from '../resolvePromptTemplate.js';
import { resolveGlobalPrompt } from './globalPromptRegistry.js';

function normalizeFamilyCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.trunc(n));
}

function resolveTier(ambiguityLevel, familyCount) {
  if (familyCount <= 1) return 'easy';
  const level = String(ambiguityLevel || 'easy').toLowerCase();
  if (level === 'easy') return 'easy';
  if (level === 'hard' || level === 'high') return 'hard';
  return 'medium';
}

export function buildSiblingsLine({ siblingModels = [], fieldDomainNoun = '' } = {}) {
  const list = Array.isArray(siblingModels) ? siblingModels.filter(Boolean) : [];
  if (list.length === 0) return '';
  const template = resolveGlobalPrompt('siblingsExclusion');
  return resolvePromptTemplate(template, {
    SIBLING_LIST: list.join(', '),
    FIELD_DOMAIN_NOUN: fieldDomainNoun,
  });
}

export function buildIdentityWarning({
  familyModelCount = 1,
  ambiguityLevel = 'easy',
  brand = '',
  model = '',
  siblingModels = [],
  fieldDomainNoun = '',
} = {}) {
  const familyCount = normalizeFamilyCount(familyModelCount);
  const tier = resolveTier(ambiguityLevel, familyCount);

  const templateKey = tier === 'easy'
    ? 'identityWarningEasy'
    : tier === 'hard'
      ? 'identityWarningHard'
      : 'identityWarningMedium';

  const warning = resolvePromptTemplate(resolveGlobalPrompt(templateKey), {
    BRAND: brand,
    MODEL: model,
    FAMILY_MODEL_COUNT: String(familyCount),
    FIELD_DOMAIN_NOUN: fieldDomainNoun,
  });

  const siblings = buildSiblingsLine({ siblingModels, fieldDomainNoun });

  const parts = [warning];
  if (siblings) parts.push(siblings);
  return parts.join('\n');
}
