#!/usr/bin/env node
/**
 * crawl-probe — Standalone fetch harness for testing the Crawlee pipeline.
 *
 * Two modes:
 *   1. Direct URL mode:  Pass URLs directly to crawl.
 *   2. Product mode:     Pass --product "Name" to run real Serper searches
 *                        (tier 1-3 style queries), dedupe the results, and
 *                        feed them to the crawl session — just like a live run
 *                        but without the full pipeline overhead.
 *
 * Usage:
 *   # Direct URLs
 *   node tools/crawl-probe.mjs https://lamzu.com/products/lamzu-maya-x
 *   node tools/crawl-probe.mjs --file urls.txt
 *
 *   # Product search → crawl (uses SERPER_API_KEY from .env)
 *   node tools/crawl-probe.mjs --product "Lamzu Maya X" --category mouse
 *   node tools/crawl-probe.mjs --product "Razer Viper V3 Pro" --max-urls 20 --verbose
 *
 * Options:
 *   --product <name>     Product name → run Serper searches, then crawl results
 *   --category <cat>     Category hint for query templates (default: mouse)
 *   --max-urls <n>       Max URLs to crawl from search results (default: 15)
 *   --search-only        Run searches and print URLs, don't crawl
 *   --slots <n>          Concurrent browser slots (default: 2)
 *   --timeout <s>        Handler timeout in seconds (default: 45)
 *   --nav-timeout <s>    Navigation timeout in seconds (default: 20)
 *   --retries <n>        Max retries per URL (default: 1)
 *   --headless <bool>    Run headless (default: true)
 *   --screenshot         Enable screenshot extraction (default: off)
 *   --scroll <n>         Auto-scroll passes (default: 0 = disabled)
 *   --dismiss-rounds <n> Dismiss suite rounds (default: 2)
 *   --suite-mode <mode>  'concurrent' or 'sequential' (default: concurrent)
 *   --file <path>        Read URLs from file (one per line)
 *   --verbose            Show all plugin/extraction events
 *   --json               Output results as JSON
 */

import { createCrawlSession } from '../src/features/crawl/crawlSession.js';
import { resolveAllPlugins } from '../src/features/crawl/plugins/pluginRegistry.js';
import { resolveAllExtractionPlugins, createExtractionRunner } from '../src/features/extraction/index.js';
import { searchSerper } from '../src/features/indexing/pipeline/searchExecution/searchSerper.js';
import { writeReports } from './crawl-probe-report.mjs';
import { loadConfigWithUserSettings, loadDotEnvFile } from '../src/config.js';
import fs from 'node:fs';
import path from 'node:path';

// WHY: Load .env for non-secret vars, then load config with SQL-backed settings.
// API keys come from SQL/GUI, not .env.
loadDotEnvFile();
const _probeConfig = loadConfigWithUserSettings({});

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    urls: [],
    product: '',
    category: 'mouse',
    maxUrls: 15,
    searchOnly: false,
    slots: 2,
    timeout: 45,
    navTimeout: 20,
    retries: 1,
    headless: true,
    screenshot: false,
    scroll: 0,
    scrollOverridden: false,
    dismissRounds: 2,
    suiteMode: 'concurrent',
    verbose: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--product') { opts.product = args[++i] || ''; continue; }
    if (arg === '--category') { opts.category = args[++i] || 'mouse'; continue; }
    if (arg === '--max-urls') { opts.maxUrls = Number(args[++i]) || 15; continue; }
    if (arg === '--search-only') { opts.searchOnly = true; continue; }
    if (arg === '--slots') { opts.slots = Number(args[++i]) || 2; continue; }
    if (arg === '--timeout') { opts.timeout = Number(args[++i]) || 45; continue; }
    if (arg === '--nav-timeout') { opts.navTimeout = Number(args[++i]) || 20; continue; }
    if (arg === '--retries') { opts.retries = Number(args[++i]) ?? 1; continue; }
    if (arg === '--headless') { opts.headless = args[++i] !== 'false'; continue; }
    if (arg === '--screenshot') { opts.screenshot = true; continue; }
    if (arg === '--scroll') { opts.scroll = Number(args[++i]) || 0; opts.scrollOverridden = true; continue; }
    if (arg === '--dismiss-rounds') { opts.dismissRounds = Number(args[++i]) || 2; continue; }
    if (arg === '--suite-mode') { opts.suiteMode = args[++i] || 'concurrent'; continue; }
    if (arg === '--verbose') { opts.verbose = true; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--file') {
      const filePath = args[++i];
      const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
      const fileUrls = content.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      opts.urls.push(...fileUrls);
      continue;
    }
    if (arg.startsWith('http://') || arg.startsWith('https://')) {
      opts.urls.push(arg);
      continue;
    }
    if (!arg.startsWith('-')) {
      opts.urls.push(arg);
    }
  }

  return opts;
}

// ── Serper search (tier-style queries) ───────────────────────────────────────

// WHY: Mirrors the real pipeline's tier 1-3 query strategy without importing
// the full queryBuilder (which needs NeedSet state, brand resolution, etc.).
// Generates the same style of queries a real run would produce.
function buildProbeQueries(product, category) {
  const queries = [];

  // Tier 1: Seed queries — broad discovery
  queries.push({ tier: 1, label: 'spec_seed', query: `${product} specifications` });
  queries.push({ tier: 1, label: 'spec_seed', query: `${product} specs` });
  queries.push({ tier: 1, label: 'review_seed', query: `${product} review` });

  // Tier 1: Source seeds — known high-value domains
  const sourceDomains = ['rtings.com', 'amazon.com', 'reddit.com'];
  for (const domain of sourceDomains) {
    queries.push({ tier: 1, label: 'source_seed', query: `${product} ${domain}` });
  }

  // Tier 2: Group queries — field group discovery
  const groups = {
    mouse: [
      { label: 'sensor', query: `${product} sensor DPI polling rate` },
      { label: 'weight_shape', query: `${product} weight dimensions shape` },
      { label: 'connectivity', query: `${product} wireless battery USB` },
      { label: 'switches', query: `${product} switches buttons click latency` },
    ],
    keyboard: [
      { label: 'switches', query: `${product} switches actuation force type` },
      { label: 'connectivity', query: `${product} wireless bluetooth USB-C` },
      { label: 'features', query: `${product} RGB hot-swap features` },
    ],
  };
  for (const g of (groups[category] || groups.mouse)) {
    queries.push({ tier: 2, label: g.label, query: g.query });
  }

  // Tier 3: Key queries — specific fields
  const keyFields = {
    mouse: ['weight', 'sensor', 'DPI', 'polling rate', 'battery life', 'price'],
    keyboard: ['switch type', 'actuation force', 'layout', 'keycaps', 'price'],
  };
  for (const field of (keyFields[category] || keyFields.mouse)) {
    queries.push({ tier: 3, label: field, query: `${product} ${field}` });
  }

  return queries;
}

async function runSerperSearch(queries, { verbose, maxUrls }) {
  const apiKey = _probeConfig.serperApiKey || process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.error('  ERROR: SERPER_API_KEY not set (configure via GUI or .env)');
    process.exit(1);
  }

  const seen = new Map(); // url → { tier, query, title, snippet }
  let creditsUsed = 0;

  for (const q of queries) {
    if (verbose) {
      console.log(`  [search] T${q.tier} ${q.label}: "${q.query}"`);
    }

    const { results } = await searchSerper({
      query: q.query,
      apiKey,
      limit: 10,
      minQueryIntervalMs: 200,
    });
    creditsUsed++;

    for (const r of results) {
      if (!r.url) continue;
      // WHY: Skip video URLs — can't extract specs from YouTube.
      if (r.url.includes('youtube.com') || r.url.includes('youtu.be')) continue;

      const existing = seen.get(r.url);
      if (existing) {
        existing.hits++;
        if (q.tier < existing.tier) existing.tier = q.tier;
      } else {
        seen.set(r.url, {
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          tier: q.tier,
          query: q.query,
          label: q.label,
          hits: 1,
        });
      }
    }
  }

  // WHY: Sort by hits (multi-hit = higher confidence), then tier (lower = broader discovery).
  const ranked = [...seen.values()].sort((a, b) => {
    if (b.hits !== a.hits) return b.hits - a.hits;
    return a.tier - b.tier;
  });

  const selected = ranked.slice(0, maxUrls);

  console.log(`\n  Serper: ${creditsUsed} queries, ${seen.size} unique URLs, selected ${selected.length}`);
  console.log('  ─────────────────────────────────────────────────────────');
  for (const r of selected) {
    const host = new URL(r.url).hostname.replace('www.', '');
    const hitBadge = r.hits > 1 ? ` (${r.hits}x)` : '';
    console.log(`  T${r.tier} ${host}${hitBadge}  ${r.url}`);
  }
  console.log('');

  return selected.map((r) => r.url);
}

// ── Logger ───────────────────────────────────────────────────────────────────

function createProbeLogger(verbose) {
  const events = [];
  const startMs = Date.now();

  function ts() { return `+${((Date.now() - startMs) / 1000).toFixed(1)}s`; }

  return {
    events,
    info(event, payload) {
      events.push({ event, payload, ts: Date.now() });
      if (verbose) {
        console.log(`  [${ts()}] ${event}`, summarizePayload(payload));
      } else if (event === 'source_fetch_started') {
        console.log(`  [${ts()}] FETCH ${payload.worker_id} ${payload.url}`);
      } else if (event === 'source_processed') {
        console.log(`  [${ts()}] OK    ${payload.worker_id} ${payload.url} (${payload.status})`);
      } else if (event === 'source_fetch_failed') {
        const rescued = payload.timeout_rescued ? ' [RESCUED]' : '';
        console.log(`  [${ts()}] FAIL  ${payload.worker_id} ${payload.url} — ${payload.message}${rescued}`);
      } else if (event === 'source_fetch_retrying') {
        console.log(`  [${ts()}] RETRY ${payload.worker_id} attempt ${payload.retry_count} — ${payload.error}`);
      } else if (event === 'extraction_plugin_completed') {
        console.log(`  [${ts()}] EXTRACT ${payload.plugin} → ${JSON.stringify(payload.result)}`);
      } else if (event === 'plugin_hook_completed' && verbose) {
        console.log(`  [${ts()}] PLUGIN ${payload.plugin}.${payload.hook}`);
      }
    },
    warn(event, payload) {
      events.push({ event, payload, ts: Date.now() });
      console.log(`  [${ts()}] WARN ${event}: ${payload?.error || payload?.message || ''}`);
    },
    error(event, payload) {
      events.push({ event, payload, ts: Date.now() });
      console.log(`  [${ts()}] ERROR ${event}: ${payload?.reason || payload?.error || ''}`);
    },
  };
}

function summarizePayload(p) {
  if (!p || typeof p !== 'object') return '';
  const keys = Object.keys(p);
  if (keys.length <= 4) return JSON.stringify(p);
  const short = {};
  for (const k of keys.slice(0, 4)) short[k] = p[k];
  return JSON.stringify(short) + ` (+${keys.length - 4} more)`;
}

// ── Result formatting ────────────────────────────────────────────────────────

function formatResult(result, index) {
  const status = result.blocked ? `BLOCKED (${result.blockReason})` :
    result.success ? `OK ${result.status}` :
      result.fetchError ? `ERROR: ${result.fetchError}` :
        `FAIL ${result.status}`;

  const htmlLen = result.html?.length || 0;
  const shots = result.screenshots?.length || 0;
  const extractions = Object.keys(result.extractions || {});

  const lines = [
    `── ${result.workerId || `url-${index + 1}`} ──────────────────────────────`,
    `  URL:         ${result.url}`,
    `  Final URL:   ${result.finalUrl}`,
    `  Status:      ${status}`,
    `  HTML:        ${htmlLen > 0 ? `${(htmlLen / 1024).toFixed(1)}KB` : '(empty)'}`,
    `  Title:       ${result.title || '(none)'}`,
  ];

  if (shots > 0) lines.push(`  Screenshots: ${shots}`);
  if (extractions.length > 0) lines.push(`  Extractions: ${extractions.join(', ')}`);
  if (result.timeoutRescued) lines.push(`  Rescued:     YES (handler timed out but HTML was captured)`);
  if (result.blocked) lines.push(`  Block:       ${result.blockReason}`);
  if (result.fetchError) lines.push(`  Error:       ${result.fetchError}`);

  return lines.join('\n');
}

function printSummary(results, events, startMs) {
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  const ok = results.filter((r) => r.success).length;
  const blocked = results.filter((r) => r.blocked).length;
  const failed = results.filter((r) => !r.success && !r.blocked).length;
  const rescued = results.filter((r) => r.timeoutRescued).length;
  const htmlTotal = results.reduce((sum, r) => sum + (r.html?.length || 0), 0);
  const shotTotal = results.reduce((sum, r) => sum + (r.screenshots?.length || 0), 0);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  PROBE SUMMARY — ${results.length} URLs in ${elapsed}s`);
  console.log(`  OK: ${ok}  BLOCKED: ${blocked}  FAILED: ${failed}  RESCUED: ${rescued}`);
  console.log(`  HTML captured: ${(htmlTotal / 1024).toFixed(0)}KB total`);
  if (shotTotal > 0) console.log(`  Screenshots: ${shotTotal}`);
  console.log('══════════════════════════════════════════════════════════════');
}

// ── Main ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log('crawl-probe — Test the Crawlee fetch pipeline directly.\n');
  console.log('Usage:');
  console.log('  node tools/crawl-probe.mjs <url> [url2] [...]');
  console.log('  node tools/crawl-probe.mjs --product "Lamzu Maya X" --category mouse\n');
  console.log('Product search options:');
  console.log('  --product <name>     Search for product, then crawl results');
  console.log('  --category <cat>     mouse|keyboard (default: mouse)');
  console.log('  --max-urls <n>       Max URLs from search to crawl (default: 15)');
  console.log('  --search-only        Print search URLs without crawling\n');
  console.log('Crawl options:');
  console.log('  --slots <n>          Concurrent slots (default: 2)');
  console.log('  --timeout <s>        Handler timeout secs (default: 45)');
  console.log('  --nav-timeout <s>    Navigation timeout secs (default: 20)');
  console.log('  --retries <n>        Max retries (default: 1)');
  console.log('  --headless <bool>    Headless mode (default: true)');
  console.log('  --screenshot         Enable screenshot capture');
  console.log('  --scroll <n>         Auto-scroll passes (default: 0)');
  console.log('  --dismiss-rounds <n> Dismiss rounds (default: 2)');
  console.log('  --suite-mode <mode>  concurrent|sequential (default: concurrent)');
  console.log('  --file <path>        Read URLs from file');
  console.log('  --verbose            Show all events');
  console.log('  --json               Output JSON results');
}

async function main() {
  const opts = parseArgs(process.argv);

  // ── Product search mode ──
  if (opts.product) {
    console.log(`\ncrawl-probe: searching for "${opts.product}" (${opts.category})\n`);

    const queries = buildProbeQueries(opts.product, opts.category);
    console.log(`  ${queries.length} queries (T1: ${queries.filter((q) => q.tier === 1).length}, T2: ${queries.filter((q) => q.tier === 2).length}, T3: ${queries.filter((q) => q.tier === 3).length})`);

    const searchUrls = await runSerperSearch(queries, { verbose: opts.verbose, maxUrls: opts.maxUrls });

    if (opts.searchOnly) {
      console.log('\n--search-only: skipping crawl.\n');
      if (opts.json) {
        fs.writeFileSync('crawl-probe-search.json', JSON.stringify(searchUrls, null, 2));
        console.log('URLs written to crawl-probe-search.json');
      }
      return;
    }

    opts.urls.push(...searchUrls);
  }

  if (opts.urls.length === 0) {
    printHelp();
    process.exit(0);
  }

  // ── Shared settings ──
  console.log(`crawl-probe: ${opts.urls.length} URL(s), ${opts.slots} slot(s), ${opts.timeout}s timeout, headless=${opts.headless}\n`);

  const baseSettings = {
    crawlMaxConcurrentSlots: opts.slots,
    crawleeRequestHandlerTimeoutSecs: opts.timeout,
    crawleeNavigationTimeoutSecs: opts.navTimeout,
    crawleeMaxRequestRetries: opts.retries,
    crawleeHeadless: opts.headless,
    crawleeUseSessionPool: true,
    crawleeUseFingerprints: true,
    crawleePersistCookiesPerSession: true,
  };

  const orderedSources = opts.urls.map((url) => ({ url }));

  // ── Helper: run one crawl pass ──
  async function runPass({ label, prefix, settings, plugins, extractionRunner }) {
    const logger = createProbeLogger(opts.verbose);
    const startMs = Date.now();

    const workerIdMap = new Map();
    opts.urls.forEach((url, i) => { workerIdMap.set(url, `${prefix}-${i + 1}`); });

    const session = createCrawlSession({ settings, plugins, extractionRunner, logger });
    await session.start();
    console.log(`  [${label}] Browser launched. Fetching...\n`);

    try {
      const { crawlResults } = await session.runFetchPlan({
        orderedSources, workerIdMap, logger, startMs,
      });

      console.log('');
      for (let i = 0; i < crawlResults.length; i++) {
        console.log(`  [${label}] ${formatResult(crawlResults[i], i).replace(/\n/g, `\n  [${label}] `)}`);
      }

      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      const ok = crawlResults.filter((r) => r.success).length;
      const failed = crawlResults.filter((r) => !r.success).length;
      console.log(`\n  [${label}] ${ok} OK, ${failed} failed in ${elapsed}s\n`);

      return { crawlResults, events: logger.events, startMs };
    } finally {
      await session.shutdown();
    }
  }

  // ── PASS 1: Baseline Crawlee (no plugins, no extraction) ──
  console.log('══ PASS 1: Baseline Crawlee (no plugins, no hooks) ══════════\n');
  const baselineResult = await runPass({
    label: 'BASELINE',
    prefix: 'base',
    settings: {
      ...baseSettings,
      // WHY: Disable every plugin and extraction so this tests raw Crawlee only.
      cookieConsentEnabled: false,
      overlayDismissalEnabled: false,
      domExpansionEnabled: false,
      cssOverrideEnabled: false,
      stealthEnabled: false,
      autoScrollEnabled: false,
      capturePageScreenshotEnabled: false,
      fetchDismissRounds: 0,
    },
    plugins: [],           // No fetch plugins at all
    extractionRunner: null, // No extraction
  });

  // ── PASS 2: Full suite (all plugins + extraction) ──
  // WHY: Purge Crawlee's default storage between passes so the suite pass
  // doesn't inherit stale request queue files from the baseline pass.
  try {
    const crawlee = await import('crawlee');
    await crawlee.purgeDefaultStorages();
  } catch { /* pre-v3.8 fallback — ignore */ }

  console.log('══ PASS 2: Full Suite (plugins + extraction) ════════════════\n');
  const suiteResult = await runPass({
    label: 'SUITE',
    prefix: 'suite',
    // WHY: Suite pass mirrors real pipeline defaults from settingsRegistry.
    // Only override if the user explicitly passed --scroll or --screenshot.
    settings: {
      ...baseSettings,
      fetchDismissRounds: opts.dismissRounds,
      fetchSuiteMode: opts.suiteMode,
      // Auto scroll: use registry defaults (enabled, 2 passes) unless user overrode via --scroll
      autoScrollEnabled: opts.scrollOverridden ? opts.scroll > 0 : true,
      autoScrollPasses: opts.scrollOverridden ? opts.scroll : 2,
      autoScrollDelayMs: 0,
      autoScrollPostLoadWaitMs: 0,
      autoScrollStrategy: 'incremental',
      capturePageScreenshotEnabled: opts.screenshot,
      cookieConsentEnabled: true,
      overlayDismissalEnabled: true,
      domExpansionEnabled: true,
      cssOverrideEnabled: false,
    },
    plugins: resolveAllPlugins(),
    extractionRunner: createExtractionRunner({
      plugins: resolveAllExtractionPlugins(),
    }),
  });

  // ── Comparison summary ──
  console.log('══ COMPARISON ══════════════════════════════════════════════\n');
  for (let i = 0; i < opts.urls.length; i++) {
    const url = opts.urls[i];
    const host = safeHost(url);
    const br = baselineResult.crawlResults[i] || {};
    const sr = suiteResult.crawlResults[i] || {};
    const bStatus = br.success ? `OK ${br.status}` : br.fetchError ? 'FAIL' : `${br.status || 0}`;
    const sStatus = sr.success ? `OK ${sr.status}` : sr.fetchError ? 'FAIL' : `${sr.status || 0}`;
    const bHtml = br.html ? `${(br.html.length / 1024).toFixed(0)}KB` : '0KB';
    const sHtml = sr.html ? `${(sr.html.length / 1024).toFixed(0)}KB` : '0KB';

    const broke = br.success && !sr.success;
    const marker = broke ? ' *** SUITE BROKE THIS ***' : '';

    console.log(`  ${host}`);
    console.log(`    Baseline: ${bStatus}  HTML: ${bHtml}`);
    console.log(`    Suite:    ${sStatus}  HTML: ${sHtml}${marker}`);
    if (sr.fetchError) console.log(`    Error:    ${sr.fetchError}`);
    console.log('');
  }

  // ── Generate comparison reports ──
  const runTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportDir = path.join(process.cwd(), '.workspace', 'crawl-probe-reports');
  const { dir, files } = writeReports({
    baselineEvents: baselineResult.events,
    baselineResults: baselineResult.crawlResults,
    suiteEvents: suiteResult.events,
    suiteResults: suiteResult.crawlResults,
    urls: opts.urls,
    probeOpts: opts,
    outputDir: reportDir,
    runTs,
  });
  console.log(`  Reports written to ${dir}/`);
  console.log(`  Dashboard: ${path.join(dir, 'CRAWL-PROBE-DASHBOARD.html')}`);
  console.log(`  Per-URL:   ${files.filter((f) => f !== 'CRAWL-PROBE-DASHBOARD.html').length} comparison charts`);

  if (opts.json) {
    const jsonPath = path.join(reportDir, 'crawl-probe-results.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      baseline: baselineResult.crawlResults.map(summarizeResult),
      suite: suiteResult.crawlResults.map(summarizeResult),
    }, null, 2));
    console.log(`  JSON:      ${jsonPath}`);
  }

  function safeHost(u) { try { return new URL(u).hostname.replace('www.', ''); } catch { return u; } }
  function summarizeResult(r) {
    return { url: r.url, finalUrl: r.finalUrl, status: r.status, success: r.success, blocked: r.blocked, blockReason: r.blockReason || null, htmlBytes: r.html?.length || 0, title: r.title || '', fetchError: r.fetchError || null, timeoutRescued: r.timeoutRescued || false, workerId: r.workerId };
  }
}

main().catch((err) => {
  console.error('\ncrawl-probe fatal:', err.message);
  process.exit(1);
});
