/**
 * crawl-probe-report — Generates comparison HTML reports.
 *
 * Per-URL: Two waterfall charts side-by-side — baseline (raw Crawlee) vs full suite.
 * Dashboard: All URLs as cards showing baseline vs suite status, timing, errors.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Phase colors ─────────────────────────────────────────────────────────────

const PHASE = {
  navigation:   { color: '#4A90D9', label: 'Navigation' },
  plugin_init:  { color: '#7B68EE', label: 'Plugin init' },
  dismiss:      { color: '#9B59B6', label: 'Dismiss suite' },
  scroll:       { color: '#3498DB', label: 'Auto scroll' },
  extraction:   { color: '#E67E22', label: 'Extraction' },
  screenshot:   { color: '#E91E63', label: 'Screenshot' },
  persist:      { color: '#795548', label: 'Persist' },
  complete:     { color: '#27AE60', label: 'Complete' },
  error:        { color: '#F85149', label: 'Error' },
  retry:        { color: '#FF9800', label: 'Retry' },
  warn:         { color: '#FFC107', label: 'Warning' },
};

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function safeHost(u) { try { return new URL(u).hostname.replace('www.', ''); } catch { return u; } }

// WHY: Extract what each plugin actually suppressed from its result payload.
// Each plugin returns telemetry about what it did — overlays removed, cookies
// dismissed, sections expanded, scroll passes completed. This makes that
// visible in the Gantt chart so you can see the suite is actually working.
function buildSuppressedSummary(plugin, result) {
  if (!result || typeof result !== 'object') return '';
  const items = [];

  if (plugin === 'cookieConsent') {
    if (result.autoconsentMatched) items.push('CMP detected');
    if (result.fallbackClicked > 0) items.push(`${result.fallbackClicked} banner btn clicked`);
    if (!result.autoconsentMatched && result.fallbackClicked === 0) return '';
  } else if (plugin === 'overlayDismissal') {
    if (result.overlaysDetected > 0) items.push(`${result.overlaysDetected} overlay${result.overlaysDetected > 1 ? 's' : ''} found`);
    if (result.closeClicked > 0) items.push(`${result.closeClicked} close-clicked`);
    if (result.domRemoved > 0) items.push(`${result.domRemoved} DOM-removed`);
    if (result.scrollLockReset) items.push('scroll-lock reset');
    if (result.observerCaught > 0) items.push(`${result.observerCaught} observer-caught`);
    if (items.length === 0) return '';
  } else if (plugin === 'domExpansion') {
    if (result.clicked > 0) items.push(`${result.clicked} expanded`);
    if (result.expanded > 0) items.push(`${result.expanded} aria-expanded`);
    if (result.contentDelta > 0) items.push(`+${(result.contentDelta / 1024).toFixed(1)}KB content`);
    if (items.length === 0) return '';
  } else if (plugin === 'autoScroll') {
    if (result.enabled && result.passes > 0) items.push(`${result.passes} passes (${result.strategy})`);
    if (!result.enabled) return '';
  } else if (plugin === 'cssOverride') {
    if (result.hiddenBefore > 0) items.push(`${result.hiddenBefore} hidden revealed`);
    if (result.fixedRemoved) items.push('fixed/sticky hidden');
    if (result.domainBlockingEnabled) items.push('domain blocking active');
    if (items.length === 0) return '';
  } else if (plugin === 'stealth') {
    if (result.enabled) items.push(`${result.patches?.length || 0} patches`);
    if (!result.enabled) return '';
  }

  return items.join(', ');
}

function shortObj(r) {
  if (!r || typeof r !== 'object') return '';
  return Object.entries(r).filter(([, v]) => v === true || (typeof v === 'number' && v > 0) || (typeof v === 'string' && v)).slice(0, 5).map(([k, v]) => v === true ? k : `${k}=${v}`).join(', ');
}

// ── Build timelines ──────────────────────────────────────────────────────────

function buildUrlTimelines(events) {
  const byWorker = {};
  for (const evt of events) {
    const wid = evt.payload?.worker_id || '';
    if (!wid) continue;
    (byWorker[wid] ??= []).push(evt);
  }

  const timelines = {};
  for (const [workerId, wEvents] of Object.entries(byWorker)) {
    const url = wEvents.find((e) => e.payload?.url)?.payload?.url || '';
    const firstTs = Math.min(...wEvents.map((e) => e.ts));
    const lastTs = Math.max(...wEvents.map((e) => e.ts));
    const rows = [];
    let prevTs = firstTs;

    for (const evt of wEvents) {
      const offsetMs = evt.ts - firstTs;
      const durationMs = evt.ts - prevTs;
      const r = { event: evt.event, offsetMs, durationMs, label: '', phase: 'navigation', isError: false, detail: '', suppressed: '' };

      switch (evt.event) {
        case 'source_fetch_started':
          r.label = 'Fetch started'; r.phase = 'navigation'; r.detail = `retry=${evt.payload.retry_count || 0}`; break;
        case 'plugin_hook_completed':
          r.label = `${evt.payload.plugin}.${evt.payload.hook}`;
          r.phase = evt.payload.hook === 'onInit' ? 'plugin_init' : evt.payload.hook === 'onDismiss' ? 'dismiss' : evt.payload.hook === 'onScroll' ? 'scroll' : evt.payload.hook === 'onCapture' ? 'extraction' : 'dismiss';
          r.detail = shortObj(evt.payload.result);
          r.suppressed = buildSuppressedSummary(evt.payload.plugin, evt.payload.result);
          r._pluginName = evt.payload.plugin;
          r._pluginResult = evt.payload.result;
          break;
        case 'plugin_hook_error':
          r.label = `${evt.payload.plugin}.${evt.payload.hook} ERROR`; r.phase = 'error'; r.isError = true; r.detail = evt.payload.error || ''; break;
        case 'hook_error':
          r.label = `hook:${evt.payload.hook} ERROR`; r.phase = 'error'; r.isError = true; r.detail = evt.payload.error || ''; break;
        case 'extraction_plugin_completed':
          r.label = `extract:${evt.payload.plugin}`; r.phase = 'extraction'; r.detail = JSON.stringify(evt.payload.result || {}); break;
        case 'extraction_error':
          r.label = 'extraction ERROR'; r.phase = 'error'; r.isError = true; r.detail = evt.payload.error || ''; break;
        case 'visual_asset_captured':
          r.label = `screenshot ${evt.payload.width}x${evt.payload.height}`; r.phase = 'screenshot'; break;
        case 'extraction_artifacts_persisted':
          r.label = `persist:${evt.payload.plugin}`; r.phase = 'persist'; break;
        case 'source_processed':
          r.label = `DONE (${evt.payload.status})`; r.phase = 'complete'; break;
        case 'source_fetch_failed':
          r.label = `FAILED: ${(evt.payload.message || '').slice(0, 80)}`; r.phase = 'error'; r.isError = true; r.detail = evt.payload.timeout_rescued ? 'RESCUED' : ''; break;
        case 'source_fetch_retrying':
          r.label = `RETRY #${evt.payload.retry_count}`; r.phase = 'retry'; r.isError = true; r.detail = (evt.payload.error || '').slice(0, 80); break;
        case 'suite_dismiss_error': case 'suite_scroll_error':
          r.label = `suite error (round ${evt.payload.round})`; r.phase = 'warn'; r.isError = true; r.detail = evt.payload.error || ''; break;
        default: r.label = evt.event;
      }
      rows.push(r);
      prevTs = evt.ts;
    }
    timelines[workerId] = { workerId, url, firstTs, lastTs, totalMs: lastTs - firstTs, rows };
  }
  return timelines;
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
:root{--bg:#0D1117;--card:#161B22;--border:#21262D;--text:#C9D1D9;--muted:#8B949E;--blue:#58A6FF;--green:#3FB950;--red:#F85149;--yellow:#D29922}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);padding:32px;font-size:14px}
h1{font-size:22px;color:var(--blue);margin-bottom:6px}
h2{font-size:14px;color:var(--muted);margin-bottom:20px;font-weight:400;word-break:break-all}
.meta{display:flex;flex-wrap:wrap;gap:20px;font-size:13px;color:var(--muted);margin-bottom:24px;padding:12px 16px;background:var(--card);border-radius:8px;border:1px solid var(--border)}
.meta b{color:var(--text)} .ok b{color:var(--green)} .fail b{color:var(--red)} .rescued b{color:var(--yellow)}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:24px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.legend-sw{width:14px;height:14px;border-radius:3px}

.pass-section{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:24px}
.pass-section h3{font-size:15px;margin-bottom:4px}
.pass-section .pass-meta{font-size:12px;color:var(--muted);margin-bottom:12px;display:flex;gap:16px}
.pass-section .pass-meta b{color:var(--text)}
.pass-ok{border-left:4px solid var(--green)}
.pass-fail{border-left:4px solid var(--red)}
.broke-banner{background:rgba(248,81,73,0.12);border:2px solid var(--red);border-radius:8px;padding:16px;margin-bottom:24px;font-size:15px;font-weight:600;color:var(--red);text-align:center}

.waterfall{width:100%;border-collapse:collapse}
.waterfall th{text-align:left;font-size:11px;color:var(--muted);font-weight:500;padding:6px 8px;border-bottom:2px solid var(--border);text-transform:uppercase;letter-spacing:.5px}
.waterfall td{padding:4px 8px;border-bottom:1px solid var(--border);vertical-align:middle;font-size:13px}
.waterfall tr:hover{background:rgba(88,166,255,0.04)}
.waterfall tr.row-error{background:rgba(248,81,73,0.06)}
.waterfall tr.row-error td{color:var(--red)}
.wf-idx{width:30px;color:var(--muted);font-size:11px;text-align:right;font-variant-numeric:tabular-nums}
.wf-phase{width:16px}
.wf-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.wf-label{width:280px;min-width:200px;font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-offset{width:70px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted)}
.wf-dur{width:70px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;font-weight:600}
.wf-bar-cell{min-width:300px}
.wf-bar-wrap{position:relative;height:18px;background:var(--border);border-radius:3px;overflow:hidden}
.wf-bar{position:absolute;left:0;top:0;height:100%;border-radius:3px;min-width:3px}
.wf-detail{font-size:11px;color:var(--muted);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-suppressed{font-size:11px;color:var(--green);max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}

.cards{display:grid;gap:12px}
.url-card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px 20px}
.url-card.c-ok{border-left:4px solid var(--green)} .url-card.c-fail{border-left:4px solid var(--red)} .url-card.c-block{border-left:4px solid var(--yellow)} .url-card.c-broke{border-left:4px solid #FF4500}
.url-card h3{font-size:14px;margin-bottom:4px} .url-card h3 a{color:var(--blue);text-decoration:none}
.url-card .url-text{font-size:11px;color:var(--muted);margin-bottom:8px;word-break:break-all}
.url-card .cm{font-size:12px;color:var(--muted);margin-bottom:4px;display:flex;flex-wrap:wrap;gap:14px} .url-card .cm b{color:var(--text)}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
.compare-cell{background:var(--bg);border-radius:6px;padding:10px 12px;font-size:12px}
.compare-cell .cell-label{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:4px}
.compare-cell.cell-ok{border:1px solid var(--green)} .compare-cell.cell-fail{border:1px solid var(--red)}
.tb{height:10px;border-radius:5px;background:var(--border);overflow:hidden;margin:4px 0}
.tf{height:100%;border-radius:5px}
.errs{margin-top:6px;font-size:12px;color:var(--red);font-family:monospace}
.plugin-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pb{display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:500}
.pb-green{background:rgba(59,185,80,0.15);color:var(--green)}
.pb-blue{background:rgba(88,166,255,0.15);color:var(--blue)}
.pb-purple{background:rgba(155,89,182,0.15);color:#BB86FC}
.pb-cyan{background:rgba(52,152,219,0.15);color:#64B5F6}
.pb-muted{background:rgba(139,148,158,0.1);color:var(--muted)}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.back{margin-top:32px;font-size:13px}
`;

// ── Render waterfall table ───────────────────────────────────────────────────

function waterfallHtml(rows) {
  if (!rows || rows.length === 0) return '<p style="color:var(--muted);font-style:italic">No events recorded (navigation may have failed before handler fired)</p>';
  const maxDur = Math.max(...rows.map((r) => r.durationMs), 1);

  const trs = rows.map((r, i) => {
    const phase = PHASE[r.phase] || PHASE.navigation;
    const barPct = Math.max(1, (r.durationMs / maxDur) * 100);
    const errCls = r.isError ? ' row-error' : '';
    const durStyle = r.durationMs > 5000 ? 'color:var(--red)' : r.durationMs > 1000 ? 'color:var(--yellow)' : '';

    return `<tr class="${errCls}" title="${esc(r.detail)}">
      <td class="wf-idx">${i + 1}</td>
      <td class="wf-phase"><span class="wf-dot" style="background:${phase.color}"></span></td>
      <td class="wf-label">${esc(r.label)}</td>
      <td class="wf-offset">${r.offsetMs}ms</td>
      <td class="wf-dur" style="${durStyle}">+${r.durationMs}ms</td>
      <td class="wf-bar-cell"><div class="wf-bar-wrap"><div class="wf-bar" style="width:${barPct.toFixed(1)}%;background:${phase.color}"></div></div></td>
      <td class="wf-suppressed">${esc(r.suppressed)}</td>
      <td class="wf-detail">${esc(r.detail)}</td>
    </tr>`;
  }).join('');

  return `<table class="waterfall"><thead><tr>
    <th>#</th><th></th><th>Event</th><th>Offset</th><th>Delta</th><th>Duration</th><th>Suppressed</th><th>Detail</th>
  </tr></thead><tbody>${trs}</tbody></table>`;
}

// ── Per-URL comparison HTML ──────────────────────────────────────────────────

function generateUrlComparisonHtml({ url, baselineTimeline, suiteTimeline, baselineResult, suiteResult }) {
  const host = safeHost(url);
  const bOk = baselineResult?.success;
  const sOk = suiteResult?.success;
  const broke = bOk && !sOk;

  const legend = Object.entries(PHASE)
    .map(([, v]) => `<div class="legend-item"><div class="legend-sw" style="background:${v.color}"></div>${v.label}</div>`)
    .join('');

  const bMs = baselineTimeline?.totalMs || 0;
  const sMs = suiteTimeline?.totalMs || 0;
  const bHtml = baselineResult?.html ? `${(baselineResult.html.length / 1024).toFixed(1)}KB` : '0KB';
  const sHtml = suiteResult?.html ? `${(suiteResult.html.length / 1024).toFixed(1)}KB` : '0KB';
  const bStatus = bOk ? `OK ${baselineResult.status}` : baselineResult?.fetchError || 'FAIL';
  const sStatus = sOk ? `OK ${suiteResult.status}` : suiteResult?.fetchError || 'FAIL';

  const brokeHtml = broke ? '<div class="broke-banner">SUITE BROKE THIS PAGE — Baseline loaded OK but suite failed</div>' : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${esc(host)} — Baseline vs Suite</title><style>${CSS}</style></head><body>
<h1>${esc(host)} — Baseline vs Suite</h1>
<h2>${esc(url)}</h2>
${brokeHtml}
<div class="legend">${legend}</div>

<div class="pass-section ${bOk ? 'pass-ok' : 'pass-fail'}">
  <h3>Baseline (raw Crawlee — no plugins, no hooks)</h3>
  <div class="pass-meta">
    <span>Status: <b>${bStatus}</b></span>
    <span>Time: <b>${bMs}ms</b></span>
    <span>HTML: <b>${bHtml}</b></span>
    <span>Events: <b>${baselineTimeline?.rows?.length || 0}</b></span>
  </div>
  ${waterfallHtml(baselineTimeline?.rows)}
</div>

<div class="pass-section ${sOk ? 'pass-ok' : 'pass-fail'}">
  <h3>Full Suite (plugins + extraction)</h3>
  <div class="pass-meta">
    <span>Status: <b>${sStatus}</b></span>
    <span>Time: <b>${sMs}ms</b></span>
    <span>HTML: <b>${sHtml}</b></span>
    <span>Events: <b>${suiteTimeline?.rows?.length || 0}</b></span>
    ${suiteResult?.fetchError ? `<span style="color:var(--red)">Error: <b>${esc(suiteResult.fetchError.slice(0, 80))}</b></span>` : ''}
  </div>
  ${waterfallHtml(suiteTimeline?.rows)}
</div>

<div class="back"><a href="CRAWL-PROBE-DASHBOARD.html">&larr; Back to Dashboard</a></div>
</body></html>`;
}

// ── Aggregate plugin stats for a timeline ────────────────────────────────────

function aggregatePluginStats(timeline) {
  if (!timeline?.rows) return null;
  const stats = {
    overlaysDetected: 0, overlaysRemoved: 0, closeClicked: 0,
    scrollLockReset: false, observerCaught: 0,
    cookieBannersClicked: 0, autoconsentMatched: false,
    expanded: 0, contentDeltaKB: 0,
    scrollPasses: 0, scrollStrategy: '',
    stealthPatches: 0,
  };

  for (const row of timeline.rows) {
    if (row.event !== 'plugin_hook_completed') continue;
    const p = row._pluginName;
    const r = row._pluginResult;
    if (!r) continue;

    if (p === 'overlayDismissal') {
      stats.overlaysDetected += r.overlaysDetected || 0;
      stats.overlaysRemoved += (r.domRemoved || 0) + (r.closeClicked || 0);
      stats.closeClicked += r.closeClicked || 0;
      if (r.scrollLockReset) stats.scrollLockReset = true;
      stats.observerCaught += r.observerCaught || 0;
    } else if (p === 'cookieConsent') {
      stats.cookieBannersClicked += r.fallbackClicked || 0;
      if (r.autoconsentMatched) stats.autoconsentMatched = true;
    } else if (p === 'domExpansion') {
      stats.expanded += r.clicked || 0;
      stats.contentDeltaKB += (r.contentDelta || 0) / 1024;
    } else if (p === 'autoScroll' && r.enabled) {
      stats.scrollPasses = Math.max(stats.scrollPasses, r.passes || 0);
      if (r.strategy) stats.scrollStrategy = r.strategy;
    } else if (p === 'stealth' && r.enabled) {
      stats.stealthPatches = r.patches?.length || 0;
    }
  }
  return stats;
}

function renderPluginBadges(stats) {
  if (!stats) return '';
  const badges = [];

  // Overlays
  if (stats.overlaysDetected > 0) {
    badges.push(`<span class="pb pb-green">${stats.overlaysDetected} overlay${stats.overlaysDetected > 1 ? 's' : ''} suppressed</span>`);
  }
  if (stats.scrollLockReset) badges.push('<span class="pb pb-green">scroll-lock reset</span>');
  if (stats.observerCaught > 0) badges.push(`<span class="pb pb-green">${stats.observerCaught} observer-caught</span>`);

  // Cookies
  if (stats.autoconsentMatched) badges.push('<span class="pb pb-blue">CMP auto-dismissed</span>');
  if (stats.cookieBannersClicked > 0) badges.push(`<span class="pb pb-blue">${stats.cookieBannersClicked} cookie btn clicked</span>`);

  // Expansion
  if (stats.expanded > 0) badges.push(`<span class="pb pb-purple">${stats.expanded} sections expanded</span>`);
  if (stats.contentDeltaKB > 0.5) badges.push(`<span class="pb pb-purple">+${stats.contentDeltaKB.toFixed(1)}KB content</span>`);

  // Scroll
  if (stats.scrollPasses > 0) badges.push(`<span class="pb pb-cyan">${stats.scrollPasses} scroll passes (${stats.scrollStrategy})</span>`);

  // Stealth
  if (stats.stealthPatches > 0) badges.push(`<span class="pb pb-muted">${stats.stealthPatches} stealth patches</span>`);

  if (badges.length === 0) badges.push('<span class="pb pb-muted">no suppression needed</span>');

  return `<div class="plugin-badges">${badges.join(' ')}</div>`;
}

// ── Dashboard HTML ───────────────────────────────────────────────────────────

function generateDashboardHtml({ urls, baselineResults, suiteResults, baselineTimelines, suiteTimelines, probeOpts }) {
  const maxMs = Math.max(
    ...Object.values(baselineTimelines).map((t) => t.totalMs),
    ...Object.values(suiteTimelines).map((t) => t.totalMs),
    1,
  );

  const cards = urls.map((url, i) => {
    const br = baselineResults[i] || {};
    const sr = suiteResults[i] || {};
    const host = safeHost(url);
    const broke = br.success && !sr.success;
    const cls = broke ? 'c-broke' : sr.success ? 'c-ok' : sr.blocked ? 'c-block' : 'c-fail';
    const filename = `url-${i + 1}.html`;

    const bMs = Object.values(baselineTimelines).find((t) => t.url === url)?.totalMs || 0;
    const sMs = Object.values(suiteTimelines).find((t) => t.url === url)?.totalMs || 0;
    const bStatus = br.success ? `OK ${br.status}` : br.fetchError ? 'FAIL' : `${br.status || 0}`;
    const sStatus = sr.success ? `OK ${sr.status}` : sr.fetchError ? 'FAIL' : `${sr.status || 0}`;
    const bHtml = br.html ? `${(br.html.length / 1024).toFixed(0)}KB` : '0';
    const sHtml = sr.html ? `${(sr.html.length / 1024).toFixed(0)}KB` : '0';

    const bBarPct = maxMs > 0 ? (bMs / maxMs) * 100 : 0;
    const sBarPct = maxMs > 0 ? (sMs / maxMs) * 100 : 0;

    const suiteTimeline = Object.values(suiteTimelines).find((t) => t.url === url);
    const pluginStats = aggregatePluginStats(suiteTimeline);
    const pluginBadgesHtml = renderPluginBadges(pluginStats);

    return `<div class="url-card ${cls}">
      <h3><a href="${filename}">${esc(host)}</a>${broke ? ' <span style="color:var(--red);font-size:12px">SUITE BROKE THIS</span>' : ''}</h3>
      <div class="url-text">${esc(url)}</div>
      <div class="compare-grid">
        <div class="compare-cell ${br.success ? 'cell-ok' : 'cell-fail'}">
          <div class="cell-label">Baseline</div>
          <span>Status: <b>${bStatus}</b></span> &nbsp; <span>HTML: <b>${bHtml}</b></span> &nbsp; <span>Time: <b>${(bMs/1000).toFixed(1)}s</b></span>
          <div class="tb"><div class="tf" style="width:${bBarPct.toFixed(1)}%;background:${br.success ? 'var(--green)' : 'var(--red)'}"></div></div>
        </div>
        <div class="compare-cell ${sr.success ? 'cell-ok' : 'cell-fail'}">
          <div class="cell-label">Suite</div>
          <span>Status: <b>${sStatus}</b></span> &nbsp; <span>HTML: <b>${sHtml}</b></span> &nbsp; <span>Time: <b>${(sMs/1000).toFixed(1)}s</b></span>
          <div class="tb"><div class="tf" style="width:${sBarPct.toFixed(1)}%;background:${sr.success ? 'var(--green)' : 'var(--red)'}"></div></div>
          ${sr.fetchError ? `<div class="errs">${esc(sr.fetchError.slice(0, 80))}</div>` : ''}
          ${pluginBadgesHtml}
        </div>
      </div>
    </div>`;
  }).join('');

  const bOk = baselineResults.filter((r) => r.success).length;
  const sOk = suiteResults.filter((r) => r.success).length;
  const broke = urls.filter((_, i) => baselineResults[i]?.success && !suiteResults[i]?.success).length;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Crawl Probe — Baseline vs Suite</title><style>${CSS}</style></head><body>
<h1>Crawl Probe — Baseline vs Suite</h1>
<h2>${urls.length} URLs${probeOpts?.product ? ` — "${esc(probeOpts.product)}"` : ''}</h2>
<div class="meta">
  <span>Baseline OK: <b>${bOk}/${urls.length}</b></span>
  <span>Suite OK: <b>${sOk}/${urls.length}</b></span>
  ${broke > 0 ? `<span class="fail">Suite broke: <b>${broke}</b></span>` : '<span class="ok">Suite broke: <b>0</b></span>'}
  <span>Slots: <b>${probeOpts?.slots || '?'}</b></span>
  <span>Timeout: <b>${probeOpts?.timeout || '?'}s</b></span>
  <span>Suite mode: <b>${probeOpts?.suiteMode || '?'}</b></span>
</div>
<div class="cards">${cards}</div>
</body></html>`;
}

// ── Dashboard from ALL files in folder ────────────────────────────────────────

function generateDashboardFromFiles({ allHtmlFiles, outputDir, currentRunTs, currentUrls, currentBaselineResults, currentSuiteResults, baselineTimelines, suiteTimelines, probeOpts }) {
  // Group files by run timestamp (format: YYYY-MM-DDTHH-MM-SS_host.html)
  const runs = {};
  for (const file of allHtmlFiles) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.+)\.html$/);
    if (!match) continue;
    const [, runTs, host] = match;
    if (!runs[runTs]) runs[runTs] = [];
    runs[runTs].push({ file, host, runTs });
  }

  // Build cards: current run gets full detail, older runs get simple links
  let cardsHtml = '';

  // Current run — full detail with plugin badges
  if (runs[currentRunTs]) {
    const runLabel = currentRunTs.replace('T', ' ').replace(/-/g, (m, offset) => offset > 9 ? ':' : '-');
    cardsHtml += `<h3 style="color:var(--blue);margin:20px 0 12px">Current Run — ${runLabel}</h3>`;

    const maxMs = Math.max(
      ...Object.values(baselineTimelines).map((t) => t.totalMs),
      ...Object.values(suiteTimelines).map((t) => t.totalMs),
      1,
    );

    cardsHtml += currentUrls.map((url, i) => {
      const br = currentBaselineResults[i] || {};
      const sr = currentSuiteResults[i] || {};
      const host = safeHost(url);
      const broke = br.success && !sr.success;
      const cls = broke ? 'c-broke' : sr.success ? 'c-ok' : sr.blocked ? 'c-block' : 'c-fail';
      const filename = `${currentRunTs}_${host.replace(/[^a-zA-Z0-9.-]/g, '_')}.html`;
      const bStatus = br.success ? `OK ${br.status}` : br.fetchError ? 'FAIL' : `${br.status || 0}`;
      const sStatus = sr.success ? `OK ${sr.status}` : sr.fetchError ? 'FAIL' : `${sr.status || 0}`;
      const bHtml = br.html ? `${(br.html.length / 1024).toFixed(0)}KB` : '0';
      const sHtml = sr.html ? `${(sr.html.length / 1024).toFixed(0)}KB` : '0';
      const bMs = Object.values(baselineTimelines).find((t) => t.url === url)?.totalMs || 0;
      const sMs = Object.values(suiteTimelines).find((t) => t.url === url)?.totalMs || 0;
      const bBarPct = maxMs > 0 ? (bMs / maxMs) * 100 : 0;
      const sBarPct = maxMs > 0 ? (sMs / maxMs) * 100 : 0;
      const suiteTimeline = Object.values(suiteTimelines).find((t) => t.url === url);
      const pluginStats = aggregatePluginStats(suiteTimeline);
      const pluginBadgesHtml = renderPluginBadges(pluginStats);

      return `<div class="url-card ${cls}">
        <h3><a href="${filename}">${esc(host)}</a>${broke ? ' <span style="color:var(--red);font-size:12px">SUITE BROKE THIS</span>' : ''}</h3>
        <div class="url-text">${esc(url)}</div>
        <div class="compare-grid">
          <div class="compare-cell ${br.success ? 'cell-ok' : 'cell-fail'}">
            <div class="cell-label">Baseline</div>
            <span>Status: <b>${bStatus}</b></span> &nbsp; <span>HTML: <b>${bHtml}</b></span> &nbsp; <span>Time: <b>${(bMs/1000).toFixed(1)}s</b></span>
            <div class="tb"><div class="tf" style="width:${bBarPct.toFixed(1)}%;background:${br.success ? 'var(--green)' : 'var(--red)'}"></div></div>
          </div>
          <div class="compare-cell ${sr.success ? 'cell-ok' : 'cell-fail'}">
            <div class="cell-label">Suite</div>
            <span>Status: <b>${sStatus}</b></span> &nbsp; <span>HTML: <b>${sHtml}</b></span> &nbsp; <span>Time: <b>${(sMs/1000).toFixed(1)}s</b></span>
            <div class="tb"><div class="tf" style="width:${sBarPct.toFixed(1)}%;background:${sr.success ? 'var(--green)' : 'var(--red)'}"></div></div>
            ${sr.fetchError ? `<div class="errs">${esc(sr.fetchError.slice(0, 80))}</div>` : ''}
            ${pluginBadgesHtml}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // Previous runs — simple link list grouped by timestamp
  const prevRuns = Object.entries(runs).filter(([ts]) => ts !== currentRunTs).sort().reverse();
  if (prevRuns.length > 0) {
    cardsHtml += '<h3 style="color:var(--muted);margin:32px 0 12px">Previous Runs</h3>';
    for (const [runTs, entries] of prevRuns) {
      const runLabel = runTs.replace('T', ' ').replace(/-/g, (m, offset) => offset > 9 ? ':' : '-');
      cardsHtml += `<div class="url-card" style="border-left:3px solid var(--muted)">
        <h3 style="color:var(--muted)">${runLabel} — ${entries.length} URL${entries.length > 1 ? 's' : ''}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
          ${entries.map((e) => `<a href="${e.file}" class="pb pb-muted">${esc(e.host)}</a>`).join(' ')}
        </div>
      </div>`;
    }
  }

  const bOk = currentBaselineResults.filter((r) => r.success).length;
  const sOk = currentSuiteResults.filter((r) => r.success).length;
  const broke = currentUrls.filter((_, i) => currentBaselineResults[i]?.success && !currentSuiteResults[i]?.success).length;
  const totalRuns = Object.keys(runs).length;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Crawl Probe Dashboard</title><style>${CSS}</style></head><body>
<h1>Crawl Probe Dashboard</h1>
<h2>${allHtmlFiles.length} total reports across ${totalRuns} run${totalRuns > 1 ? 's' : ''}${probeOpts?.product ? ` — "${esc(probeOpts.product)}"` : ''}</h2>
<div class="meta">
  <span>Current: Baseline <b>${bOk}/${currentUrls.length}</b> OK, Suite <b>${sOk}/${currentUrls.length}</b> OK</span>
  ${broke > 0 ? `<span class="fail">Suite broke: <b>${broke}</b></span>` : '<span class="ok">Suite broke: <b>0</b></span>'}
  <span>Slots: <b>${probeOpts?.slots || '?'}</b></span>
  <span>Timeout: <b>${probeOpts?.timeout || '?'}s</b></span>
  <span>Suite mode: <b>${probeOpts?.suiteMode || '?'}</b></span>
</div>
<div class="cards">${cardsHtml}</div>
</body></html>`;
}

// ── Write all reports ────────────────────────────────────────────────────────

export function writeReports({ baselineEvents, baselineResults, suiteEvents, suiteResults, urls, probeOpts, outputDir, runTs }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const ts = runTs || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const baselineTimelines = buildUrlTimelines(baselineEvents);
  const suiteTimelines = buildUrlTimelines(suiteEvents);
  const files = [];

  // Per-URL comparison pages — timestamped so runs accumulate
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const host = safeHost(url).replace(/[^a-zA-Z0-9.-]/g, '_');
    const bTimeline = Object.values(baselineTimelines).find((t) => t.url === url);
    const sTimeline = Object.values(suiteTimelines).find((t) => t.url === url);

    const html = generateUrlComparisonHtml({
      url,
      baselineTimeline: bTimeline,
      suiteTimeline: sTimeline,
      baselineResult: baselineResults[i],
      suiteResult: suiteResults[i],
    });
    const filename = `${ts}_${host}.html`;
    fs.writeFileSync(path.join(outputDir, filename), html);
    files.push(filename);
  }

  // Dashboard — scans ALL html files in the folder, not just this run
  const allHtmlFiles = fs.readdirSync(outputDir)
    .filter((f) => f.endsWith('.html') && f !== 'CRAWL-PROBE-DASHBOARD.html')
    .sort()
    .reverse();  // newest first

  const dashHtml = generateDashboardFromFiles({ allHtmlFiles, outputDir, currentRunTs: ts, currentUrls: urls, currentBaselineResults: baselineResults, currentSuiteResults: suiteResults, baselineTimelines, suiteTimelines, probeOpts });
  fs.writeFileSync(path.join(outputDir, 'CRAWL-PROBE-DASHBOARD.html'), dashHtml);
  files.push('CRAWL-PROBE-DASHBOARD.html');

  return { dir: outputDir, files };
}
