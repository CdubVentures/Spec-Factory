/**
 * SKU Finder — thin registration (factory-driven).
 *
 * All structural wiring (orchestrator, schema, store recalc, extract,
 * satisfaction) comes from the shared scalar-finder factories. Only the
 * SKF-bespoke prompt + LLM caller pair is injected here.
 *
 * Publisher gate: valid candidates go to `submitCandidate()`, which validates
 * evidence (min_evidence_refs, tier_preference) before promoting to
 * `fields.sku`.
 */

import { registerScalarFinder } from '../../core/finder/registerScalarFinder.js';
import { FINDER_MODULE_MAP } from '../../core/finder/finderModuleRegistry.js';
import { skuFinderStore } from './skuStore.js';
import {
  createSkuFinderCallLlm,
  buildSkuFinderPrompt,
} from './skuLlmAdapter.js';

const mod = FINDER_MODULE_MAP.skuFinder;

const { runOnce, runLoop } = registerScalarFinder({
  finderName: mod.id,
  fieldKey: mod.fieldKeys[0],
  valueKey: mod.valueKey,
  sourceType: mod.candidateSourceType,
  phase: mod.phase,
  logPrefix: mod.logPrefix,
  createCallLlm: createSkuFinderCallLlm,
  buildPrompt: buildSkuFinderPrompt,
  store: skuFinderStore,
});

export const runSkuFinder = runOnce;
export const runSkuFinderLoop = runLoop;
