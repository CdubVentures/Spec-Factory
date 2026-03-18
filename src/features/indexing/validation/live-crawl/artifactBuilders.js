// WHY: Builders for the 4 recommended artifacts from TESTING-LIVE-CRAWL-VALIDATION-MEGA-V2.
// effective_settings_snapshot, fetch_decision_ledger, screenshot_manifest, runtime_vs_final_diff.

const UNKNOWN_VALUE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined']);

// ── Effective Settings Snapshot ──────────────────────────────

export const REQUIRED_SETTINGS_KEYS = Object.freeze([
  'searchEngines',
  'discoveryEnabled',
  'preferHttpFetcher',
  'dynamicCrawleeEnabled',
  'fetchSchedulerEnabled',
  'fetchSchedulerMaxRetries',
  'perHostMinDelayMs',
  'pageGotoTimeoutMs',
  'postLoadWaitMs',
  'structuredMetadataExtructEnabled',
  'pdfBackendRouterEnabled',
  'scannedPdfOcrEnabled',
  'capturePageScreenshotEnabled',
  'maxUrlsPerProduct',
  'maxRunSeconds'
]);

export function buildEffectiveSettingsSnapshot(config) {
  const snap = { ts: new Date().toISOString() };
  for (const key of REQUIRED_SETTINGS_KEYS) {
    snap[key] = config[key] ?? null;
  }
  return snap;
}

// ── Fetch Decision Ledger ───────────────────────────────────

export const FETCH_STRATEGIES = Object.freeze([
  'http_static', 'crawlee_dynamic', 'retry_dynamic', 'pdf_direct', 'abandoned', 'unknown'
]);

export function buildFetchDecisionEntry(record) {
  return {
    url: record.url ?? null,
    host: record.host ?? null,
    selected_strategy: FETCH_STRATEGIES.includes(record.selected_strategy)
      ? record.selected_strategy
      : 'unknown',
    reason: record.reason ?? null,
    js_signal_detected: Boolean(record.js_signal_detected),
    attempt_count: Number(record.attempt_count) || 0,
    final_status: record.final_status ?? null,
    content_type: record.content_type ?? null,
    bytes: Number(record.bytes) || 0,
    parse_methods_emitted: Array.isArray(record.parse_methods_emitted)
      ? record.parse_methods_emitted
      : [],
    screenshots_captured: Number(record.screenshots_captured) || 0,
    ts: new Date().toISOString()
  };
}

// ── Screenshot Manifest ─────────────────────────────────────

export const SCREENSHOT_MANIFEST_KEYS = Object.freeze([
  'frame_id', 'run_id', 'worker_id', 'url', 'captured_at',
  'width', 'height', 'mode', 'retained', 'asset_path', 'content_hash'
]);

export function buildScreenshotManifestEntry(record) {
  return {
    frame_id: record.frame_id ?? null,
    run_id: record.run_id ?? null,
    worker_id: record.worker_id ?? null,
    url: record.url ?? null,
    captured_at: record.captured_at ?? null,
    width: Number(record.width) || 0,
    height: Number(record.height) || 0,
    mode: record.mode ?? null,
    retained: Boolean(record.retained),
    asset_path: record.asset_path ?? null,
    content_hash: record.content_hash ?? null
  };
}

export function buildScreenshotManifestFromEvents(events, runId) {
  const seen = new Set();
  const manifest = [];
  for (const ev of events) {
    const p = ev.payload || ev;
    const uri = p.screenshot_uri;
    if (!uri) continue;
    if (seen.has(uri)) continue;
    seen.add(uri);
    manifest.push(buildScreenshotManifestEntry({
      frame_id: `ss-${manifest.length}`,
      run_id: runId ?? null,
      worker_id: p.worker_id ?? null,
      url: p.url ?? null,
      captured_at: p.ts ?? ev.ts ?? null,
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
      mode: p.mode ?? 'page_capture',
      retained: false,
      asset_path: uri,
      content_hash: p.content_hash ?? null,
    }));
  }
  return manifest;
}

// ── Runtime vs Final Diff ───────────────────────────────────

function isKnownValue(v) {
  if (v === null || v === undefined) return false;
  return !UNKNOWN_VALUE_TOKENS.has(String(v).trim().toLowerCase());
}

export function buildRuntimeVsFinalDiff(runtimeFields, finalSpec) {
  const runtime = runtimeFields || {};
  const spec = finalSpec || {};

  const runtimeFilledKeys = Object.keys(runtime).filter((k) => {
    const v = runtime[k];
    const val = typeof v === 'object' && v !== null ? v.value : v;
    return isKnownValue(val);
  });

  const finalFilledKeys = Object.keys(spec).filter((k) => {
    if (k === 'publishable' || k === 'identity_outcome') return false;
    return isKnownValue(spec[k]);
  });

  const runtimeSet = new Set(runtimeFilledKeys);
  const finalSet = new Set(finalFilledKeys);

  const dropped = runtimeFilledKeys.filter((k) => !finalSet.has(k));
  const added = finalFilledKeys.filter((k) => !runtimeSet.has(k));

  const mismatched = [];
  for (const k of runtimeFilledKeys) {
    if (!finalSet.has(k)) continue;
    const rv = typeof runtime[k] === 'object' && runtime[k] !== null
      ? runtime[k].value
      : runtime[k];
    if (String(rv) !== String(spec[k])) {
      mismatched.push({ field: k, runtime_value: rv, final_value: spec[k] });
    }
  }

  const commonCount = runtimeFilledKeys.filter((k) => finalSet.has(k)).length;
  const agreementRate = commonCount === 0 ? 1 : (commonCount - mismatched.length) / commonCount;

  return {
    ts: new Date().toISOString(),
    runtime_filled_count: runtimeFilledKeys.length,
    final_filled_count: finalFilledKeys.length,
    dropped_count: dropped.length,
    dropped_fields: dropped,
    added_count: added.length,
    added_fields: added,
    mismatch_count: mismatched.length,
    mismatched_fields: mismatched,
    agreement_rate: Math.round(agreementRate * 1000) / 1000
  };
}
