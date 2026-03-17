export function buildIdentityNormalizationContext({
  config = {},
  identityConfidence = 0,
  allowHelperProvisionalFill = false,
  productId = '',
  runId = '',
  category = '',
  identity = {},
  sourceSummary = {},
  fieldOrder = [],
  consensus = {},
  categoryConfig = {},
  buildAbortedNormalizedFn,
  buildValidatedNormalizedFn,
  createEmptyProvenanceFn,
  passTargetExemptFields = new Set(),
} = {}) {
  const identityPublishThreshold = 0.75;
  const identityProvisionalFloor = 0.50;
  const identityAbort = identityConfidence < identityProvisionalFloor;
  const identityProvisional = !identityAbort && identityConfidence < identityPublishThreshold;
  const identityFull = !identityAbort && !identityProvisional;

  const fields = {
    ...(consensus.fields || {}),
    id: productId,
    brand: identity.brand,
    model: identity.model,
    base_model: identity.base_model,
    category,
    sku: identity.sku,
  };

  const normalized = buildValidatedNormalizedFn({
    productId,
    runId,
    category,
    identity,
    fields,
    quality: {
      validated: false,
      confidence: 0,
      completeness_required: 0,
      coverage_overall: 0,
      notes: [],
    },
    sourceSummary,
  });

  const provenance = consensus.provenance;
  const candidates = consensus.candidates;
  const fieldsBelowPassTarget = consensus.fieldsBelowPassTarget;
  const criticalFieldsBelowPassTarget = consensus.criticalFieldsBelowPassTarget;
  const newValuesProposed = consensus.newValuesProposed;

  if (identityAbort) {
    normalized.quality.notes = [
      ...(normalized.quality.notes || []),
      `Identity certainty ${(identityConfidence * 100).toFixed(0)}% below ${(identityProvisionalFloor * 100).toFixed(0)}%: evidence preserved, publish blocked.`,
    ];
    normalized.review_required = true;
  } else if (identityProvisional) {
    normalized.quality.notes = [
      ...(normalized.quality.notes || []),
      `Identity provisional (${(identityConfidence * 100).toFixed(0)}%): evidence preserved, publish blocked.`,
    ];
    normalized.identity_provisional = true;
    normalized.review_required = true;
  }

  return {
    identityPublishThreshold,
    identityProvisionalFloor,
    identityAbort,
    identityProvisional,
    identityFull,
    normalized,
    provenance,
    candidates,
    fieldsBelowPassTarget,
    criticalFieldsBelowPassTarget,
    newValuesProposed,
  };
}
