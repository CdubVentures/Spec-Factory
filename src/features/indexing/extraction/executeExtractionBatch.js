function countFieldCandidates(result) {
  return Number(result?.fieldCandidates?.length || 0);
}

export async function executeExtractionBatch({
  batchId,
  productId,
  cache = null,
  cacheKey = '',
  budgetGuard = null,
  providerPinEnabled = false,
  logger = null,
  invokeModel,
  primaryRequest = {},
  repatchRequest = null
} = {}) {
  const notes = [];
  const normalizedCacheKey = String(cacheKey || '').trim();

  if (cache && normalizedCacheKey) {
    const cached = await cache.get(normalizedCacheKey);
    if (cached && typeof cached === 'object') {
      return {
        sanitized: cached,
        cacheHit: true,
        notes
      };
    }
  }

  let sanitized = await invokeModel(primaryRequest);

  if (repatchRequest && countFieldCandidates(sanitized) === 0) {
    if (providerPinEnabled) {
      logger?.info?.('llm_extract_batch_repatch_skipped_provider_pin', {
        productId,
        batch: batchId,
        primary_model: primaryRequest?.model || '',
        repatch_model: repatchRequest?.model || ''
      });
      notes.push(`Batch ${batchId} repatch skipped by provider pin.`);
    } else {
      const canRepatchCall = budgetGuard?.canCall?.({
        reason: repatchRequest?.reason,
        essential: false
      }) || { allowed: true };

      if (!canRepatchCall.allowed) {
        budgetGuard?.block?.(canRepatchCall.reason);
        logger?.warn?.('llm_extract_batch_repatch_skipped_budget', {
          productId,
          batch: batchId,
          reason: canRepatchCall.reason
        });
        notes.push(`Batch ${batchId} repatch skipped by budget guard.`);
      } else {
        try {
          const repatched = await invokeModel(repatchRequest);
          if (countFieldCandidates(repatched) > countFieldCandidates(sanitized)) {
            sanitized = repatched;
          }
        } catch (repatchError) {
          logger?.warn?.('llm_extract_batch_repatch_failed', {
            productId,
            batch: batchId,
            model: repatchRequest?.model || '',
            message: repatchError?.message || 'unknown_error'
          });
        }
      }
    }
  }

  if (cache && normalizedCacheKey) {
    await cache.set(normalizedCacheKey, sanitized);
  }

  return {
    sanitized,
    cacheHit: false,
    notes
  };
}
