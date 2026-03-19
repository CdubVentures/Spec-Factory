import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { maybeEmitRepairQuery } from '../src/features/indexing/orchestration/index.js';

/**
 * Phase 0 rollout proof: end-to-end Phase 04 → Phase 06B repair handoff.
 *
 * This test proves that:
 * 1. Phase 04 maybeEmitRepairQuery emits a repair_query_enqueued event
 * 2. The emitted event, written to the run event stream, is consumed by
 *    the Phase 06B automation queue builder
 * 3. The builder produces a repair_search job with the correct domain,
 *    query, field_targets, and reason_tags
 * 4. Dedupe prevents duplicate repair jobs for the same domain
 */

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

async function waitForHttpReady(url, timeoutMs = 25_000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timeout_waiting_for_http_ready:${url}`);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(filePath, rows) {
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${text}\n`, 'utf8');
}

test('Phase 04 repair emission flows through Phase 06B automation queue as repair_search job', { timeout: 60_000 }, async (t) => {
  // --- Step 1: Call maybeEmitRepairQuery (Phase 04 emission side) ---
  const emittedEvents = [];
  const dedupe = new Set();

  const emitted = maybeEmitRepairQuery({
    repairSearchEnabled: true,
    repairDedupeRule: 'domain_once',
    source: { host: 'corsair.com', url: 'https://corsair.com/m55-wireless' },
    sourceUrl: 'https://corsair.com/m55-wireless',
    statusCode: 404,
    reason: 'status_404',
    cooldownUntil: '2026-03-09T12:00:00.000Z',
    repairQueryByDomain: dedupe,
    config: { searchEngines: 'bing,google-proxy,duckduckgo' },
    requiredFields: ['polling_rate', 'sensor', 'weight_g'],
    jobIdentityLock: { brand: 'Corsair', model: 'M55 Wireless', variant: '' },
    logger: {
      info: (eventName, payload) => {
        emittedEvents.push({ eventName, payload });
      }
    },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase().trim(),
    hostFromHttpUrlFn: (url) => {
      try { return new URL(url).hostname; } catch { return ''; }
    },
    buildRepairSearchQueryFn: ({ domain, brand, model }) =>
      `${brand} ${model} spec site:${domain}`.trim(),
  });

  // Verify Phase 04 emitted correctly
  assert.equal(emitted, true, 'maybeEmitRepairQuery should emit');
  assert.equal(emittedEvents.length, 1, 'exactly one event emitted');
  assert.equal(emittedEvents[0].eventName, 'repair_query_enqueued');
  assert.equal(emittedEvents[0].payload.domain, 'corsair.com');
  assert.equal(emittedEvents[0].payload.query, 'Corsair M55 Wireless spec site:corsair.com');
  assert.deepEqual(emittedEvents[0].payload.field_targets, ['polling_rate', 'sensor', 'weight_g']);

  // Verify dedupe suppresses second call for same domain
  const secondEmit = maybeEmitRepairQuery({
    repairSearchEnabled: true,
    repairDedupeRule: 'domain_once',
    source: { host: 'corsair.com', url: 'https://corsair.com/other-page' },
    repairQueryByDomain: dedupe,
    logger: { info: (name, payload) => emittedEvents.push({ eventName: name, payload }) },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase().trim(),
    hostFromHttpUrlFn: () => 'corsair.com',
    buildRepairSearchQueryFn: () => 'should not be called',
  });
  assert.equal(secondEmit, false, 'dedupe should suppress second emission for same domain');
  assert.equal(emittedEvents.length, 1, 'no additional event emitted after dedupe');

  // --- Step 2: Write the emitted event to disk as run_events.ndjson ---
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-handoff-e2e-'));
  const indexlabRoot = path.join(tempRoot, 'indexlab');
  const helperRoot = path.join(tempRoot, 'category_authority');
  const runId = 'run-repair-handoff-e2e-001';
  const category = 'mouse';
  const productId = 'mouse-corsair-m55-wireless';
  const runDir = path.join(indexlabRoot, runId);
  const now = '2026-03-09T10:00:00.000Z';

  await writeJson(path.join(runDir, 'run.json'), {
    run_id: runId,
    category,
    product_id: productId,
    status: 'completed',
    started_at: now,
    ended_at: '2026-03-09T10:04:00.000Z'
  });

  await writeJson(path.join(runDir, 'search_profile.json'), {
    run_id: runId,
    category,
    product_id: productId,
    provider: 'searxng',
    query_rows: []
  });

  await writeJson(path.join(runDir, 'needset.json'), {
    run_id: runId,
    category,
    product_id: productId,
    generated_at: now,
    needset_size: 3,
    total_fields: 75,
    needs: [
      { field_key: 'polling_rate', required_level: 'critical', need_score: 18.0, reasons: ['missing'] },
      { field_key: 'sensor', required_level: 'required', need_score: 12.0, reasons: ['missing'] },
      { field_key: 'weight_g', required_level: 'required', need_score: 10.0, reasons: ['missing'] }
    ]
  });

  // Transform Phase 04 emitted event into the run_events.ndjson format
  const capturedPayload = emittedEvents[0].payload;
  await writeJsonl(path.join(runDir, 'run_events.ndjson'), [
    {
      run_id: runId,
      category,
      product_id: productId,
      ts: '2026-03-09T10:01:00.000Z',
      stage: 'scheduler',
      event: emittedEvents[0].eventName,
      payload: capturedPayload
    }
  ]);

  // --- Step 3: Boot the server and query the Phase 06B automation queue ---
  const port = await getFreePort();
  const proc = spawn(
    process.execPath,
    ['src/api/guiServer.js', '--port', String(port), '--local', '--indexlab-root', indexlabRoot],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOCAL_MODE: 'true',
        HELPER_FILES_ROOT: helperRoot,
        CATEGORY_AUTHORITY_ROOT: helperRoot,
      },
      stdio: ['ignore', 'ignore', 'pipe']
    }
  );

  let stderr = '';
  proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  t.after(async () => {
    if (!proc.killed) proc.kill('SIGTERM');
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await waitForHttpReady(`http://127.0.0.1:${port}/api/v1/health`);

  const target = `http://127.0.0.1:${port}/api/v1/indexlab/run/${encodeURIComponent(runId)}/automation-queue`;
  const response = await fetch(target);
  assert.equal(response.status, 200, `unexpected status ${response.status} stderr=${stderr}`);
  const result = await response.json();

  // --- Step 4: Assert Phase 06B consumed the event and produced the right job ---
  assert.equal(result.run_id, runId);
  assert.equal(Array.isArray(result.jobs), true, 'jobs should be an array');
  assert.equal(Array.isArray(result.actions), true, 'actions should be an array');

  const repairJobs = result.jobs.filter((j) => j.job_type === 'repair_search');
  assert.equal(repairJobs.length, 1, 'exactly one repair_search job from the single Phase 04 event');

  const job = repairJobs[0];
  assert.equal(job.domain, 'corsair.com', 'job domain matches Phase 04 emission');
  assert.equal(job.query, 'Corsair M55 Wireless spec site:corsair.com', 'job query matches Phase 04 emission');
  assert.equal(job.provider, 'bing,google-proxy,duckduckgo', 'job provider matches Phase 04 emission');
  assert.equal(job.source_signal, 'url_health', 'job source_signal is url_health');
  assert.equal(job.status, 'queued', 'job status is queued');

  assert.equal(job.field_targets.includes('polling_rate'), true, 'field_targets includes polling_rate');
  assert.equal(job.field_targets.includes('sensor'), true, 'field_targets includes sensor');
  assert.equal(job.field_targets.includes('weight_g'), true, 'field_targets includes weight_g');

  assert.equal(job.reason_tags.includes('status_404'), true, 'reason_tags includes status_404');
  assert.equal(job.reason_tags.includes('phase_04_signal'), true, 'reason_tags includes phase_04_signal');

  // Verify the action audit trail recorded the handoff
  const repairActions = result.actions.filter((a) => a.job_type === 'repair_search');
  assert.equal(repairActions.length >= 1, true, 'at least one repair_search action in the audit trail');
  assert.equal(repairActions[0].event, 'repair_query_enqueued', 'action event matches');
  assert.equal(repairActions[0].domain, 'corsair.com', 'action domain matches');
});
