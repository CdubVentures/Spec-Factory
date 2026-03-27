export function createRunLlmRuntime({
  storage,
  config = {},
  category = '',
  productId = '',
  runId = '',
  roundContext = null,
  runtimeMode = 'production',
  traceWriter = null,
  routeMatrixPolicy = {},
  runtimeOverrides = {},
  specDb = null,
  normalizeCostRatesFn = () => ({}),
  appendCostLedgerEntryFn = async () => {},
  recordPromptResultFn = () => {},
  defaultIndexLabRootFn = () => '.',
  joinPathFn = (...parts) => parts.join('/'),
  mkdirSyncFn = () => {},
  nowIsoFn = () => new Date().toISOString(),
} = {}) {
  const llmCostRates = normalizeCostRatesFn(config);
  let llmCostUsd = 0;
  let llmCallCount = 0;
  let llmEstimatedUsageCount = 0;
  let llmRetryWithoutSchemaCount = 0;

  const escalatedFromRound = Array.isArray(roundContext?.escalated_fields)
    ? roundContext.escalated_fields.filter(Boolean)
    : [];

  const llmContext = {
    storage,
    category,
    productId,
    runId,
    round: Number.parseInt(String(roundContext?.round ?? 0), 10) || 0,
    mode: runtimeMode,
    costRates: llmCostRates,
    traceWriter,
    route_matrix_policy: routeMatrixPolicy,
    routeMatrixPolicy: routeMatrixPolicy,
    forcedHighFields: [
      ...new Set([...(runtimeOverrides.force_high_fields || []), ...escalatedFromRound]),
    ],
    async recordUsage(usageRow = {}) {
      llmCallCount += 1;
      llmCostUsd = Number.parseFloat((llmCostUsd + Number(usageRow.cost_usd || 0)).toFixed(8));
      if (usageRow.estimated_usage) {
        llmEstimatedUsageCount += 1;
      }
      if (usageRow.retry_without_schema) {
        llmRetryWithoutSchemaCount += 1;
      }

      await appendCostLedgerEntryFn({
        storage,
        config,
        specDb,
        entry: {
          ts: nowIsoFn(),
          provider: usageRow.provider,
          model: usageRow.model,
          category,
          productId,
          runId,
          round: usageRow.round || 0,
          prompt_tokens: usageRow.prompt_tokens || 0,
          completion_tokens: usageRow.completion_tokens || 0,
          cached_prompt_tokens: usageRow.cached_prompt_tokens || 0,
          total_tokens: usageRow.total_tokens || 0,
          cost_usd: usageRow.cost_usd || 0,
          reason: usageRow.reason || 'extract',
          host: usageRow.host || '',
          url_count: usageRow.url_count || 0,
          evidence_chars: usageRow.evidence_chars || 0,
          estimated_usage: Boolean(usageRow.estimated_usage),
          meta: {
            retry_without_schema: Boolean(usageRow.retry_without_schema),
            deepseek_mode_detected: Boolean(usageRow.deepseek_mode_detected),
            json_schema_requested: Boolean(usageRow.json_schema_requested),
          },
        },
      });

      try {
        const promptIndexRoot = joinPathFn(defaultIndexLabRootFn(), category);
        mkdirSyncFn(promptIndexRoot, { recursive: true });
        recordPromptResultFn({
          prompt_version: usageRow.reason || 'extract',
          prompt_hash: '',
          model: usageRow.model || '',
          field_count: 0,
          token_count: usageRow.total_tokens || 0,
          latency_ms: 0,
          success: true,
          run_id: runId,
          category,
        }, joinPathFn(promptIndexRoot, 'prompt-index.ndjson'));
      } catch {
        // Index recording must not crash the pipeline.
      }
    },
  };

  return {
    llmCostRates,
    llmContext,
    getUsageState() {
      return {
        llmCallCount,
        llmCostUsd,
        llmEstimatedUsageCount,
        llmRetryWithoutSchemaCount,
      };
    },
  };
}
