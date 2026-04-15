/**
 * Finder Orchestration Helpers — shared boilerplate for all finder modules.
 *
 * WHY: CEF and PIF (and future finders) duplicate identical blocks for model
 * resolution, identity ambiguity, cooldown calculation, and LLM caller setup.
 * Extracting these into parameterised helpers gives O(1) scaling — a new finder
 * imports these instead of copy-pasting 50+ lines.
 *
 * ARCHITECTURE: This file lives in src/core/finder/ and may only import from
 * src/core/**. Feature-specific functions (e.g. resolveIdentityAmbiguitySnapshot)
 * are passed in as parameters by callers who live in src/features/.
 */

import { resolvePhaseModel } from '../llm/client/routing.js';
import { stripCompositeKey } from '../llm/routeResolver.js';
import { extractEffortFromModelName } from '../../shared/effortFromModelName.js';

/**
 * Compute the current ISO timestamp for run bookkeeping.
 *
 * @param {object} [opts]
 * @param {Date}   [opts.now=new Date()] — injectable for deterministic tests
 * @returns {{ ranAt: string, now: Date }}
 */
export function computeRanAt({ now = new Date() } = {}) {
  return { ranAt: now.toISOString(), now };
}

// ─── Model Resolution ────────────────────────────────────────────────────────

/**
 * Resolve the configured model for a phase and wrap the onModelResolved
 * callback to capture the actual model used (including fallback).
 *
 * @param {object} opts
 * @param {object} opts.config — LLM config
 * @param {string} opts.phaseKey — e.g. 'colorFinder', 'imageFinder'
 * @param {Function|null} [opts.onModelResolved] — original callback
 * @returns {{ actualModel: string, actualFallbackUsed: boolean, wrappedOnModelResolved: Function, configModel: string }}
 */
export function resolveModelTracking({ config, phaseKey, onModelResolved = null }) {
  const configModel = resolvePhaseModel(config, phaseKey) || String(config.llmModelPlan || 'unknown');
  let actualModel = stripCompositeKey(configModel);
  let actualFallbackUsed = false;
  let actualAccessMode = '';
  let actualEffortLevel = '';
  let actualThinking = false;
  let actualWebSearch = false;

  // WHY: Effort can come from two sources — baked into model name suffix
  // (e.g. gpt-5.4-xhigh → "xhigh") or configured per-phase in LLM settings.
  // Baked takes priority (same rule as routing.js).
  const capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';
  const capPhase = capitalize(phaseKey);

  const wrappedOnModelResolved = (info) => {
    if (info.model) actualModel = info.model;
    if (info.isFallback) actualFallbackUsed = true;
    if (info.accessMode) actualAccessMode = info.accessMode;
    if (info.thinking != null) actualThinking = Boolean(info.thinking);
    if (info.webSearch != null) actualWebSearch = Boolean(info.webSearch);

    // Resolve effort: baked from model name, else configured for the phase
    const baked = extractEffortFromModelName(info.model || actualModel);
    if (baked) {
      actualEffortLevel = baked;
    } else {
      const configKey = info.isFallback
        ? `_resolved${capPhase}FallbackThinkingEffort`
        : `_resolved${capPhase}ThinkingEffort`;
      actualEffortLevel = String(config[configKey] || '');
    }

    onModelResolved?.(info);
  };

  // WHY: Return a getter-style object. Values are mutated by
  // wrappedOnModelResolved during the LLM call, so callers read
  // them AFTER the call completes.
  const tracking = {
    get actualModel() { return actualModel; },
    get actualFallbackUsed() { return actualFallbackUsed; },
    get actualAccessMode() { return actualAccessMode; },
    get actualEffortLevel() { return actualEffortLevel; },
    get actualThinking() { return actualThinking; },
    get actualWebSearch() { return actualWebSearch; },
    wrappedOnModelResolved,
    configModel,
  };
  return tracking;
}

// ─── Identity Ambiguity ──────────────────────────────────────────────────────

/**
 * Resolve identity ambiguity context from the product family.
 * Non-fatal — returns defaults on failure.
 *
 * @param {object} opts
 * @param {object} opts.config
 * @param {string} opts.category
 * @param {string} opts.brand
 * @param {string} opts.baseModel
 * @param {object} opts.specDb
 * @param {Function} opts.resolveFn — resolveIdentityAmbiguitySnapshot (injected to avoid core→feature import)
 * @returns {Promise<{ familyModelCount: number, ambiguityLevel: string }>}
 */
export async function resolveAmbiguityContext({ config, category, brand, baseModel, specDb, resolveFn }) {
  let familyModelCount = 1;
  let ambiguityLevel = 'easy';
  try {
    const snapshot = await resolveFn({
      config,
      category,
      identityLock: { brand, base_model: baseModel },
      specDb,
    });
    familyModelCount = snapshot.family_model_count || 1;
    ambiguityLevel = snapshot.ambiguity_level || 'easy';
  } catch {
    // Non-fatal — fall back to easy
  }
  return { familyModelCount, ambiguityLevel };
}

// ─── LLM Caller Factory ─────────────────────────────────────────────────────

/**
 * Build the LLM caller function, handling the _callLlmOverride test seam
 * vs the real createXxxCallLlm factory.
 *
 * @param {object} opts
 * @param {Function|null} opts._callLlmOverride — test seam
 * @param {Function} opts.wrappedOnModelResolved — from resolveModelTracking
 * @param {Function} opts.createCallLlm — feature-specific factory (e.g. createColorEditionFinderCallLlm)
 * @param {object} opts.llmDeps — pre-built via buildLlmCallDeps
 * @returns {Function} callLlm(domainArgs)
 */
export function buildFinderLlmCaller({ _callLlmOverride, wrappedOnModelResolved, createCallLlm, llmDeps }) {
  if (_callLlmOverride) {
    return (domainArgs) => _callLlmOverride(domainArgs, { onModelResolved: wrappedOnModelResolved });
  }
  return createCallLlm(llmDeps);
}
