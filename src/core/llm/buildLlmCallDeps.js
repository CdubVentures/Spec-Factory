/**
 * Universal LLM call dependency assembler.
 *
 * O(1) composition point for any feature that makes LLM calls.
 * Pipeline and route handlers both use this to build the deps
 * that createPhaseCallLlm expects.
 *
 * Usage:
 *   const deps = buildLlmCallDeps({ config, logger });
 *   const callLlm = createPhaseCallLlm(deps, SPEC, mapArgs);
 */
import { callLlmWithRouting } from './client/routing.js';

export function buildLlmCallDeps({ config, logger, onPhaseChange, onModelResolved, onStreamChunk, onQueueWait, signal }) {
  return { callRoutedLlmFn: callLlmWithRouting, config, logger, onPhaseChange, onModelResolved, onStreamChunk, onQueueWait, signal };
}
