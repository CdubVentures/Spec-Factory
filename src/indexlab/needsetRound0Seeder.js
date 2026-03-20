import { computeNeedSet } from './needsetEngine.js';

/**
 * Seed a NeedSet for round 0 -- all fields start as missing.
 * Produces the same shape as computeNeedSet() so dispatch is uniform.
 */
export function seedRound0NeedSet({
  category = '',
  productId = '',
  fieldOrder = [],
  fieldRules = {},
  jobRequirements = {},
  brand = '',
  model = '',
  baseModel = '',
  aliases = [],
  settings = {},
  identityContext = {},
  computeNeedSetFn = computeNeedSet
} = {}) {
  // Build empty provenance (all fields missing)
  const provenance = {};

  return computeNeedSetFn({
    runId: '',
    category,
    productId,
    fieldOrder,
    provenance, // empty = all fields missing
    fieldRules,
    fieldReasoning: {},
    constraintAnalysis: {},
    identityContext,
    now: new Date().toISOString(),
    round: 0,
    brand,
    model,
    baseModel,
    aliases,
    settings,
    previousFieldHistories: {},
  });
}
