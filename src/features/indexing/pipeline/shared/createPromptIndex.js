// WHY: Factory with in-memory cache for prompt effectiveness NDJSON index.
// Cache invalidated on every recordPromptResult call.
// Pure aggregation exported separately for SQL-backed callers.

import fs from 'node:fs';

// ── Pure aggregation (no I/O — accepts pre-fetched rows) ──

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

function parseLines(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const rows = [];
  for (const line of fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean)) {
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

export function createPromptIndex() {
  const _cache = new Map();

  function getCachedLines(logPath) {
    if (_cache.has(logPath)) return _cache.get(logPath);
    const rows = parseLines(logPath);
    _cache.set(logPath, rows);
    return rows;
  }

  function invalidate(logPath) {
    _cache.delete(logPath);
  }

  function recordPromptResult(record, logPath) {
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
    invalidate(logPath);
  }

  function lookupPromptHistory(version, logPath) {
    const rows = getCachedLines(logPath);
    const matches = rows.filter((r) => r.prompt_version === version);
    if (matches.length === 0) return { times_used: 0, avg_field_count: 0, avg_token_count: 0, avg_latency_ms: 0, success_rate: 0 };

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

  function promptIndexSummary(logPath) {
    return computePromptIndexSummary(getCachedLines(logPath));
  }

  return {
    recordPromptResult,
    lookupPromptHistory,
    promptIndexSummary,
  };
}
