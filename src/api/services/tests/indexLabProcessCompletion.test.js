import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { handleIndexLabProcessCompletion } from '../indexLabProcessCompletion.js';

async function createReconciliationWorkspace(testContext, prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  testContext.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const indexLabRoot = path.join(root, 'indexlab');
  await fs.mkdir(indexLabRoot, { recursive: true });
  return { root, indexLabRoot };
}

async function writeUtf8(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

test('indexlab completion ignores non-indexlab commands', async () => {
  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['category-compile', '--category', 'mouse'],
  });

  assert.equal(result, null);
});

test('indexlab completion returns null for successful indexlab runs', async (t) => {
  const { indexLabRoot } = await createReconciliationWorkspace(t, 'spec-factory-indexlab-ok-');
  const runId = 'run-ok-001';

  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-razer-viper-v3-pro',
      started_at: '2026-02-24T00:00:00.000Z',
      ended_at: '2026-02-24T00:02:00.000Z',
    }, null, 2),
  );

  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['indexlab', '--local', '--category', 'mouse', '--product-id', 'mouse-razer-viper-v3-pro'],
    startedAt: '2026-02-24T00:00:01.000Z',
    indexLabRoot,
    broadcastWs: () => {},
    logError: () => {},
  });

  assert.equal(result, null);
});

test('indexlab completion closes running metadata and appends a terminal error event for interrupted runs', async (t) => {
  const { indexLabRoot } = await createReconciliationWorkspace(t, 'spec-factory-indexlab-interrupted-');
  const runId = 'run-interrupted-001';
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro';

  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      started_at: '2026-02-24T00:00:00.000Z',
      ended_at: '',
      status: 'running',
      stages: {
        search: { started_at: '2026-02-24T00:00:00.000Z', ended_at: '2026-02-24T00:00:05.000Z' },
        fetch: { started_at: '2026-02-24T00:00:05.000Z', ended_at: '' },
        parse: { started_at: '', ended_at: '' },
        index: { started_at: '', ended_at: '' },
      },
    }, null, 2),
  );
  await writeUtf8(
    path.join(indexLabRoot, runId, 'run_events.ndjson'),
    `${JSON.stringify({
      run_id: runId,
      ts: '2026-02-24T00:00:05.000Z',
      stage: 'fetch',
      event: 'fetch_started',
      payload: { url: 'https://example.com/spec' },
    })}\n`,
  );

  const result = await handleIndexLabProcessCompletion({
    exitCode: null,
    cliArgs: ['indexlab', '--local', '--run-id', runId, '--category', category, '--product-id', productId],
    startedAt: '2026-02-24T00:00:01.000Z',
    indexLabRoot,
    broadcastWs: () => {},
    logError: () => {},
  });

  assert.equal(result, null);

  const reconciledMeta = JSON.parse(await fs.readFile(path.join(indexLabRoot, runId, 'run.json'), 'utf8'));
  const reconciledEvents = (await fs.readFile(path.join(indexLabRoot, runId, 'run_events.ndjson'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const terminalEvent = reconciledEvents.at(-1);

  assert.equal(reconciledMeta.status, 'failed');
  assert.equal(typeof reconciledMeta.ended_at, 'string');
  assert.notEqual(reconciledMeta.ended_at, '');
  assert.equal(reconciledMeta.stages.fetch.ended_at, reconciledMeta.ended_at);
  assert.equal(terminalEvent?.event, 'error');
  assert.equal(terminalEvent?.stage, 'error');
  assert.equal(terminalEvent?.payload?.event, 'process_interrupted');
});

test('indexlab completion reconciles exit-code-1 runs as failed', async (t) => {
  const { indexLabRoot } = await createReconciliationWorkspace(t, 'spec-factory-indexlab-killed-');
  const runId = 'run-killed-001';
  const category = 'monitor';
  const productId = 'monitor-dell-u2724d';

  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      started_at: '2026-02-24T00:00:00.000Z',
    }, null, 2),
  );

  const result = await handleIndexLabProcessCompletion({
    exitCode: 1,
    cliArgs: ['indexlab', '--local', '--run-id', runId, '--category', category, '--product-id', productId],
    startedAt: '2026-02-24T00:00:01.000Z',
    indexLabRoot,
    broadcastWs: () => {},
    logError: () => {},
  });

  assert.equal(result, null);

  const reconciledMeta = JSON.parse(await fs.readFile(path.join(indexLabRoot, runId, 'run.json'), 'utf8'));
  assert.equal(reconciledMeta.status, 'failed');
});
