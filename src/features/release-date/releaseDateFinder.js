/**
 * Release Date Finder — thin registration (factory-driven).
 *
 * All structural wiring (orchestrator, schema, store recalc, extract,
 * satisfaction) comes from the shared scalar-finder factories. Only the
 * RDF-bespoke prompt + LLM caller pair is injected here.
 *
 * Publisher gate: valid candidates go to `submitCandidate()`, which validates
 * evidence (min_evidence_refs, tier_preference) before promoting to
 * `fields.release_date`.
 */

import { registerScalarFinder } from '../../core/finder/registerScalarFinder.js';
import { FINDER_MODULE_MAP } from '../../core/finder/finderModuleRegistry.js';
import { releaseDateFinderStore } from './releaseDateStore.js';
import {
  createReleaseDateFinderCallLlm,
  buildReleaseDateFinderPrompt,
} from './releaseDateLlmAdapter.js';

const mod = FINDER_MODULE_MAP.releaseDateFinder;

const { runOnce, runLoop } = registerScalarFinder({
  finderName: mod.id,
  fieldKey: mod.fieldKeys[0],
  valueKey: mod.valueKey,
  sourceType: mod.candidateSourceType,
  phase: mod.phase,
  logPrefix: mod.logPrefix,
  createCallLlm: createReleaseDateFinderCallLlm,
  buildPrompt: buildReleaseDateFinderPrompt,
  store: releaseDateFinderStore,
});

export const runReleaseDateFinder = runOnce;
export const runReleaseDateFinderLoop = runLoop;
