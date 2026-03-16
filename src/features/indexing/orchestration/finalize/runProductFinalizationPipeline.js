import { createProductFinalizationPipelineRuntime } from './createProductFinalizationPipelineRuntime.js';

export async function runProductFinalizationPipeline({
  finalizationPipelineRuntime = null,
  createProductFinalizationPipelineRuntimeFn = createProductFinalizationPipelineRuntime,
  runProductFinalizationDerivationFn,
  buildRunProductFinalizationSummaryFn,
  runProductCompletionLifecycleFn,
  ...context
} = {}) {
  const resolvedFinalizationPipelineRuntime =
    finalizationPipelineRuntime || createProductFinalizationPipelineRuntimeFn({
      context,
      runProductFinalizationDerivationFn,
      buildRunProductFinalizationSummaryFn,
      runProductCompletionLifecycleFn,
    });

  const finalizationDerivation =
    await resolvedFinalizationPipelineRuntime.deriveFinalization();
  const summaryBuildResult =
    resolvedFinalizationPipelineRuntime.buildSummary({ finalizationDerivation });

  return resolvedFinalizationPipelineRuntime.runCompletion({
    finalizationDerivation,
    summaryBuildResult,
  });
}
