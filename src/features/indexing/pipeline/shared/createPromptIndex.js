// WHY: Pure aggregation function for prompt telemetry index.
// Accepts pre-fetched rows (from SQL) and returns summary object.
// NDJSON factory removed — pipeline uses SQL via specDb.insertPromptIndexEntry (Wave B1-B4).

export function computePromptIndexSummary(rows) {
  if (rows.length === 0) return { total_calls: 0, total_tokens: 0, unique_versions: 0, versions: [], model_breakdown: {} };

  const versionMap = new Map();
  const modelMap = {};
  let totalTokens = 0;

  for (const row of rows) {
    totalTokens += row.token_count || 0;

    const ver = row.prompt_version ?? 'unknown';
    if (!versionMap.has(ver)) versionMap.set(ver, { calls: [], fieldSum: 0, tokenSum: 0, latencySum: 0, successCount: 0 });
    const vg = versionMap.get(ver);
    vg.calls.push(row);
    vg.fieldSum += row.field_count || 0;
    vg.tokenSum += row.token_count || 0;
    vg.latencySum += row.latency_ms || 0;
    if (row.success) vg.successCount++;

    const model = row.model ?? 'unknown';
    if (!modelMap[model]) modelMap[model] = { call_count: 0, total_tokens: 0, avg_latency_sum: 0 };
    modelMap[model].call_count++;
    modelMap[model].total_tokens += row.token_count || 0;
    modelMap[model].avg_latency_sum += row.latency_ms || 0;
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

  return { total_calls: rows.length, total_tokens: totalTokens, unique_versions: versionMap.size, versions, model_breakdown: modelBreakdown };
}
