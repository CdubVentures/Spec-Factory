// WHY: Canonical telemetry callback bundle every finder route passes to its
// orchestrator. Replaces ~30 LOC of duplicated wiring that lived in
// finderRoutes / keyFinderRoutes / colorEditionFinderRoutes. Adding a new
// telemetry channel = add one callback here; every finder picks it up for free.
// PIF intentionally keeps its own wiring (richer carousel telemetry).

import {
  updateStage,
  updateModelInfo,
  updateQueueDelay,
  updateLoopProgress,
  appendLlmCall,
  markPassengersRegistered,
} from './index.js';

/**
 * Build the standard telemetry callback bundle for a finder route.
 *
 * @param {object} args
 * @param {{id: string}} args.op           Operation registered via registerOperation.
 * @param {{push: Function}} args.batcher  Stream batcher (createStreamBatcher) that
 *                                          buffers token chunks for WS broadcast.
 * @param {'run'|'loop'} [args.mode='run'] When 'loop', onLoopProgress is included.
 * @returns {object} bundle of callbacks to spread into orchestrator opts.
 */
export function buildOperationTelemetry({ op, batcher, mode = 'run' }) {
  const bundle = {
    onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
    onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
    onStreamChunk: (delta) => {
      if (!delta) return;
      if (delta.reasoning) batcher.push(delta.reasoning);
      if (delta.content) batcher.push(delta.content);
    },
    onQueueWait: (ms) => updateQueueDelay({ id: op.id, queueDelayMs: ms }),
    onLlmCallComplete: (call) => appendLlmCall({ id: op.id, call }),
    onPassengersRegistered: (passengerFieldKeys) =>
      markPassengersRegistered({ id: op.id, passengerFieldKeys }),
  };
  if (mode === 'loop') {
    bundle.onLoopProgress = (loopProgress) => updateLoopProgress({ id: op.id, loopProgress });
  }
  return bundle;
}
