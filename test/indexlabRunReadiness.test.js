import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  listIndexLabRuns
} from '../src/api/routes/indexlabDataBuilders.js';

function storageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null
  };
}

async function writeRun({
  indexLabRoot,
  runId,
  startedAt,
  withNeedset,
  withSearchProfile
}) {
  const runDir = path.join(indexLabRoot, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category: 'mouse',
    product_id: `mouse-${runId}`,
    status: 'completed',
    started_at: startedAt,
    ended_at: startedAt,
    counters: {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0
    }
  })}\n`, 'utf8');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), '', 'utf8');
  if (withNeedset) {
    await fs.writeFile(path.join(runDir, 'needset.json'), `${JSON.stringify({
      run_id: runId,
      total_fields: 0,
      needset_size: 0,
      needs: []
    })}\n`, 'utf8');
  }
  if (withSearchProfile) {
    await fs.writeFile(path.join(runDir, 'search_profile.json'), `${JSON.stringify({
      run_id: runId,
      status: 'pending',
      query_rows: [],
      queries: []
    })}\n`, 'utf8');
  }
}

test('listIndexLabRuns includes artifact readiness flags for needset and search profile', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-run-ready-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  await writeRun({
    indexLabRoot,
    runId: 'run-ready',
    startedAt: '2026-02-21T00:00:00.000Z',
    withNeedset: true,
    withSearchProfile: true
  });
  await writeRun({
    indexLabRoot,
    runId: 'run-missing',
    startedAt: '2026-02-20T00:00:00.000Z',
    withNeedset: false,
    withSearchProfile: false
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: storageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const rows = await listIndexLabRuns({ limit: 10 });
    const ready = rows.find((row) => row.run_id === 'run-ready');
    const missing = rows.find((row) => row.run_id === 'run-missing');

    assert.ok(ready);
    assert.ok(missing);

    assert.equal(ready.has_needset, true);
    assert.equal(ready.has_search_profile, true);
    assert.equal(missing.has_needset, false);
    assert.equal(missing.has_search_profile, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
