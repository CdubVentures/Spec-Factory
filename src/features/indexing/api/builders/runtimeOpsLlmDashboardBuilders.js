import { parseTsMs } from './runtimeOpsEventPrimitives.js';
import { buildRuntimeOpsWorkers } from './runtimeOpsWorkerPoolBuilders.js';
import { estimateTokensFromText, computeLlmCostUsd, normalizeUsage } from '../../../../billing/costRates.js';


export function buildLlmCallsDashboard(events, options) {
  // WHY: Accept pre-built workers to avoid redundant 484-line rebuild.
  // buildRuntimeOpsPanels already built workers — reuse them.
  const workers = options?.preBuiltWorkers || buildRuntimeOpsWorkers(events, options);
  const llmWorkers = workers.filter((w) => w.pool === 'llm');

  llmWorkers.sort((a, b) => parseTsMs(a.started_at) - parseTsMs(b.started_at));

  // Build call rows first (with token estimation), then derive summary from them
  const calls = llmWorkers.map((w, idx) => {
    let status = 'done';
    if (w.state === 'running' || w.state === 'stuck') {
      status = 'active';
    } else if (w.last_error) {
      status = 'failed';
    }
    let promptTok = Number(w.prompt_tokens) || 0;
    let completionTok = Number(w.completion_tokens) || 0;
    let cost = Number(w.estimated_cost) || 0;
    let estimated = false;
    // Estimate tokens from previews when provider didn't report usage
    if (promptTok === 0 && completionTok === 0 && status !== 'active') {
      promptTok = estimateTokensFromText(w.prompt_preview || '');
      completionTok = estimateTokensFromText(w.response_preview || '');
      if (promptTok > 0 || completionTok > 0) {
        const usage = normalizeUsage({ prompt_tokens: promptTok, completion_tokens: completionTok });
        cost = computeLlmCostUsd({
          usage,
          rates: options?.costRates || {},
          model: w.model || '',
          provider: w.provider || '',
        }).costUsd;
        estimated = true;
      }
    }
    return {
      index: idx + 1,
      worker_id: w.worker_id,
      call_type: w.call_type || 'unknown',
      round: w.round ?? 1,
      model: w.model || '',
      provider: w.provider || '',
      status,
      prompt_tokens: promptTok,
      completion_tokens: completionTok,
      total_tokens: promptTok + completionTok,
      estimated_cost: cost,
      estimated_usage: estimated,
      duration_ms: w.duration_ms ?? (w.elapsed_ms > 0 ? w.elapsed_ms : null),
      prompt_preview: w.prompt_preview || null,
      response_preview: w.response_preview || null,
      prefetch_tab: w.prefetch_tab || null,
      is_fallback: Boolean(w.is_fallback),
      is_lab: Boolean(w.is_lab),
      primary_duration_ms: w.primary_duration_ms ?? null,
      ts: w.started_at || '',
    };
  });

  // Derive summary from the enriched call rows
  let totalCost = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  let durationSum = 0;
  let durationCount = 0;
  let activeCount = 0;
  const roundSet = new Set();
  const modelMap = {};
  const callTypeMap = {};

  for (const c of calls) {
    totalCost += c.estimated_cost;
    totalPrompt += c.prompt_tokens;
    totalCompletion += c.completion_tokens;
    if (c.status === 'active') {
      activeCount++;
    } else if (c.duration_ms != null && c.duration_ms > 0) {
      durationSum += c.duration_ms;
      durationCount += 1;
    }
    roundSet.add(c.round);
    const mk = c.model || 'unknown';
    if (!modelMap[mk]) modelMap[mk] = { model: mk, calls: 0, cost_usd: 0 };
    modelMap[mk].calls += 1;
    modelMap[mk].cost_usd += c.estimated_cost;
    const ck = c.call_type || 'unknown';
    if (!callTypeMap[ck]) callTypeMap[ck] = { call_type: ck, cost_usd: 0 };
    callTypeMap[ck].cost_usd += c.estimated_cost;
  }

  const maxRound = roundSet.size > 0 ? Math.max(...roundSet) : 0;
  const callsInLatestRound = maxRound > 0 ? calls.filter((c) => c.round === maxRound).length : 0;

  return {
    calls,
    summary: {
      total_calls: calls.length,
      active_calls: activeCount,
      completed_calls: calls.length - activeCount,
      total_cost_usd: totalCost,
      total_tokens: totalPrompt + totalCompletion,
      prompt_tokens: totalPrompt,
      completion_tokens: totalCompletion,
      avg_latency_ms: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
      rounds: roundSet.size,
      calls_in_latest_round: callsInLatestRound,
      by_model: Object.values(modelMap).sort((a, b) => b.cost_usd - a.cost_usd),
      by_call_type: Object.values(callTypeMap).sort((a, b) => b.cost_usd - a.cost_usd),
    },
  };
}
