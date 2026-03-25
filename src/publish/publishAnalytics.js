import { buildAccuracyReport } from '../testing/goldenFiles.js';
import { buildReviewMetrics } from '../features/review/domain/index.js';
import {
  nowIso,
  toPosix,
  normalizeCategory,
  normalizeFieldKey,
  normalizeToken,
  isObject,
  toArray,
  parseDateMs,
  toNumber,
  toInt,
  parsePeriodDays,
  parseJsonLines
} from './publishPrimitives.js';
import {
  readJsonDual,
  writeJsonDual,
  listOutputKeys
} from './publishStorageAdapter.js';
import { hostnameFromUrl } from './publishSpecBuilders.js';
import { listPublishedCurrentRecords } from './publishProductWriter.js';

export async function runAccuracyBenchmarkReport({
  storage,
  config = {},
  category,
  period = 'weekly',
  maxCases = 0
}) {
  const normalizedCategory = normalizeCategory(category);
  const raw = await buildAccuracyReport({
    category: normalizedCategory,
    storage,
    config,
    maxCases
  });

  const previous = await readJsonDual(storage, [normalizedCategory, '_accuracy_report.json']);
  const previousByField = isObject(previous?.raw?.by_field)
    ? previous.raw.by_field
    : (isObject(previous?.by_field) ? previous.by_field : {});

  const regressions = [];
  for (const [field, metrics] of Object.entries(raw.by_field || {})) {
    const prev = toNumber(previousByField?.[field]?.accuracy, NaN);
    const current = toNumber(metrics?.accuracy, NaN);
    if (!Number.isFinite(prev) || !Number.isFinite(current)) {
      continue;
    }
    const delta = Number.parseFloat((current - prev).toFixed(6));
    if (delta <= -0.05) {
      regressions.push({
        field,
        previous_accuracy: prev,
        current_accuracy: current,
        delta,
        likely_cause: 'pipeline_or_source_change',
        suggested_action: 'review_recent_changes_and_update_extractors'
      });
    }
  }
  regressions.sort((a, b) => a.delta - b.delta || a.field.localeCompare(b.field));

  const groupTrends = {};
  const previousByGroup = isObject(previous?.raw?.by_group)
    ? previous.raw.by_group
    : (isObject(previous?.by_group) ? previous.by_group : {});
  for (const [group, metrics] of Object.entries(raw.by_group || {})) {
    const prev = toNumber(previousByGroup?.[group]?.accuracy, NaN);
    const current = toNumber(metrics?.accuracy, 0);
    let trend = 'stable';
    if (Number.isFinite(prev)) {
      const delta = current - prev;
      if (delta >= 0.02) {
        trend = 'improving';
      } else if (delta <= -0.02) {
        trend = 'declining';
      }
    }
    groupTrends[group] = {
      accuracy: current,
      trend
    };
  }

  const reviewMetrics = await buildReviewMetrics({
    config,
    category: normalizedCategory,
    windowHours: 24
  });
  const llmMetrics = await buildLlmMetrics({
    storage,
    config,
    period: 'month'
  });
  const publishedRecords = await listPublishedCurrentRecords(storage, normalizedCategory);
  const avgCostPerProduct = publishedRecords.length > 0
    ? Number.parseFloat((toNumber(llmMetrics.total_cost_usd, 0) / publishedRecords.length).toFixed(6))
    : 0;

  const topFailures = toArray(raw.common_failures).map((row) => {
    const fieldMetrics = raw.by_field?.[row.field] || {};
    const total = toInt(fieldMetrics.total, 0);
    const count = toInt(row.count, 0);
    return {
      field: row.field,
      failure_rate: total > 0 ? Number.parseFloat((count / total).toFixed(6)) : 0,
      primary_reason: row.reason
    };
  }).sort((a, b) => b.failure_rate - a.failure_rate || a.field.localeCompare(b.field)).slice(0, 15);

  const report = {
    report_type: 'accuracy',
    category: normalizedCategory,
    generated_at: nowIso(),
    period: normalizeToken(period) || 'weekly',
    summary: {
      products_published: publishedRecords.length,
      overall_accuracy: toNumber(raw.overall_accuracy, 0),
      overall_coverage: toNumber(raw.overall_coverage, 0),
      human_override_rate: toNumber(reviewMetrics.overrides_per_product, 0),
      avg_review_time_seconds: toNumber(reviewMetrics.average_review_time_seconds, 0),
      total_llm_cost_usd: toNumber(llmMetrics.total_cost_usd, 0),
      avg_cost_per_product: avgCostPerProduct
    },
    accuracy_by_group: groupTrends,
    regressions,
    top_failures: topFailures,
    raw
  };

  const dateKey = report.generated_at.slice(0, 10);
  await Promise.all([
    writeJsonDual(storage, [normalizedCategory, '_accuracy_report.json'], report),
    writeJsonDual(storage, [normalizedCategory, 'reports', `accuracy_${dateKey}.json`], report)
  ]);

  return report;
}
export async function buildAccuracyTrend({
  storage,
  category,
  field,
  periodDays = 90
}) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedField = normalizeFieldKey(field);
  const days = Math.max(1, parsePeriodDays(periodDays, 90));
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

  const keys = await listOutputKeys(storage, [normalizedCategory, 'reports']);
  const reportKeys = keys.filter((key) => String(key || '').toLowerCase().includes('/reports/accuracy_') && String(key || '').toLowerCase().endsWith('.json'));
  const points = [];

  for (const key of reportKeys) {
    const payload = await storage.readJsonOrNull(key);
    if (!isObject(payload)) {
      continue;
    }
    const generatedAt = String(payload.generated_at || '').trim();
    const generatedMs = parseDateMs(generatedAt);
    if (!generatedMs || generatedMs < cutoff) {
      continue;
    }
    const byField = isObject(payload.raw?.by_field) ? payload.raw.by_field : (isObject(payload.by_field) ? payload.by_field : {});
    const value = toNumber(byField?.[normalizedField]?.accuracy, NaN);
    if (!Number.isFinite(value)) {
      continue;
    }
    points.push({
      generated_at: generatedAt,
      accuracy: value
    });
  }

  points.sort((a, b) => parseDateMs(a.generated_at) - parseDateMs(b.generated_at));
  const first = points[0]?.accuracy;
  const last = points[points.length - 1]?.accuracy;
  const delta = Number.isFinite(first) && Number.isFinite(last)
    ? Number.parseFloat((last - first).toFixed(6))
    : 0;

  return {
    category: normalizedCategory,
    field: normalizedField,
    period_days: days,
    points,
    delta,
    regression_alert: delta <= -0.05
  };
}

export function parseStatusCode(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function statusIsSuccess(status, textStatus = '') {
  if (status !== null) {
    return status >= 200 && status < 400;
  }
  const token = normalizeToken(textStatus);
  return token === 'ok' || token === 'success';
}

export function statusIsBlocked(status, textStatus = '') {
  if (status !== null) {
    return status === 403 || status === 429;
  }
  const token = normalizeToken(textStatus);
  return token.includes('captcha') || token.includes('blocked');
}

export async function buildSourceHealth({
  storage,
  category,
  source = '',
  periodDays = 30
}) {
  const normalizedCategory = normalizeCategory(category);
  const days = Math.max(1, parsePeriodDays(periodDays, 30));
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

  const prefixes = [
    toPosix('final', normalizedCategory),
    storage.resolveOutputKey('final', normalizedCategory)
  ];
  const keys = [];
  const seen = new Set();
  for (const prefix of prefixes) {
    const listed = await storage.listKeys(prefix);
    for (const key of listed) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }

  const sourceKeys = keys.filter((key) => String(key || '').replace(/\\/g, '/').endsWith('/evidence/sources.jsonl'));
  const stats = new Map();

  for (const key of sourceKeys) {
    const text = await storage.readTextOrNull(key);
    const rows = parseJsonLines(text || '');
    for (const row of rows) {
      const tsMs = parseDateMs(row.ts || row.timestamp || '');
      if (!tsMs || tsMs < cutoff) {
        continue;
      }
      const host = String(row.host || hostnameFromUrl(row.url) || '').trim().toLowerCase();
      if (!host) {
        continue;
      }
      if (source && normalizeToken(source) !== normalizeToken(host) && normalizeToken(source) !== normalizeToken(row.source_id || '')) {
        continue;
      }
      if (!stats.has(host)) {
        stats.set(host, {
          host,
          source_id: '',
          attempts: 0,
          success: 0,
          blocked: 0,
          identity_match_count: 0,
          last_seen_at: '',
          freshness_days: 0
        });
      }
      const bucket = stats.get(host);
      bucket.attempts += 1;
      const statusCode = parseStatusCode(row.status);
      const textStatus = String(row.status || row.anchor_status || '').trim();
      if (statusIsSuccess(statusCode, textStatus)) {
        bucket.success += 1;
      }
      if (statusIsBlocked(statusCode, textStatus)) {
        bucket.blocked += 1;
      }
      if (row.identity_match || row.identity?.match) {
        bucket.identity_match_count += 1;
      }
      if (!bucket.source_id && row.source_id) {
        bucket.source_id = String(row.source_id || '').trim();
      }
      const ts = String(row.ts || row.timestamp || '').trim();
      if (parseDateMs(ts) > parseDateMs(bucket.last_seen_at)) {
        bucket.last_seen_at = ts;
      }
    }
  }

  const rows = [...stats.values()]
    .map((row) => {
      const successRate = row.attempts > 0 ? row.success / row.attempts : 0;
      const blockedRate = row.attempts > 0 ? row.blocked / row.attempts : 0;
      const freshnessDays = row.last_seen_at
        ? Number.parseFloat(((Date.now() - parseDateMs(row.last_seen_at)) / (24 * 60 * 60 * 1000)).toFixed(3))
        : Number.POSITIVE_INFINITY;
      return {
        ...row,
        success_rate: Number.parseFloat(successRate.toFixed(6)),
        blocked_rate: Number.parseFloat(blockedRate.toFixed(6)),
        freshness_days: Number.isFinite(freshnessDays) ? freshnessDays : null
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.host.localeCompare(b.host));

  return {
    category: normalizedCategory,
    period_days: days,
    source_filter: source || null,
    generated_at: nowIso(),
    total_sources: rows.length,
    sources: rows,
    alerts: rows
      .filter((row) => row.blocked_rate >= 0.25 || (row.success_rate <= 0.6 && row.attempts >= 5))
      .map((row) => ({
        host: row.host,
        blocked_rate: row.blocked_rate,
        success_rate: row.success_rate,
        attempts: row.attempts
      }))
  };
}

export async function buildLlmMetrics({
  storage,
  config = {},
  period = 'week',
  model = '',
  category = '',
  runLimit = 120
}) {
  const days = parsePeriodDays(period, 7);
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const normalizedCategory = normalizeToken(category);
  const text = await storage.readTextOrNull('_billing/ledger.jsonl') || await storage.readTextOrNull(storage.resolveOutputKey('_billing', 'ledger.jsonl')) || '';
  const rows = parseJsonLines(text)
    .filter((row) => parseDateMs(row.ts) >= cutoff)
    .filter((row) => !normalizedCategory || normalizeToken(row.category || '') === normalizedCategory)
    .filter((row) => !model || normalizeToken(row.model || '') === normalizeToken(model));

  const byModelMap = new Map();
  const byProviderMap = new Map();
  const byRunMap = new Map();
  const products = new Set();
  let totalCost = 0;
  let totalCalls = 0;
  let promptTokens = 0;
  let completionTokens = 0;

  for (const row of rows) {
    const provider = String(row.provider || 'unknown').trim();
    const modelName = String(row.model || 'unknown').trim();
    const rowRunId = String(row.runId || row.run_id || '').trim();
    const rowProductId = String(row.productId || row.product_id || '').trim();
    const rowCategory = String(row.category || '').trim();
    const rowReason = String(row.reason || 'extract').trim();
    const rowTs = String(row.ts || '').trim();
    const rowDay = rowTs.slice(0, 10) || 'unknown_day';
    const runKey = rowRunId || `${rowDay}::${rowProductId || 'unknown_product'}`;
    const key = `${provider}:${modelName}`;
    if (!byModelMap.has(key)) {
      byModelMap.set(key, {
        provider,
        model: modelName,
        calls: 0,
        cost_usd: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        products: new Set()
      });
    }
    const bucket = byModelMap.get(key);
    if (!byProviderMap.has(provider)) {
      byProviderMap.set(provider, {
        provider,
        calls: 0,
        cost_usd: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        products: new Set()
      });
    }
    const providerBucket = byProviderMap.get(provider);
    if (!byRunMap.has(runKey)) {
      byRunMap.set(runKey, {
        session_id: runKey,
        run_id: rowRunId || null,
        is_session_fallback: !rowRunId,
        started_at: rowTs || null,
        last_call_at: rowTs || null,
        category: rowCategory || null,
        product_id: rowProductId || null,
        calls: 0,
        cost_usd: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        providers: new Set(),
        models: new Set(),
        reasons: new Set(),
        products: new Set()
      });
    }
    const runBucket = byRunMap.get(runKey);
    const cost = toNumber(row.cost_usd, 0);
    const prompt = toInt(row.prompt_tokens, 0);
    const completion = toInt(row.completion_tokens, 0);

    bucket.calls += 1;
    bucket.cost_usd += cost;
    bucket.prompt_tokens += prompt;
    bucket.completion_tokens += completion;
    if (rowProductId) {
      bucket.products.add(rowProductId);
      products.add(rowProductId);
    }
    providerBucket.calls += 1;
    providerBucket.cost_usd += cost;
    providerBucket.prompt_tokens += prompt;
    providerBucket.completion_tokens += completion;
    if (rowProductId) {
      providerBucket.products.add(rowProductId);
    }

    runBucket.calls += 1;
    runBucket.cost_usd += cost;
    runBucket.prompt_tokens += prompt;
    runBucket.completion_tokens += completion;
    if (rowTs) {
      const startedMs = parseDateMs(runBucket.started_at);
      const lastMs = parseDateMs(runBucket.last_call_at);
      const currentMs = parseDateMs(rowTs);
      if (!startedMs || (currentMs && currentMs < startedMs)) {
        runBucket.started_at = rowTs;
      }
      if (!lastMs || (currentMs && currentMs > lastMs)) {
        runBucket.last_call_at = rowTs;
      }
    }
    if (!runBucket.product_id && rowProductId) {
      runBucket.product_id = rowProductId;
    }
    if (!runBucket.category && rowCategory) {
      runBucket.category = rowCategory;
    }
    if (provider) runBucket.providers.add(provider);
    if (modelName) runBucket.models.add(modelName);
    if (rowReason) runBucket.reasons.add(rowReason);
    if (rowProductId) runBucket.products.add(rowProductId);

    totalCost += cost;
    totalCalls += 1;
    promptTokens += prompt;
    completionTokens += completion;
  }

  const byModel = [...byModelMap.values()]
    .map((row) => ({
      provider: row.provider,
      model: row.model,
      calls: row.calls,
      cost_usd: Number.parseFloat(row.cost_usd.toFixed(8)),
      avg_cost_per_call: row.calls > 0 ? Number.parseFloat((row.cost_usd / row.calls).toFixed(8)) : 0,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      products: row.products.size
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd || a.model.localeCompare(b.model));
  const byProvider = [...byProviderMap.values()]
    .map((row) => ({
      provider: row.provider,
      calls: row.calls,
      cost_usd: Number.parseFloat(row.cost_usd.toFixed(8)),
      avg_cost_per_call: row.calls > 0 ? Number.parseFloat((row.cost_usd / row.calls).toFixed(8)) : 0,
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      products: row.products.size
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd || a.provider.localeCompare(b.provider));
  const byRun = [...byRunMap.values()]
    .map((row) => {
      const startedMs = parseDateMs(row.started_at);
      const lastMs = parseDateMs(row.last_call_at);
      const spanSeconds = startedMs && lastMs && lastMs >= startedMs
        ? Math.floor((lastMs - startedMs) / 1000)
        : 0;
      return {
        session_id: row.session_id,
        run_id: row.run_id,
        is_session_fallback: row.is_session_fallback,
        started_at: row.started_at,
        last_call_at: row.last_call_at,
        span_seconds: spanSeconds,
        category: row.category,
        product_id: row.product_id,
        calls: row.calls,
        cost_usd: Number.parseFloat(row.cost_usd.toFixed(8)),
        avg_cost_per_call: row.calls > 0 ? Number.parseFloat((row.cost_usd / row.calls).toFixed(8)) : 0,
        prompt_tokens: row.prompt_tokens,
        completion_tokens: row.completion_tokens,
        providers: [...row.providers].sort(),
        models: [...row.models].sort(),
        reasons: [...row.reasons].sort(),
        unique_products: row.products.size
      };
    })
    .sort((a, b) => parseDateMs(b.last_call_at) - parseDateMs(a.last_call_at))
    .slice(0, Math.max(10, toInt(runLimit, 120)));

  return {
    period_days: days,
    period: normalizeToken(period),
    category: category || null,
    model_filter: model || null,
    generated_at: nowIso(),
    total_calls: totalCalls,
    total_cost_usd: Number.parseFloat(totalCost.toFixed(8)),
    total_prompt_tokens: promptTokens,
    total_completion_tokens: completionTokens,
    unique_products: products.size,
    avg_cost_per_product: products.size > 0 ? Number.parseFloat((totalCost / products.size).toFixed(8)) : 0,
    by_provider: byProvider,
    by_model: byModel,
    by_run: byRun,
  };
}
