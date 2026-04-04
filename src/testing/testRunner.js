// WHY: Stub — consensus pipeline removed. The validation stage (future) will
// replace this. Kept as export so testModeRouteContext.js can still import
// runTestProduct without crashing.

import { buildRunId } from '../shared/primitives.js';

export async function runTestProduct({
  storage,
  config,
  job,
  sourceResults,
  category,
}) {
  const runId = buildRunId();
  const productId = job.productId;

  // TODO: Wire validation stage here when it exists.
  // Currently returns identity/run metadata only — no field values.

  return {
    productId,
    runId,
    testCase: job._testCase || null,
    confidence: 0,
    coverage: 0,
    completeness: 0,
    validated: false,
    trafficLight: {},
    constraintConflicts: 0,
    missingRequired: [],
    curationSuggestions: 0,
    runtimeFailures: 0,
    durationMs: Date.now(),
  };
}
