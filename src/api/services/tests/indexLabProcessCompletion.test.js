import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { handleIndexLabProcessCompletion } from '../indexLabProcessCompletion.js';

async function writeUtf8(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('handleIndexLabProcessCompletion relocates successful indexlab runs and emits relocation event', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-indexlab-complete-'));
  const outputRoot = path.join(tempRoot, 'out');
  const indexLabRoot = path.join(tempRoot, 'artifacts', 'indexlab');
  const destinationRoot = path.join(tempRoot, 'archive');

  const runId = 'run-complete-001';
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro';

  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      started_at: '2026-02-24T00:00:00.000Z',
      ended_at: '2026-02-24T00:02:00.000Z',
      run_base: `specs/outputs/${category}/${productId}/runs/${runId}`,
      latest_base: `specs/outputs/${category}/${productId}/latest`,
    }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', category, productId, 'runs', runId, 'summary.json'),
    JSON.stringify({ ok: true, run_id: runId }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', '_runtime', 'traces', 'runs', runId, productId, 'phase.json'),
    JSON.stringify({ run_id: runId }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, '_runtime', 'events.jsonl'),
    `${JSON.stringify({ run_id: runId, event: 'run_completed' })}\n`,
  );

  const emitted = [];
  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['indexlab', '--local', '--category', category, '--product-id', productId],
    startedAt: '2026-02-24T00:00:01.000Z',
    runDataStorageSettings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
    },
    indexLabRoot,
    outputRoot,
    outputPrefix: 'specs/outputs',
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    logError: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.run_id, runId);

  const archiveRoot = path.join(destinationRoot, category, productId, runId);
  assert.equal(await pathExists(path.join(archiveRoot, 'indexlab', 'run.json')), true);
  assert.equal(await pathExists(path.join(archiveRoot, 'run_output', 'summary.json')), true);

  const relocationEvents = emitted
    .filter((item) => item.channel === 'data-change')
    .map((item) => item.payload?.event);
  assert.deepEqual(relocationEvents, [
    'indexlab-run-data-relocation-started',
    'indexlab-run-data-relocated',
  ]);
  const processLines = emitted
    .filter((item) => item.channel === 'process')
    .flatMap((item) => (Array.isArray(item.payload) ? item.payload : []));
  assert.equal(
    processLines.some((line) => line.includes(`[storage] relocating run ${runId}`)),
    true,
  );
  assert.equal(
    processLines.some((line) => line.includes(`[storage] relocated run ${runId}`)),
    true,
  );
});

test('handleIndexLabProcessCompletion ignores non-indexlab commands', async () => {
  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['category-compile', '--category', 'mouse'],
    runDataStorageSettings: { enabled: true, destinationType: 'local', localDirectory: 'C:\\Runs' },
  });

  assert.equal(result, null);
});

test('handleIndexLabProcessCompletion relocates interrupted runs (non-zero exit code)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-indexlab-interrupted-'));
  const outputRoot = path.join(tempRoot, 'out');
  const indexLabRoot = path.join(tempRoot, 'artifacts', 'indexlab');
  const destinationRoot = path.join(tempRoot, 'archive');

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
      ended_at: '2026-02-24T00:01:30.000Z',
      run_base: `specs/outputs/${category}/${productId}/runs/${runId}`,
      latest_base: `specs/outputs/${category}/${productId}/latest`,
    }, null, 2),
  );
  await writeUtf8(
    path.join(indexLabRoot, runId, 'run_events.ndjson'),
    `${JSON.stringify({ run_id: runId, event: 'fetch_started' })}\n`,
  );

  const emitted = [];
  const result = await handleIndexLabProcessCompletion({
    exitCode: null,
    cliArgs: ['indexlab', '--local', '--category', category, '--product-id', productId],
    startedAt: '2026-02-24T00:00:01.000Z',
    runDataStorageSettings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
    },
    indexLabRoot,
    outputRoot,
    outputPrefix: 'specs/outputs',
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    logError: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.run_id, runId);

  const archiveRoot = path.join(destinationRoot, category, productId, runId);
  assert.equal(await pathExists(path.join(archiveRoot, 'indexlab', 'run.json')), true);
  assert.equal(await pathExists(path.join(archiveRoot, 'indexlab', 'run_events.ndjson')), true);

  const relocationEvents = emitted
    .filter((item) => item.channel === 'data-change')
    .map((item) => item.payload?.event);
  assert.deepEqual(relocationEvents, [
    'indexlab-run-data-relocation-started',
    'indexlab-run-data-relocated',
  ]);
});

test('handleIndexLabProcessCompletion relocates SIGKILL runs (exit code 1)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-indexlab-killed-'));
  const indexLabRoot = path.join(tempRoot, 'artifacts', 'indexlab');
  const destinationRoot = path.join(tempRoot, 'archive');

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

  const emitted = [];
  const result = await handleIndexLabProcessCompletion({
    exitCode: 1,
    cliArgs: ['indexlab', '--local', '--category', category, '--product-id', productId],
    startedAt: '2026-02-24T00:00:01.000Z',
    runDataStorageSettings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
    },
    indexLabRoot,
    outputRoot: path.join(tempRoot, 'out'),
    outputPrefix: 'specs/outputs',
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    logError: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.run_id, runId);

  const archiveRoot = path.join(destinationRoot, category, productId, runId);
  assert.equal(await pathExists(path.join(archiveRoot, 'indexlab', 'run.json')), true);
});

test('handleIndexLabProcessCompletion closes interrupted running meta and appends terminal error event before relocation', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-indexlab-replaced-'));
  const indexLabRoot = path.join(tempRoot, 'artifacts', 'indexlab');
  const destinationRoot = path.join(tempRoot, 'archive');

  const runId = 'run-replaced-001';
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
    runDataStorageSettings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
    },
    indexLabRoot,
    outputRoot: path.join(tempRoot, 'out'),
    outputPrefix: 'specs/outputs',
    broadcastWs: () => {},
    logError: () => {},
  });

  assert.equal(result?.ok, true);
  assert.equal(result?.run_id, runId);

  const archiveRoot = path.join(destinationRoot, category, productId, runId);
  const archivedMeta = JSON.parse(await fs.readFile(path.join(archiveRoot, 'indexlab', 'run.json'), 'utf8'));
  const archivedEvents = (await fs.readFile(path.join(archiveRoot, 'indexlab', 'run_events.ndjson'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const terminalEvent = archivedEvents.at(-1);

  assert.equal(archivedMeta.status, 'failed');
  assert.equal(typeof archivedMeta.ended_at, 'string');
  assert.notEqual(archivedMeta.ended_at, '');
  assert.equal(archivedMeta.stages.fetch.ended_at, archivedMeta.ended_at);
  assert.equal(terminalEvent?.event, 'error');
  assert.equal(terminalEvent?.stage, 'error');
  assert.equal(terminalEvent?.payload?.event, 'process_interrupted');
});

test('handleIndexLabProcessCompletion emits failure event when relocation throws', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-indexlab-fail-'));
  const outputRoot = path.join(tempRoot, 'out');
  const indexLabRoot = path.join(tempRoot, 'artifacts', 'indexlab');
  const destinationRoot = path.join(tempRoot, 'archive');

  const runId = 'run-fail-001';
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro';

  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      started_at: '2026-02-24T00:00:00.000Z',
      ended_at: '2026-02-24T00:01:00.000Z',
      run_base: '../../escape',
      latest_base: '',
    }, null, 2),
  );

  const emitted = [];
  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['indexlab', '--local', '--category', category, '--product-id', productId],
    startedAt: '2026-02-24T00:00:01.000Z',
    runDataStorageSettings: {
      enabled: true,
      destinationType: 'local',
      localDirectory: destinationRoot,
      awsRegion: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
    },
    indexLabRoot,
    outputRoot,
    outputPrefix: 'specs/outputs',
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    logError: () => {},
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.error, 'run_output_outside_root');
  assert.equal(result?.run_id, runId);

  const failureEvents = emitted
    .filter((item) => item.channel === 'data-change')
    .map((item) => item.payload?.event);
  assert.deepEqual(failureEvents, [
    'indexlab-run-data-relocation-started',
    'indexlab-run-data-relocation-failed',
  ]);
  const failureProcessLines = emitted
    .filter((item) => item.channel === 'process')
    .flatMap((item) => (Array.isArray(item.payload) ? item.payload : []));
  assert.equal(
    failureProcessLines.some((line) => line.includes(`[storage] relocating run ${runId}`)),
    true,
  );
  assert.equal(
    failureProcessLines.some((line) => line.includes(`[storage] relocation failed for ${runId}`)),
    true,
  );
});
