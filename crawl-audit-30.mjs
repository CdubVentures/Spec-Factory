/**
 * Crawl Audit: 30 diverse mice products
 * Runs each through the full pipeline, collects all fetch worker data,
 * screenshot/video availability, errors, block reasons, and edge cases.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const API_BASE = 'http://localhost:8788/api/v1';
const RESULTS_DIR = path.resolve('crawl-audit-results');
fs.mkdirSync(RESULTS_DIR, { recursive: true });

// 30 diverse mice products - wide variety of brands, price points, and likely site availability
const MICE = [
  { brand: 'Logitech', model: 'G Pro X Superlight 2' },
  { brand: 'Razer', model: 'DeathAdder V3 HyperSpeed' },
  { brand: 'Zowie', model: 'EC2-CW' },
  { brand: 'Pulsar', model: 'X2V2 Mini' },
  { brand: 'Endgame Gear', model: 'OP1we' },
  { brand: 'Lamzu', model: 'Atlantis V2' },
  { brand: 'Vaxee', model: 'NP-01S' },
  { brand: 'SteelSeries', model: 'Rival 3' },
  { brand: 'Corsair', model: 'Dark Core RGB Pro SE' },
  { brand: 'Roccat', model: 'Kone Pro Air' },
  { brand: 'Glorious', model: 'Model O 2 Wireless' },
  { brand: 'Razer', model: 'Viper V3 Pro' },
  { brand: 'Logitech', model: 'G502 X Plus' },
  { brand: 'BenQ Zowie', model: 'FK2-B' },
  { brand: 'Cooler Master', model: 'MM712' },
  { brand: 'Ninjutso', model: 'Sora V2' },
  { brand: 'Fantech', model: 'Aria XD7' },
  { brand: 'Ducky', model: 'Feather' },
  { brand: 'Razer', model: 'Basilisk V3 Pro' },
  { brand: 'Xtrfy', model: 'M8 Wireless' },
  { brand: 'SteelSeries', model: 'Prime Mini Wireless' },
  { brand: 'Logitech', model: 'G305 Lightspeed' },
  { brand: 'HyperX', model: 'Pulsefire Haste 2' },
  { brand: 'Asus', model: 'ROG Gladius III Wireless' },
  { brand: 'Mad Catz', model: 'R.A.T. 8+' },
  { brand: 'Corsair', model: 'Sabre RGB Pro Wireless' },
  { brand: 'Razer', model: 'Orochi V2' },
  { brand: 'Mountain', model: 'Makalu 67' },
  { brand: 'Lexip', model: 'Pu94' },
  { brand: 'WLMouse', model: 'Beast X' },
];

function httpRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startRun(mouse) {
  const body = {
    category: 'mouse',
    brand: mouse.brand,
    model: mouse.model,
    seed: `${mouse.brand} ${mouse.model}`,
    searchEngines: 'google',
    replaceRunning: true,
  };
  const res = await httpRequest('POST', '/process/start', body);
  return res;
}

async function waitForCompletion(maxWaitMs = 420000) {
  const start = Date.now();
  let lastStatus = null;
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await httpRequest('GET', '/process/status');
      lastStatus = res.body;
      if (!res.body.running && res.body.exitCode !== undefined && res.body.exitCode !== null) {
        return { completed: true, status: res.body, waitMs: Date.now() - start };
      }
    } catch (err) {
      console.log('  Poll error:', err.message);
    }
    await sleep(5000);
  }
  return { completed: false, status: lastStatus, waitMs: Date.now() - start };
}

async function collectRunData(runId) {
  const data = { runId };

  // Runtime summary
  try {
    const res = await httpRequest('GET', `/indexlab/run/${runId}/runtime/summary`);
    data.summary = res.body;
  } catch (e) { data.summary = { error: e.message }; }

  // All workers
  try {
    const res = await httpRequest('GET', `/indexlab/run/${runId}/runtime/workers`);
    data.workers = res.body;
  } catch (e) { data.workers = { error: e.message }; }

  // Fetch phases (stealth, cookie, scroll, dom, css)
  try {
    const res = await httpRequest('GET', `/indexlab/run/${runId}/runtime/fetch`);
    data.fetchPhases = res.body;
  } catch (e) { data.fetchPhases = { error: e.message }; }

  // Worker details + screenshots + video for each fetch worker
  const fetchWorkers = (data.workers?.workers || []).filter((w) => w.pool === 'fetch');
  data.workerDetails = [];

  for (const worker of fetchWorkers) {
    const detail = { worker_id: worker.worker_id, state: worker.state, url: worker.current_url, last_error: worker.last_error };

    // Worker detail (screenshots, extraction)
    try {
      const res = await httpRequest('GET', `/indexlab/run/${runId}/runtime/workers/${worker.worker_id}`);
      detail.screenshots = res.body.screenshots || [];
      detail.documents = res.body.documents || [];
      detail.extraction_plugins = res.body.extraction_plugins || [];
      detail.extraction_fields = res.body.extraction_fields || [];
    } catch (e) { detail.detailError = e.message; }

    // Screencast frame availability
    try {
      const res = await httpRequest('GET', `/indexlab/run/${runId}/runtime/screencast/${worker.worker_id}/last`);
      detail.hasScreencastFrame = res.status === 200 && !!res.body?.data;
      detail.screencastFrameSize = res.body?.width && res.body?.height ? `${res.body.width}x${res.body.height}` : null;
      detail.screencastSynthetic = res.body?.synthetic || false;
    } catch { detail.hasScreencastFrame = false; }

    // Video availability
    try {
      const url = new URL(`${API_BASE}/indexlab/run/${runId}/runtime/video/${worker.worker_id}`);
      const checkRes = await new Promise((resolve, reject) => {
        const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'HEAD', timeout: 5000 }, (res) => {
          resolve({ status: res.statusCode, contentType: res.headers['content-type'], contentLength: res.headers['content-length'] });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
      });
      detail.hasVideo = checkRes.status === 200;
      detail.videoContentType = checkRes.contentType || null;
      detail.videoSize = checkRes.contentLength ? parseInt(checkRes.contentLength) : null;
    } catch { detail.hasVideo = false; }

    data.workerDetails.push(detail);
  }

  return data;
}

function analyzeRun(mouse, runData) {
  const analysis = {
    product: `${mouse.brand} ${mouse.model}`,
    runId: runData.runId,
    status: runData.summary?.status || 'unknown',
    totalFetches: runData.summary?.total_fetches || 0,
    errorRate: runData.summary?.error_rate || 0,
    topBlockers: runData.summary?.top_blockers || [],
  };

  const workers = runData.workerDetails || [];
  analysis.workerCount = workers.length;

  // State distribution
  const stateCounts = {};
  workers.forEach((w) => { stateCounts[w.state] = (stateCounts[w.state] || 0) + 1; });
  analysis.stateDistribution = stateCounts;

  // Error classification
  const errorTypes = {};
  workers.filter((w) => w.last_error).forEach((w) => {
    const err = w.last_error;
    let type = 'unknown';
    if (err.includes('timed out')) type = 'timeout';
    else if (err.includes('captcha')) type = 'captcha';
    else if (err.includes('blocked:')) type = err.split('blocked:')[1]?.split(/[\s)]/)[0] || 'blocked';
    else if (err.includes('ERR_HTTP2')) type = 'http2_error';
    else if (err.includes('ERR_NAME_NOT_RESOLVED')) type = 'dns_error';
    else if (err.includes('ERR_CONNECTION')) type = 'connection_error';
    else if (err.includes('net::')) type = 'network_error';
    else if (err.includes('Download is starting')) type = 'download_redirect';
    else type = 'other: ' + err.slice(0, 60);
    errorTypes[type] = (errorTypes[type] || 0) + 1;
  });
  analysis.errorTypes = errorTypes;

  // Screenshot/video discrepancy analysis
  analysis.discrepancies = [];
  workers.forEach((w) => {
    const hasFailed = ['failed', 'captcha', 'blocked', 'rate_limited'].includes(w.state);
    const hasScreenshot = w.hasScreencastFrame === true;
    const hasVideo = w.hasVideo === true;
    const hasScreenshotImages = (w.screenshots?.length || 0) > 0;

    if (hasFailed && (hasScreenshot || hasVideo || hasScreenshotImages)) {
      analysis.discrepancies.push({
        worker: w.worker_id,
        state: w.state,
        error: w.last_error?.slice(0, 80),
        url: w.url?.slice(0, 100),
        hasScreencast: hasScreenshot,
        screencastSize: w.screencastFrameSize,
        hasVideo,
        videoSize: w.videoSize,
        hasScreenshotImages: hasScreenshotImages,
        screenshotCount: w.screenshots?.length || 0,
        // KEY: This means the page loaded (got content) but was classified as failed
        diagnosis: 'PAGE_LOADED_BUT_CLASSIFIED_FAILED',
      });
    }

    if (!hasFailed && !hasScreenshot && !hasVideo) {
      analysis.discrepancies.push({
        worker: w.worker_id,
        state: w.state,
        url: w.url?.slice(0, 100),
        diagnosis: 'SUCCESS_BUT_NO_VISUAL_EVIDENCE',
      });
    }
  });

  // Domain analysis
  const domainResults = {};
  workers.forEach((w) => {
    try {
      const host = new URL(w.url).hostname;
      if (!domainResults[host]) domainResults[host] = { ok: 0, failed: 0, errors: [] };
      if (['crawled'].includes(w.state)) domainResults[host].ok++;
      else {
        domainResults[host].failed++;
        domainResults[host].errors.push(w.last_error?.slice(0, 50));
      }
    } catch { /* skip bad urls */ }
  });
  analysis.domainResults = domainResults;

  // Plugin effectiveness
  const phases = runData.fetchPhases || {};
  analysis.pluginStats = {};
  ['stealth', 'cookie_consent', 'auto_scroll', 'dom_expansion', 'css_override'].forEach((phase) => {
    const records = phases[phase]?.records || [];
    if (records.length) {
      const statuses = {};
      records.forEach((r) => {
        const s = r.status || 'unknown';
        statuses[s] = (statuses[s] || 0) + 1;
      });
      analysis.pluginStats[phase] = { total: records.length, statuses };
    }
  });

  return analysis;
}

async function main() {
  console.log(`\n=== CRAWL AUDIT: 30 Mice Products ===`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const allResults = [];
  const masterReport = {
    startedAt: new Date().toISOString(),
    totalProducts: MICE.length,
    runs: [],
  };

  for (let i = 0; i < MICE.length; i++) {
    const mouse = MICE[i];
    const label = `${mouse.brand} ${mouse.model}`;
    console.log(`\n--- [${i + 1}/${MICE.length}] ${label} ---`);

    // Start the run
    let startRes;
    try {
      startRes = await startRun(mouse);
      if (startRes.status !== 200) {
        console.log(`  START FAILED (${startRes.status}):`, JSON.stringify(startRes.body).slice(0, 200));
        masterReport.runs.push({ product: label, error: 'start_failed', detail: startRes.body });
        continue;
      }
    } catch (err) {
      console.log(`  START ERROR:`, err.message);
      masterReport.runs.push({ product: label, error: 'start_error', detail: err.message });
      continue;
    }

    const runId = startRes.body?.run_id || startRes.body?.runId;
    console.log(`  Run ID: ${runId}`);

    // Wait for completion (max 7 min per run)
    console.log(`  Waiting for completion...`);
    const completion = await waitForCompletion(420000);
    console.log(`  Completed: ${completion.completed} (${Math.round(completion.waitMs / 1000)}s, exit=${completion.status?.exitCode})`);

    // Collect all run data
    console.log(`  Collecting run data...`);
    const runData = await collectRunData(runId);

    // Analyze
    const analysis = analyzeRun(mouse, runData);
    console.log(`  Fetches: ${analysis.totalFetches}, Error rate: ${(analysis.errorRate * 100).toFixed(1)}%`);
    console.log(`  States:`, JSON.stringify(analysis.stateDistribution));
    console.log(`  Errors:`, JSON.stringify(analysis.errorTypes));
    if (analysis.discrepancies.length > 0) {
      console.log(`  DISCREPANCIES: ${analysis.discrepancies.length}`);
      analysis.discrepancies.forEach((d) => console.log(`    ${d.worker}: ${d.diagnosis} (${d.state}, screencast=${d.hasScreencast}, video=${d.hasVideo})`));
    }

    // Save individual run data
    const runFile = path.join(RESULTS_DIR, `run-${String(i + 1).padStart(2, '0')}-${runId}.json`);
    fs.writeFileSync(runFile, JSON.stringify({ mouse, completion, runData, analysis }, null, 2));

    masterReport.runs.push(analysis);
    allResults.push({ mouse, analysis });

    // Small delay between runs to be courteous
    if (i < MICE.length - 1) {
      console.log(`  Waiting 3s before next run...`);
      await sleep(3000);
    }
  }

  // Final master report
  masterReport.completedAt = new Date().toISOString();

  // Aggregate statistics
  const agg = {
    totalRuns: masterReport.runs.length,
    successfulRuns: masterReport.runs.filter((r) => r.status === 'completed').length,
    failedRuns: masterReport.runs.filter((r) => r.status === 'failed' || r.error).length,
    totalFetches: masterReport.runs.reduce((sum, r) => sum + (r.totalFetches || 0), 0),
    avgErrorRate: masterReport.runs.filter((r) => r.errorRate !== undefined).reduce((sum, r) => sum + r.errorRate, 0) / Math.max(1, masterReport.runs.filter((r) => r.errorRate !== undefined).length),
    totalDiscrepancies: masterReport.runs.reduce((sum, r) => sum + (r.discrepancies?.length || 0), 0),
  };

  // Aggregate error types across all runs
  const globalErrorTypes = {};
  masterReport.runs.forEach((r) => {
    Object.entries(r.errorTypes || {}).forEach(([type, count]) => {
      globalErrorTypes[type] = (globalErrorTypes[type] || 0) + count;
    });
  });
  agg.globalErrorTypes = globalErrorTypes;

  // Aggregate domain failures
  const globalDomainFailures = {};
  masterReport.runs.forEach((r) => {
    Object.entries(r.domainResults || {}).forEach(([domain, stats]) => {
      if (!globalDomainFailures[domain]) globalDomainFailures[domain] = { ok: 0, failed: 0 };
      globalDomainFailures[domain].ok += stats.ok;
      globalDomainFailures[domain].failed += stats.failed;
    });
  });
  // Sort by failure count
  agg.domainReliability = Object.entries(globalDomainFailures)
    .map(([domain, stats]) => ({ domain, ...stats, failRate: stats.failed / (stats.ok + stats.failed) }))
    .sort((a, b) => b.failed - a.failed)
    .slice(0, 40);

  // Aggregate all discrepancies
  agg.allDiscrepancies = masterReport.runs.flatMap((r) => (r.discrepancies || []).map((d) => ({ product: r.product, ...d })));

  masterReport.aggregate = agg;

  // Write master report
  const masterFile = path.join(RESULTS_DIR, 'MASTER-REPORT.json');
  fs.writeFileSync(masterFile, JSON.stringify(masterReport, null, 2));

  console.log(`\n\n========================================`);
  console.log(`AUDIT COMPLETE`);
  console.log(`========================================`);
  console.log(`Total runs: ${agg.totalRuns}`);
  console.log(`Successful: ${agg.successfulRuns}`);
  console.log(`Failed: ${agg.failedRuns}`);
  console.log(`Total fetches: ${agg.totalFetches}`);
  console.log(`Avg error rate: ${(agg.avgErrorRate * 100).toFixed(1)}%`);
  console.log(`Total discrepancies: ${agg.totalDiscrepancies}`);
  console.log(`\nGlobal error types:`, JSON.stringify(globalErrorTypes, null, 2));
  console.log(`\nTop failing domains:`);
  agg.domainReliability.slice(0, 15).forEach((d) => {
    console.log(`  ${d.domain}: ${d.ok} ok, ${d.failed} failed (${(d.failRate * 100).toFixed(0)}% fail)`);
  });
  console.log(`\nResults saved to: ${RESULTS_DIR}`);
  console.log(`Master report: ${masterFile}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
