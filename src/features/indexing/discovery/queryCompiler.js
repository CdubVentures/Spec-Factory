// WHY: Hard boundary between logical query plans and provider-specific strings.
// Exit gate: "query compiler never emits unsupported operators silently."

import { z } from 'zod';
import { getProviderCapabilities } from './providerCapabilities.js';

const COMPILED_QUERY_MAX_LENGTH = 500;

export const logicalQueryPlanSchema = z.object({
  product: z.string(),
  terms: z.array(z.string()),
  site_target: z.string().nullable().optional().default(null),
  filetype: z.string().nullable().optional().default(null),
  doc_hint: z.string().optional().default(''),
  exact_phrases: z.array(z.string()).optional().default([]),
  exclude_terms: z.array(z.string()).optional().default([]),
  time_pref: z.string().nullable().optional().default(null),
  hard_site: z.boolean().optional().default(false),
  host_pref: z.string().nullable().optional().default(null),
});

/**
 * Compile a logical query plan into a provider-specific query string.
 *
 * @param {object} logicalPlan
 * @param {string|object} providerNameOrCaps - provider name string or a
 *   capabilities object (for testing operator fallback paths directly).
 * @returns {{ query: string, warnings: string[], fallback_applied: boolean }}
 */
export function compileQuery(logicalPlan, providerNameOrCaps) {
  const caps = typeof providerNameOrCaps === 'string'
    ? getProviderCapabilities(providerNameOrCaps)
    : providerNameOrCaps;

  const providerName = caps.name;
  const warnings = [];
  let fallback_applied = false;

  // None provider → empty
  if (providerName === 'none' || caps.max_query_length === 0) {
    warnings.push('provider_none: no search capability');
    return { query: '', warnings, fallback_applied: false };
  }

  const plan = logicalQueryPlanSchema.parse({
    product: logicalPlan.product,
    terms: logicalPlan.terms,
    site_target: logicalPlan.site_target,
    filetype: logicalPlan.filetype,
    doc_hint: logicalPlan.doc_hint,
    exact_phrases: logicalPlan.exact_phrases,
    exclude_terms: logicalPlan.exclude_terms,
    time_pref: logicalPlan.time_pref,
    hard_site: logicalPlan.hard_site,
    host_pref: logicalPlan.host_pref,
  });

  // Empty product → empty query
  if (!plan.product.trim()) {
    warnings.push('empty_product: no product name');
    return { query: '', warnings, fallback_applied: false };
  }

  const parts = [];

  // Product name
  parts.push(plan.product);

  // Terms
  for (const term of plan.terms) {
    if (term.trim()) parts.push(term);
  }

  // Doc hint
  if (plan.doc_hint) {
    parts.push(plan.doc_hint);
  }

  // site: operator
  if (plan.site_target) {
    if (caps.supports_site) {
      parts.push(`site:${plan.site_target}`);
    } else {
      // Lexical fallback: append domain as plain term
      parts.push(plan.site_target);
      warnings.push('site_operator_unsupported: lexical_fallback');
      fallback_applied = true;
    }
  }

  // filetype: operator
  if (plan.filetype) {
    if (caps.supports_filetype) {
      parts.push(`filetype:${plan.filetype}`);
    } else {
      // Lexical fallback: append filetype as plain term
      parts.push(plan.filetype);
      warnings.push('filetype_operator_unsupported: lexical_fallback');
      fallback_applied = true;
    }
  }

  // time_pref / since operator
  if (plan.time_pref) {
    if (caps.supports_since) {
      parts.push(`after:${plan.time_pref}`);
    } else {
      warnings.push('since_operator_unsupported: omitted');
    }
  }

  // Exact phrases
  if (plan.exact_phrases.length > 0) {
    if (caps.supports_exact_phrase) {
      for (const phrase of plan.exact_phrases) {
        parts.push(`"${phrase}"`);
      }
    } else {
      // Strip quotes, add as plain terms
      for (const phrase of plan.exact_phrases) {
        parts.push(phrase);
      }
      warnings.push('exact_phrase_unsupported: quotes_stripped');
      fallback_applied = true;
    }
  }

  // Exclude terms
  if (plan.exclude_terms.length > 0) {
    if (caps.supports_boolean_not) {
      for (const term of plan.exclude_terms) {
        parts.push(`-${term}`);
      }
    } else {
      warnings.push('boolean_not_unsupported: exclude_terms_omitted');
    }
  }

  let query = parts.join(' ');

  // Truncation
  const maxQueryLength = Math.min(caps.max_query_length, COMPILED_QUERY_MAX_LENGTH);
  if (query.length > maxQueryLength) {
    query = query.slice(0, maxQueryLength).trim();
    warnings.push(`truncated: query exceeded max_query_length ${maxQueryLength}`);
  }

  return { query, warnings, fallback_applied };
}

/**
 * Compile a batch of logical query plans, deduplicating identical queries.
 *
 * @param {object[]} logicalPlans
 * @param {string} providerName
 * @returns {Array<{ query: string, warnings: string[], fallback_applied: boolean }>}
 */
export function compileQueryBatch(logicalPlans, providerName) {
  const seen = new Set();
  const results = [];

  for (const plan of logicalPlans) {
    const compiled = compileQuery(plan, providerName);
    if (!seen.has(compiled.query)) {
      seen.add(compiled.query);
      results.push(compiled);
    }
  }

  return results;
}
