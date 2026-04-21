/**
 * Shared prompt-input resolver for scalar per-variant finders (RDF, SKU).
 *
 * Extracted from variantScalarFieldProducer.js so both the orchestrator and
 * the preview-prompt route compile from the same source of truth. Drift
 * between preview and real-run becomes a compile error rather than a runtime
 * discrepancy.
 *
 * Pure — no I/O, no logging, no LLM dispatch.
 */

import { accumulateDiscoveryLog } from './discoveryLog.js';

export function defaultBuildScalarUserMessage(product, variant) {
  return JSON.stringify({
    brand: product.brand,
    model: product.model,
    base_model: product.base_model,
    variant: variant.key,
    variant_label: variant.label,
    variant_type: variant.type,
  });
}

/**
 * Compute the per-variant previousDiscovery arg from accumulated runs +
 * suppressions. Both orchestrator (per-variant on each call) and preview
 * (one-shot for the variant being previewed) call this.
 *
 * @param {object} opts
 * @param {Array} opts.previousRuns
 * @param {{variant_id?: string, key: string}} opts.variant
 * @param {boolean} opts.urlHistoryEnabled
 * @param {boolean} opts.queryHistoryEnabled
 * @param {Array<{kind: string, item: string}>} opts.suppRows
 */
export function resolveScalarPreviousDiscovery({
  previousRuns,
  variant,
  urlHistoryEnabled,
  queryHistoryEnabled,
  suppRows,
}) {
  return accumulateDiscoveryLog(previousRuns, {
    runMatcher: (r) => {
      const rId = r.response?.variant_id;
      const rKey = r.response?.variant_key;
      return (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
    },
    includeUrls: urlHistoryEnabled,
    includeQueries: queryHistoryEnabled,
    suppressions: {
      urlsChecked: new Set(suppRows.filter((s) => s.kind === 'url').map((s) => s.item)),
      queriesRun: new Set(suppRows.filter((s) => s.kind === 'query').map((s) => s.item)),
    },
  });
}

/**
 * Assemble the scalar-finder prompt inputs: the domainArgs object that feeds
 * `buildPrompt(domainArgs)`, plus the user message, plus structured metadata
 * for the preview response envelope.
 *
 * @param {object} opts
 * @param {object} opts.product
 * @param {{variant_id?: string|null, key: string, label: string, type: string}} opts.variant
 * @param {Array} opts.allVariants
 * @param {string[]} opts.siblingsExcluded
 * @param {number} opts.familyModelCount
 * @param {string} opts.ambiguityLevel
 * @param {{urlsChecked: string[], queriesRun: string[]}} opts.previousDiscovery
 * @param {string} [opts.promptOverride]
 * @param {Function} [opts.buildUserMessage]
 */
export function resolveScalarFinderPromptInputs({
  product,
  variant,
  allVariants,
  siblingsExcluded,
  familyModelCount,
  ambiguityLevel,
  previousDiscovery,
  promptOverride = '',
  buildUserMessage = defaultBuildScalarUserMessage,
}) {
  const domainArgs = {
    product,
    variantLabel: variant.label,
    variantType: variant.type,
    variantKey: variant.key,
    allVariants,
    siblingsExcluded,
    familyModelCount,
    ambiguityLevel,
    previousDiscovery,
    promptOverride,
  };

  const userMessage = buildUserMessage(product, variant);

  const urlsCount = previousDiscovery?.urlsChecked?.length || 0;
  const queriesCount = previousDiscovery?.queriesRun?.length || 0;

  const inputsResolved = {
    product_id: product.product_id,
    variant_key: variant.key,
    variant_label: variant.label,
    variant_type: variant.type,
    variant_id: variant.variant_id || null,
    family_model_count: familyModelCount,
    ambiguity_level: ambiguityLevel,
    sibling_models: [...siblingsExcluded],
    previous_urls_count: urlsCount,
    previous_queries_count: queriesCount,
  };

  const siblingWord = siblingsExcluded.length === 1 ? 'sibling model' : 'sibling models';
  const notes = [
    `Identity tier: ${ambiguityLevel} · ${siblingsExcluded.length} ${siblingWord}`,
    `Previous discovery: ${urlsCount} urls / ${queriesCount} queries`,
  ];

  return { domainArgs, userMessage, inputsResolved, notes };
}
