/**
 * Deep audit: For EVERY fetch worker in target runs, check:
 * 1. Worker state + error from event stream
 * 2. Screencast frame existence + size (proves page rendered)
 * 3. Video file existence + size (proves browser was active)
 * 4. Document status (parsed vs fetch_error)
 * 5. Extraction plugin results
 * 6. Cross-reference: does visual evidence contradict the classification?
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://localhost:8788/api/v1';
const OUT = path.resolve('crawl-deep-audit-results.json');

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + urlPath);
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname, timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// Runs with actual fetch data
const TARGET_RUNS = [
  '20260327035611-b58cdc',  // Logitech G Pro X Superlight 2 (our audit run 1)
  '20260327042436-1e7ded',  // Pulsar X2V2 Mini (our audit run 4)
  '20260326085947-4f63e1',  // Asus ROG Harpe II Ace
  '20260326075759-761478',  // Cougar Minos EX
  '20260326072251-cec006',  // Cougar Minos EX (different run)
  '20260327034619-54cc66',  // HyperX Pulsefire Haste 2 Mini
  '20260326070754-5c3873',  // Cougar Revenger Pro 4K
  '20260326005530-a49ee6',  // Finalmouse ULX Prophecy Scream
  '20260325222153-2cb11f',  // Finalmouse ULX Prophecy TFue
  '20260326045845-b9f1a1',  // SteelSeries Aerox 5
];

async function auditRun(runId) {
  console.log(`\n==== AUDITING RUN: ${runId} ====`);

  // Get all workers
  const workersRes = await get(`/indexlab/run/${runId}/runtime/workers`);
  if (!workersRes.body?.workers) {
    console.log('  No workers found');
    return null;
  }

  const allWorkers = workersRes.body.workers;
  const fetchWorkers = allWorkers.filter(w => w.pool === 'fetch');
  console.log(`  Total workers: ${allWorkers.length}, Fetch workers: ${fetchWorkers.length}`);

  const results = [];

  for (const w of fetchWorkers) {
    const entry = {
      run_id: runId,
      worker_id: w.worker_id,
      state: w.state,
      last_error: w.last_error || null,
      url: w.current_url || '',
      host: '',
      retries: w.retries || 0,
    };

    try { entry.host = new URL(entry.url).hostname; } catch {}

    // 1. Check screencast frame
    try {
      const scRes = await get(`/indexlab/run/${runId}/runtime/screencast/${w.worker_id}/last`);
      if (scRes.status === 200 && scRes.body?.frame) {
        const frame = scRes.body.frame;
        entry.screencast_exists = true;
        entry.screencast_data_bytes = (frame.data || '').length; // base64 length
        entry.screencast_width = frame.width || 0;
        entry.screencast_height = frame.height || 0;
        entry.screencast_synthetic = !!frame.synthetic;
        // A real page screenshot is typically >10KB base64. Block/error pages are <5KB.
        entry.screencast_looks_real = entry.screencast_data_bytes > 15000;
      } else {
        entry.screencast_exists = false;
        entry.screencast_looks_real = false;
      }
    } catch {
      entry.screencast_exists = false;
      entry.screencast_looks_real = false;
    }

    // 2. Check video file
    try {
      const vidRes = await get(`/indexlab/run/${runId}/runtime/video/${w.worker_id}`);
      if (vidRes.status === 200) {
        // Video endpoint returns the actual video bytes, so body will be garbled
        // but status 200 = video exists. Check content-length from a fresh request.
        entry.video_exists = true;
        // For size, we need content-length which isn't easy from our simple GET.
        // Use a separate HEAD-like approach
        entry.video_size_bytes = 0; // Will fill in below
      } else {
        entry.video_exists = false;
        entry.video_size_bytes = 0;
      }
    } catch {
      entry.video_exists = false;
      entry.video_size_bytes = 0;
    }

    // 2b. Get video size via content-length
    if (entry.video_exists) {
      try {
        const vidSize = await new Promise((resolve, reject) => {
          const url = new URL(`${API}/indexlab/run/${runId}/runtime/video/${w.worker_id}`);
          const req = http.get({ hostname: url.hostname, port: url.port, path: url.pathname, timeout: 5000 }, (res) => {
            const len = parseInt(res.headers['content-length'] || '0', 10);
            res.destroy(); // Don't download the whole video
            resolve(len);
          });
          req.on('error', () => resolve(0));
          req.on('timeout', () => { req.destroy(); resolve(0); });
        });
        entry.video_size_bytes = vidSize;
        // A real video recording is >50KB. Tiny ones (<10KB) are empty/warmup.
        entry.video_looks_real = vidSize > 50000;
      } catch {
        entry.video_looks_real = false;
      }
    } else {
      entry.video_looks_real = false;
    }

    // 3. Check worker detail (documents, extraction)
    try {
      const detRes = await get(`/indexlab/run/${runId}/runtime/workers/${w.worker_id}`);
      if (detRes.body) {
        const det = detRes.body;
        entry.doc_count = det.documents?.length || 0;
        entry.doc_status = det.documents?.[0]?.status || 'none';
        entry.extraction_field_count = det.extraction_fields?.length || 0;
        entry.extraction_plugins = (det.extraction_plugins || []).map(p => ({
          plugin: p.plugin,
          status: p.status,
        }));
        entry.screenshot_count = det.screenshots?.length || 0;
      }
    } catch {
      entry.doc_count = 0;
      entry.doc_status = 'error';
    }

    // 4. VERDICT: Cross-reference classification vs evidence
    const isClassifiedError = ['failed', 'captcha', 'blocked', 'rate_limited'].includes(w.state);
    const hasVisualEvidence = entry.screencast_looks_real || entry.video_looks_real;
    const hasExtractedData = entry.extraction_field_count > 0 || entry.doc_status === 'parsed';

    if (isClassifiedError && hasVisualEvidence && !hasExtractedData) {
      entry.verdict = 'MISCLASSIFIED_FAILURE';
      entry.verdict_detail = `State=${w.state} but visual evidence proves page loaded. Data was NOT extracted (wasted).`;
    } else if (isClassifiedError && hasVisualEvidence && hasExtractedData) {
      entry.verdict = 'ERROR_WITH_PARTIAL_DATA';
      entry.verdict_detail = `State=${w.state} but extraction ran. Possible stale error from retry.`;
    } else if (isClassifiedError && !hasVisualEvidence) {
      entry.verdict = 'TRUE_FAILURE';
      entry.verdict_detail = `State=${w.state}, no visual evidence. Genuine failure.`;
    } else if (!isClassifiedError && hasVisualEvidence) {
      entry.verdict = 'CORRECT_SUCCESS';
      entry.verdict_detail = 'Success with visual evidence.';
    } else if (!isClassifiedError && !hasVisualEvidence) {
      entry.verdict = 'SUCCESS_NO_EVIDENCE';
      entry.verdict_detail = 'Classified success but no retained frame or video.';
    } else if (w.state === 'queued') {
      entry.verdict = 'NEVER_PROCESSED';
      entry.verdict_detail = 'URL was queued but never fetched (run timeout).';
    } else {
      entry.verdict = 'UNKNOWN';
      entry.verdict_detail = `State=${w.state}, evidence=${hasVisualEvidence}`;
    }

    results.push(entry);

    // Print each worker result
    const stateTag = isClassifiedError ? '***' : '   ';
    const scTag = entry.screencast_looks_real ? 'SC:REAL' : (entry.screencast_exists ? 'SC:tiny' : 'SC:NONE');
    const vidTag = entry.video_looks_real ? `VID:${(entry.video_size_bytes/1024).toFixed(0)}KB` : (entry.video_exists ? 'VID:tiny' : 'VID:NONE');
    const extTag = entry.doc_status === 'parsed' ? 'PARSED' : entry.doc_status;

    console.log(
      `${stateTag} ${w.worker_id.padEnd(10)} state=${w.state.padEnd(10)} ${scTag.padEnd(10)} ${vidTag.padEnd(12)} doc=${extTag.padEnd(12)} [${entry.verdict}]` +
      ` ${entry.host.slice(0,30)}`
    );
  }

  return results;
}

async function main() {
  console.log('=== DEEP CRAWL AUDIT: Every Worker vs Visual Evidence ===\n');

  const allResults = [];

  for (const runId of TARGET_RUNS) {
    try {
      const results = await auditRun(runId);
      if (results) allResults.push(...results);
    } catch (err) {
      console.log(`  ERROR auditing ${runId}: ${err.message}`);
    }
  }

  // Aggregate verdicts
  const verdictCounts = {};
  allResults.forEach(r => {
    verdictCounts[r.verdict] = (verdictCounts[r.verdict] || 0) + 1;
  });

  console.log('\n\n========================================');
  console.log('VERDICT SUMMARY');
  console.log('========================================');
  console.log(`Total workers audited: ${allResults.length}`);
  Object.entries(verdictCounts).sort((a,b) => b[1]-a[1]).forEach(([v, c]) => {
    console.log(`  ${v}: ${c} (${(c/allResults.length*100).toFixed(1)}%)`);
  });

  // Show all MISCLASSIFIED_FAILURE entries
  const misclassified = allResults.filter(r => r.verdict === 'MISCLASSIFIED_FAILURE');
  if (misclassified.length) {
    console.log(`\n=== MISCLASSIFIED FAILURES (${misclassified.length}) ===`);
    console.log('These workers were marked FAILED but visual evidence proves the page loaded:\n');
    misclassified.forEach(r => {
      console.log(`  ${r.worker_id} | run=${r.run_id.slice(-6)} | state=${r.state} | err=${(r.last_error||'').slice(0,60)}`);
      console.log(`    url: ${r.url.slice(0,90)}`);
      console.log(`    screencast: ${r.screencast_data_bytes}b (${r.screencast_width}x${r.screencast_height}) | video: ${(r.video_size_bytes/1024).toFixed(0)}KB`);
      console.log(`    doc_status: ${r.doc_status} | extraction_fields: ${r.extraction_field_count}`);
      console.log('');
    });
  }

  // Show TRUE_FAILURE entries too for comparison
  const trueFailures = allResults.filter(r => r.verdict === 'TRUE_FAILURE');
  if (trueFailures.length) {
    console.log(`\n=== TRUE FAILURES (${trueFailures.length}) ===`);
    console.log('These workers genuinely failed with no visual evidence:\n');
    trueFailures.forEach(r => {
      console.log(`  ${r.worker_id} | state=${r.state} | err=${(r.last_error||'').slice(0,60)} | ${r.host}`);
    });
  }

  // Domain-level breakdown for misclassified
  const miscByHost = {};
  misclassified.forEach(r => {
    if (!miscByHost[r.host]) miscByHost[r.host] = { count: 0, errors: [] };
    miscByHost[r.host].count++;
    const errType = (r.last_error || '').includes('timed out') ? 'timeout' :
                    (r.last_error || '').includes('captcha') ? 'captcha' :
                    (r.last_error || '').includes('blocked:') ? 'blocked' : 'other';
    if (!miscByHost[r.host].errors.includes(errType)) miscByHost[r.host].errors.push(errType);
  });
  if (Object.keys(miscByHost).length) {
    console.log('\n=== MISCLASSIFIED BY DOMAIN ===');
    Object.entries(miscByHost).sort((a,b) => b[1].count - a[1].count).forEach(([host, d]) => {
      console.log(`  ${host.padEnd(35)} ${d.count}x misclassified [${d.errors.join(',')}]`);
    });
  }

  // Write full data
  fs.writeFileSync(OUT, JSON.stringify(allResults, null, 2));
  console.log(`\nFull data: ${OUT}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
