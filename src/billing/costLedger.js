import { nowIso, normalizeToken } from '../shared/primitives.js';

function round(value, digits = 8) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function monthFromTs(ts = nowIso()) {
  return String(ts).slice(0, 7);
}

function dayFromTs(ts = nowIso()) {
  return String(ts).slice(0, 10);
}

function ledgerKey(_storage, month) {
  return `_billing/ledger/${month}.jsonl`;
}

function monthlyRollupKey(_storage, month) {
  return `_billing/monthly/${month}.json`;
}

function monthlyDigestKey(_storage, month) {
  return `_billing/monthly/${month}.txt`;
}

function latestDigestKey(_storage) {
  return '_billing/latest.txt';
}

function formatUsd(value) {
  return `$${round(value, 8).toFixed(8)}`;
}

function parseIsoMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEntry(entry = {}) {
  const ts = entry.ts || nowIso();
  const tsStr = String(ts);
  const month = tsStr.slice(0, 7);   // YYYY-MM
  const day = tsStr.slice(0, 10);     // YYYY-MM-DD
  return {
    ts,
    month,
    day,
    provider: String(entry.provider || 'unknown'),
    model: String(entry.model || 'unknown'),
    category: String(entry.category || ''),
    productId: String(entry.productId || ''),
    runId: String(entry.runId || ''),
    round: safeInt(entry.round, 0),
    prompt_tokens: safeInt(entry.prompt_tokens, 0),
    completion_tokens: safeInt(entry.completion_tokens, 0),
    cached_prompt_tokens: safeInt(entry.cached_prompt_tokens, 0),
    total_tokens: safeInt(entry.total_tokens, 0),
    cost_usd: round(entry.cost_usd, 8),
    reason: String(entry.reason || 'extract'),
    host: String(entry.host || ''),
    url_count: safeInt(entry.url_count, 0),
    evidence_chars: safeInt(entry.evidence_chars, 0),
    estimated_usage: Boolean(entry.estimated_usage),
    meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {}
  };
}

function toDbEntry(normalized) {
  return {
    ts: normalized.ts,
    month: normalized.month,
    day: normalized.day,
    provider: normalized.provider,
    model: normalized.model,
    category: normalized.category,
    product_id: normalized.productId,
    run_id: normalized.runId,
    round: normalized.round,
    prompt_tokens: normalized.prompt_tokens,
    completion_tokens: normalized.completion_tokens,
    cached_prompt_tokens: normalized.cached_prompt_tokens,
    total_tokens: normalized.total_tokens,
    cost_usd: normalized.cost_usd,
    reason: normalized.reason,
    host: normalized.host,
    url_count: normalized.url_count,
    evidence_chars: normalized.evidence_chars,
    estimated_usage: normalized.estimated_usage ? 1 : 0,
    meta: JSON.stringify(normalized.meta || {})
  };
}

function parseLedgerText(text) {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      // ignore malformed ledger line
    }
  }
  return rows;
}

function emptyRollup(month) {
  return {
    month,
    generated_at: nowIso(),
    totals: {
      cost_usd: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      calls: 0
    },
    by_day: {},
    by_category: {},
    by_product: {},
    by_model: {},
    by_reason: {}
  };
}

function collectRunBuckets(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const runId = String(row.runId || '').trim();
    const day = dayFromTs(row.ts || nowIso());
    const productId = String(row.productId || '').trim();
    const key = runId || `${day}::${productId || 'unknown_product'}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        runId: runId || '(no_run_id)',
        day,
        firstTs: row.ts || nowIso(),
        lastTs: row.ts || nowIso(),
        productId: productId || '',
        category: String(row.category || ''),
        calls: 0,
        costUsd: 0,
        promptTokens: 0,
        completionTokens: 0,
        providers: new Set(),
        models: new Set(),
        reasons: new Set()
      });
    }

    const bucket = map.get(key);
    if (parseIsoMs(row.ts) < parseIsoMs(bucket.firstTs)) {
      bucket.firstTs = row.ts;
      bucket.day = dayFromTs(row.ts || nowIso());
    }
    if (parseIsoMs(row.ts) > parseIsoMs(bucket.lastTs)) {
      bucket.lastTs = row.ts;
    }
    if (!bucket.productId && row.productId) {
      bucket.productId = String(row.productId);
    }
    if (!bucket.category && row.category) {
      bucket.category = String(row.category);
    }

    bucket.calls += 1;
    bucket.costUsd = round(bucket.costUsd + safeNumber(row.cost_usd, 0), 8);
    bucket.promptTokens += safeInt(row.prompt_tokens, 0);
    bucket.completionTokens += safeInt(row.completion_tokens, 0);
    if (row.provider) {
      bucket.providers.add(String(row.provider));
    }
    if (row.model) {
      bucket.models.add(String(row.model));
    }
    if (row.reason) {
      bucket.reasons.add(String(row.reason));
    }
  }

  return [...map.values()]
    .sort((a, b) => parseIsoMs(b.firstTs) - parseIsoMs(a.firstTs))
    .map((row) => ({
      ...row,
      providers: [...row.providers].sort(),
      models: [...row.models].sort(),
      reasons: [...row.reasons].sort()
    }));
}

function pushModelDetails(lines, config = {}) {
  const details = [
    ['Provider', config.llmProvider || ''],
    ['Base URL', config.llmBaseUrl || config.openaiBaseUrl || ''],
  ];

  const pricing = [
    [
      'Pricing Default (1M input cache miss)',
      safeNumber(config.llmCostInputPer1M, 0) > 0 ? `$${safeNumber(config.llmCostInputPer1M, 0)}` : ''
    ],
    [
      'Pricing Default (1M input cache hit)',
      safeNumber(config.llmCostCachedInputPer1M, 0) > 0 ? `$${safeNumber(config.llmCostCachedInputPer1M, 0)}` : '$0'
    ],
    [
      'Pricing Default (1M output)',
      safeNumber(config.llmCostOutputPer1M, 0) > 0 ? `$${safeNumber(config.llmCostOutputPer1M, 0)}` : ''
    ],
  ];

  const rows = [...details, ...pricing].filter(([, value]) => String(value || '').trim() !== '');
  if (!rows.length) {
    return;
  }
  lines.push('Model Details');
  lines.push('-------------');
  for (const [label, value] of rows) {
    lines.push(`${label}: ${value}`);
  }
  lines.push('');
}

function buildBillingDigestText({
  month,
  rollup,
  rows,
  config = {}
}) {
  const runs = collectRunBuckets(rows);
  const lines = [];
  lines.push('Spec Harvester Billing Digest');
  lines.push('============================');
  lines.push(`Month: ${month}`);
  lines.push(`Generated At: ${rollup.generated_at || nowIso()}`);
  lines.push(`Total Cost USD: ${formatUsd(rollup.totals?.cost_usd || 0)}`);
  lines.push(`Total Calls: ${safeInt(rollup.totals?.calls, 0)}`);
  lines.push(`Prompt Tokens: ${safeInt(rollup.totals?.prompt_tokens, 0)}`);
  lines.push(`Completion Tokens: ${safeInt(rollup.totals?.completion_tokens, 0)}`);
  lines.push('');

  pushModelDetails(lines, config);

  lines.push('Run Totals (Newest First)');
  lines.push('-------------------------');
  if (!runs.length) {
    lines.push('No billable LLM calls recorded for this month.');
  } else {
    for (const run of runs) {
      lines.push(
        `${run.day} | run ${run.runId} | ${run.productId || 'unknown_product'} | cost ${formatUsd(run.costUsd)} | calls ${run.calls} | prompt ${run.promptTokens} | completion ${run.completionTokens} | models ${run.models.join(', ') || 'unknown'} | reasons ${run.reasons.join(', ') || 'unknown'}`
      );
    }
  }
  lines.push('');

  lines.push('Daily Totals');
  lines.push('------------');
  const dayRows = Object.entries(rollup.by_day || {})
    .sort((a, b) => b[0].localeCompare(a[0]));
  if (!dayRows.length) {
    lines.push('No daily totals yet.');
  } else {
    for (const [day, row] of dayRows) {
      lines.push(
        `${day} | cost ${formatUsd(row.cost_usd || 0)} | calls ${safeInt(row.calls, 0)} | prompt ${safeInt(row.prompt_tokens, 0)} | completion ${safeInt(row.completion_tokens, 0)}`
      );
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeBillingDigest({
  storage,
  month,
  rollup,
  rows,
  config = {}
}) {
  const text = buildBillingDigestText({
    month,
    rollup,
    rows,
    config
  });
  const digestKey = monthlyDigestKey(storage, month);
  const latestKey = latestDigestKey(storage);
  await storage.writeObject(
    digestKey,
    Buffer.from(text, 'utf8'),
    { contentType: 'text/plain; charset=utf-8' }
  );
  await storage.writeObject(
    latestKey,
    Buffer.from(text, 'utf8'),
    { contentType: 'text/plain; charset=utf-8' }
  );
  return { digestKey, latestDigestKey: latestKey };
}

export async function readMonthlyRollup({ storage, month, specDb = null }) {
  if (specDb) {
    try {
      const result = specDb.getBillingRollup(month);
      if (result) {
        return result;
      }
    } catch {
      // fall through to JSON path
    }
  }
  const key = monthlyRollupKey(storage, month);
  return (await storage.readJsonOrNull(key)) ||
    emptyRollup(month);
}

export async function readLedgerMonth({ storage, month, specDb = null }) {
  if (specDb) {
    try {
      const entries = specDb.getBillingEntriesForMonth(month);
      if (entries) {
        return entries;
      }
    } catch {
      // fall through to JSON path
    }
  }
  const key = ledgerKey(storage, month);
  const text = await storage.readTextOrNull(key);
  return parseLedgerText(text);
}

export async function appendCostLedgerEntry({
  storage,
  config,
  entry,
  specDb = null
}) {
  if (!storage || !config || !entry) {
    return { entry: null };
  }

  const normalized = normalizeEntry(entry);

  // WHY: SQL is the sole write target for billing entries.
  // Callers without specDb (e.g. CLI healthCheck) silently skip persistence.
  if (specDb) {
    try {
      specDb.insertBillingEntry(toDbEntry(normalized));
    } catch {
      // best-effort — billing must not crash the pipeline
    }
  }

  return { entry: normalized };
}

export async function readBillingSnapshot({
  storage,
  month = monthFromTs(nowIso()),
  productId = '',
  specDb = null
}) {
  if (specDb) {
    try {
      const result = specDb.getBillingSnapshot(month, productId);
      if (result) {
        return result;
      }
    } catch {
      // fall through to JSON path
    }
  }

  const monthly = await readMonthlyRollup({ storage, month, specDb });
  const product = monthly.by_product?.[productId] || {
    cost_usd: 0,
    calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0
  };

  return {
    month,
    monthly_cost_usd: round(monthly.totals.cost_usd || 0, 8),
    monthly_calls: safeInt(monthly.totals.calls, 0),
    product_cost_usd: round(product.cost_usd || 0, 8),
    product_calls: safeInt(product.calls, 0),
    monthly
  };
}

export async function buildBillingReport({
  storage,
  month = monthFromTs(nowIso()),
  config = {},
  specDb = null
}) {
  if (specDb) {
    try {
      const rollup = specDb.getBillingRollup(month);
      const rows = specDb.getBillingEntriesForMonth(month);
      if (rollup) {
        const digest = await writeBillingDigest({
          storage,
          month,
          rollup,
          rows: rows || [],
          config
        });
        return {
          month,
          totals: rollup.totals,
          by_day: rollup.by_day,
          by_category: rollup.by_category,
          by_product: rollup.by_product,
          by_model: rollup.by_model,
          by_reason: rollup.by_reason,
          digest_key: digest.digestKey,
          latest_digest_key: digest.latestDigestKey
        };
      }
    } catch {
      // fall through to JSON path
    }
  }

  const monthly = await readMonthlyRollup({ storage, month, specDb });
  const rows = await readLedgerMonth({ storage, month, specDb });
  const digest = await writeBillingDigest({
    storage,
    month,
    rollup: monthly,
    rows,
    config
  });
  return {
    month,
    totals: monthly.totals,
    by_day: monthly.by_day,
    by_category: monthly.by_category,
    by_product: monthly.by_product,
    by_model: monthly.by_model,
    by_reason: monthly.by_reason,
    digest_key: digest.digestKey,
    latest_digest_key: digest.latestDigestKey
  };
}

function parsePeriodDays(period, fallback = 30) {
  const token = normalizeToken(period);
  if (!token) return fallback;
  if (token === 'week' || token === 'weekly' || token === '7d') return 7;
  if (token === 'month' || token === 'monthly' || token === '30d') return 30;
  const match = token.match(/^(\d+)d$/);
  if (match) return Math.max(1, Number.parseInt(match[1], 10) || fallback);
  const asInt = Number.parseInt(token, 10);
  if (Number.isFinite(asInt) && asInt > 0) return asInt;
  return fallback;
}

function monthsInRange(cutoffMs) {
  const months = [];
  const now = new Date();
  const cutoff = new Date(cutoffMs);
  let year = cutoff.getFullYear();
  let month = cutoff.getMonth();
  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth())) {
    months.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return months;
}

export async function buildLlmMetrics({
  storage,
  config = {},
  period = 'week',
  model = '',
  category = '',
  runLimit = 120,
  specDb = null,
}) {
  const days = parsePeriodDays(period, 7);
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const normalizedCategory = normalizeToken(category);
  const months = monthsInRange(cutoff);

  const allRows = [];
  for (const month of months) {
    const monthRows = await readLedgerMonth({ storage, month, specDb });
    allRows.push(...monthRows);
  }

  const rows = allRows
    .filter((row) => parseIsoMs(row.ts) >= cutoff)
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
        provider, model: modelName, calls: 0, cost_usd: 0,
        prompt_tokens: 0, completion_tokens: 0, products: new Set()
      });
    }
    const bucket = byModelMap.get(key);
    if (!byProviderMap.has(provider)) {
      byProviderMap.set(provider, {
        provider, calls: 0, cost_usd: 0,
        prompt_tokens: 0, completion_tokens: 0, products: new Set()
      });
    }
    const providerBucket = byProviderMap.get(provider);
    if (!byRunMap.has(runKey)) {
      byRunMap.set(runKey, {
        session_id: runKey, run_id: rowRunId || null,
        is_session_fallback: !rowRunId,
        started_at: rowTs || null, last_call_at: rowTs || null,
        category: rowCategory || null, product_id: rowProductId || null,
        calls: 0, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0,
        providers: new Set(), models: new Set(), reasons: new Set(), products: new Set()
      });
    }
    const runBucket = byRunMap.get(runKey);
    const cost = safeNumber(row.cost_usd, 0);
    const prompt = safeInt(row.prompt_tokens, 0);
    const completion = safeInt(row.completion_tokens, 0);

    bucket.calls += 1;
    bucket.cost_usd += cost;
    bucket.prompt_tokens += prompt;
    bucket.completion_tokens += completion;
    if (rowProductId) { bucket.products.add(rowProductId); products.add(rowProductId); }
    providerBucket.calls += 1;
    providerBucket.cost_usd += cost;
    providerBucket.prompt_tokens += prompt;
    providerBucket.completion_tokens += completion;
    if (rowProductId) providerBucket.products.add(rowProductId);

    runBucket.calls += 1;
    runBucket.cost_usd += cost;
    runBucket.prompt_tokens += prompt;
    runBucket.completion_tokens += completion;
    if (rowTs) {
      const startedMs = parseIsoMs(runBucket.started_at);
      const lastMs = parseIsoMs(runBucket.last_call_at);
      const currentMs = parseIsoMs(rowTs);
      if (!startedMs || (currentMs && currentMs < startedMs)) runBucket.started_at = rowTs;
      if (!lastMs || (currentMs && currentMs > lastMs)) runBucket.last_call_at = rowTs;
    }
    if (!runBucket.product_id && rowProductId) runBucket.product_id = rowProductId;
    if (!runBucket.category && rowCategory) runBucket.category = rowCategory;
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
      provider: row.provider, model: row.model, calls: row.calls,
      cost_usd: round(row.cost_usd, 8),
      avg_cost_per_call: row.calls > 0 ? round(row.cost_usd / row.calls, 8) : 0,
      prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens,
      products: row.products.size
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd || a.model.localeCompare(b.model));
  const byProvider = [...byProviderMap.values()]
    .map((row) => ({
      provider: row.provider, calls: row.calls,
      cost_usd: round(row.cost_usd, 8),
      avg_cost_per_call: row.calls > 0 ? round(row.cost_usd / row.calls, 8) : 0,
      prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens,
      products: row.products.size
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd || a.provider.localeCompare(b.provider));
  const byRun = [...byRunMap.values()]
    .map((row) => {
      const startedMs = parseIsoMs(row.started_at);
      const lastMs = parseIsoMs(row.last_call_at);
      const spanSeconds = startedMs && lastMs && lastMs >= startedMs
        ? Math.floor((lastMs - startedMs) / 1000) : 0;
      return {
        session_id: row.session_id, run_id: row.run_id,
        is_session_fallback: row.is_session_fallback,
        started_at: row.started_at, last_call_at: row.last_call_at,
        span_seconds: spanSeconds, category: row.category,
        product_id: row.product_id, calls: row.calls,
        cost_usd: round(row.cost_usd, 8),
        avg_cost_per_call: row.calls > 0 ? round(row.cost_usd / row.calls, 8) : 0,
        prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens,
        providers: [...row.providers].sort(), models: [...row.models].sort(),
        reasons: [...row.reasons].sort(), unique_products: row.products.size
      };
    })
    .sort((a, b) => parseIsoMs(b.last_call_at) - parseIsoMs(a.last_call_at))
    .slice(0, Math.max(10, safeInt(runLimit, 120)));

  return {
    period_days: days, period: normalizeToken(period),
    category: category || null, model_filter: model || null,
    generated_at: nowIso(),
    total_calls: totalCalls, total_cost_usd: round(totalCost, 8),
    total_prompt_tokens: promptTokens, total_completion_tokens: completionTokens,
    unique_products: products.size,
    avg_cost_per_product: products.size > 0 ? round(totalCost / products.size, 8) : 0,
    by_provider: byProvider, by_model: byModel, by_run: byRun,
  };
}
