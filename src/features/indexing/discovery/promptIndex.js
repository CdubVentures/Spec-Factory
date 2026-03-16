// WHY: Cross-run prompt effectiveness index. Tracks which prompt versions
// yield the most fields per token — enables prompt evolution decisions.

import fs from 'node:fs';

/**
 * Append a prompt result record to the NDJSON log.
 */
export function recordPromptResult(record, logPath) {
  const line = JSON.stringify({
    prompt_version: record.prompt_version ?? null,
    prompt_hash: record.prompt_hash ?? null,
    model: record.model ?? null,
    field_count: record.field_count ?? 0,
    token_count: record.token_count ?? 0,
    latency_ms: record.latency_ms ?? 0,
    success: Boolean(record.success),
    run_id: record.run_id ?? null,
    category: record.category ?? null,
    ts: new Date().toISOString(),
  });
  fs.appendFileSync(logPath, line + '\n', 'utf8');
}

/**
 * Look up prompt history by version from the NDJSON log.
 */
export function lookupPromptHistory(version, logPath) {
  if (!fs.existsSync(logPath)) {
    return { times_used: 0, avg_field_count: 0, avg_token_count: 0, avg_latency_ms: 0, success_rate: 0 };
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const matches = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.prompt_version === version) matches.push(row);
    } catch { /* skip malformed */ }
  }

  if (matches.length === 0) {
    return { times_used: 0, avg_field_count: 0, avg_token_count: 0, avg_latency_ms: 0, success_rate: 0 };
  }

  const totalFields = matches.reduce((s, m) => s + (m.field_count || 0), 0);
  const totalTokens = matches.reduce((s, m) => s + (m.token_count || 0), 0);
  const totalLatency = matches.reduce((s, m) => s + (m.latency_ms || 0), 0);
  const successCount = matches.filter((m) => m.success).length;

  return {
    times_used: matches.length,
    avg_field_count: totalFields / matches.length,
    avg_token_count: totalTokens / matches.length,
    avg_latency_ms: totalLatency / matches.length,
    success_rate: successCount / matches.length,
  };
}

/**
 * Full prompt index summary — totals, per-version stats, model breakdown.
 */
export function promptIndexSummary(logPath) {
  if (!fs.existsSync(logPath)) {
    return { total_calls: 0, total_tokens: 0, unique_versions: 0, versions: [], model_breakdown: {} };
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const versionMap = new Map();
  const modelMap = {};
  let totalCalls = 0;
  let totalTokens = 0;

  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      totalCalls++;
      totalTokens += row.token_count || 0;

      const ver = row.prompt_version ?? 'unknown';
      if (!versionMap.has(ver)) {
        versionMap.set(ver, { calls: [], fieldSum: 0, tokenSum: 0, latencySum: 0, successCount: 0 });
      }
      const vg = versionMap.get(ver);
      vg.calls.push(row);
      vg.fieldSum += row.field_count || 0;
      vg.tokenSum += row.token_count || 0;
      vg.latencySum += row.latency_ms || 0;
      if (row.success) vg.successCount++;

      const model = row.model ?? 'unknown';
      if (!modelMap[model]) {
        modelMap[model] = { call_count: 0, total_tokens: 0, avg_latency_sum: 0 };
      }
      modelMap[model].call_count++;
      modelMap[model].total_tokens += row.token_count || 0;
      modelMap[model].avg_latency_sum += row.latency_ms || 0;
    } catch { /* skip malformed */ }
  }

  const versions = [];
  for (const [ver, vg] of versionMap) {
    const count = vg.calls.length;
    versions.push({
      version: ver,
      call_count: count,
      avg_field_count: count > 0 ? vg.fieldSum / count : 0,
      avg_token_count: count > 0 ? vg.tokenSum / count : 0,
      avg_latency_ms: count > 0 ? vg.latencySum / count : 0,
      success_rate: count > 0 ? vg.successCount / count : 0,
    });
  }

  const modelBreakdown = {};
  for (const [model, mb] of Object.entries(modelMap)) {
    modelBreakdown[model] = {
      call_count: mb.call_count,
      total_tokens: mb.total_tokens,
      avg_latency_ms: mb.call_count > 0 ? mb.avg_latency_sum / mb.call_count : 0,
    };
  }

  return {
    total_calls: totalCalls,
    total_tokens: totalTokens,
    unique_versions: versionMap.size,
    versions,
    model_breakdown: modelBreakdown,
  };
}
