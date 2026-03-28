import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readIndexLabRunNeedSet,
  readIndexLabRunSearchProfile
} from '../indexlabDataBuilders.js';

function createStorageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null
  };
}

async function createRunFixture({
  rootDir,
  runId,
  meta,
  events
}) {
  const runDir = path.join(rootDir, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(meta)}\n`, 'utf8');
  const eventText = events.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), `${eventText}\n`, 'utf8');
}

test('readIndexLabRunNeedSet: falls back to empty payload when run exists without needset artifacts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-needset-fallback-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-needset-fallback';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z'
    },
    events: [
      {
        run_id: runId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        ts: '2026-02-20T00:01:00.000Z',
        event: 'fetch_started',
        payload: { url: 'https://example.com/search?q=test' }
      }
    ]
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const payload = await readIndexLabRunNeedSet(runId);
    assert.ok(payload && typeof payload === 'object');
    assert.ok(Array.isArray(payload.fields));
    assert.equal(payload.fields.length, 0);
    assert.equal(payload.total_fields, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// WHY: Wave 5.5 killed latest_base fallback path. Test retired.
// SQL run_artifacts is the sole source for search_profile.
