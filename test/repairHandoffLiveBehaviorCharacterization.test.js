import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getFreePort,
  waitForHttpReady,
} from './integration/helpers/guiServerHttpHarness.js';

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(filePath, rows) {
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${text}\n`, 'utf8');
}

test('characterization: live-style 404 and blocked failures surface as domain_backoff plus deficit_rediscovery without repair_search', { timeout: 60_000 }, async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-handoff-live-characterization-'));
  const indexlabRoot = path.join(tempRoot, 'indexlab');
  const helperRoot = path.join(tempRoot, 'category_authority');
  const runId = 'run-repair-handoff-live-characterization-001';
  const category = 'mouse';
  const productId = 'mouse-logitech-g-pro-x-superlight-2';
  const runDir = path.join(indexlabRoot, runId);

  await writeJson(path.join(runDir, 'run.json'), {
    run_id: runId,
    category,
    product_id: productId,
    status: 'completed',
    started_at: '2026-03-09T10:00:00.000Z',
    ended_at: '2026-03-09T10:03:00.000Z'
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
    generated_at: '2026-03-09T10:02:30.000Z',
    total_fields: 75,
    rows: [
      {
        field_key: 'sensor',
        required_level: 'critical',
        priority_bucket: 'core',
        state: 'missing',
        bundle_id: null
      },
      {
        field_key: 'weight_g',
        required_level: 'required',
        priority_bucket: 'core',
        state: 'missing',
        bundle_id: null
      }
    ]
  });

  await writeJsonl(path.join(runDir, 'run_events.ndjson'), [
    {
      run_id: runId,
      category,
      product_id: productId,
      ts: '2026-03-09T10:01:00.000Z',
      stage: 'fetch',
      event: 'source_fetch_failed',
      payload: {
        url: 'https://logitechg.com/product/pro-x-superlight-2',
        host: 'logitechg.com',
        status: 404,
        outcome: 'not_found',
        message: 'HTTP 404',
        fetch_ms: 1420,
        fetcher_kind: 'http',
        host_budget_score: 6,
        host_budget_state: 'backoff'
      }
    },
    {
      run_id: runId,
      category,
      product_id: productId,
      ts: '2026-03-09T10:01:20.000Z',
      stage: 'scheduler',
      event: 'blocked_domain_cooldown_applied',
      payload: {
        host: 'logitechg.com',
        status: 403,
        blocked_count: 2,
        threshold: 2,
        removed_count: 6
      }
    }
  ]);

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
  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  t.after(async () => {
    if (!proc.killed) proc.kill('SIGTERM');
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await waitForHttpReady(`http://127.0.0.1:${port}/api/v1/health`);

  const target = `http://127.0.0.1:${port}/api/v1/indexlab/run/${encodeURIComponent(runId)}/automation-queue`;
  const response = await fetch(target);
  assert.equal(response.status, 200, `unexpected status ${response.status} stderr=${stderr}`);
  const payload = await response.json();

  assert.equal(payload.summary.repair_search, 0);
  assert.equal(payload.summary.domain_backoff >= 1, true);
  assert.equal(payload.summary.deficit_rediscovery >= 1, true);
  assert.equal(payload.jobs.some((job) => job.job_type === 'repair_search'), false);
  assert.equal(payload.jobs.some((job) => job.job_type === 'domain_backoff'), true);
  assert.equal(payload.jobs.some((job) => job.job_type === 'deficit_rediscovery'), true);
  assert.equal(payload.actions.some((action) => action.job_type === 'repair_search'), false);
});
