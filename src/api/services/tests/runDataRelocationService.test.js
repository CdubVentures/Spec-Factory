import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { relocateRunDataForCompletedRun } from '../runDataRelocationService.js';
import {
  createLocalRunDataStorageSettings,
  createRelocationWorkspace,
  pathExists,
  writeUtf8,
} from './helpers/runRelocationHarness.js';

test('run-data relocation archives completed run artifacts and keeps only non-run shared logs in staging', async (t) => {
  const workspace = await createRelocationWorkspace(t, 'spec-factory-run-relocate-');
  const { outputRoot, indexLabRoot, destinationRoot } = workspace;

  const runId = 'run-local-001';
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro';
  const runBase = `specs/outputs/${category}/${productId}/runs/${runId}`;
  const latestBase = `specs/outputs/${category}/${productId}/latest`;

  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', category, productId, 'runs', runId, 'logs', 'summary.json'),
    JSON.stringify({ run_id: runId, ok: true }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', '_runtime', 'traces', 'runs', runId, productId, 'phase.json'),
    JSON.stringify({ run_id: runId }, null, 2),
  );
  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({ run_id: runId, category, product_id: productId }, null, 2),
  );
  await writeUtf8(
    path.join(outputRoot, '_runtime', 'events.jsonl'),
    [
      JSON.stringify({ runId, event: 'run_started' }),
      JSON.stringify({ run_id: runId, event: 'run_completed' }),
      JSON.stringify({ runId: 'run-other', event: 'run_started' }),
    ].join('\n') + '\n',
  );
  await writeUtf8(
    path.join(outputRoot, '_billing', 'ledger', '2026-02.jsonl'),
    [
      JSON.stringify({ runId, cost_usd: 1.25 }),
      JSON.stringify({ run_id: runId, cost_usd: 0.75 }),
      JSON.stringify({ runId: 'run-other', cost_usd: 9.99 }),
    ].join('\n') + '\n',
  );

  const result = await relocateRunDataForCompletedRun({
    settings: createLocalRunDataStorageSettings(destinationRoot, {
      awsRegion: '',
      s3Prefix: '',
    }),
    runMeta: {
      run_id: runId,
      category,
      product_id: productId,
      run_base: runBase,
      latest_base: latestBase,
    },
    outputRoot,
    outputPrefix: 'specs/outputs',
    indexLabRoot,
  });

  assert.equal(result.ok, true);
  assert.equal(result.run_id, runId);

  const archiveRunRoot = path.join(destinationRoot, category, productId, runId);
  const archivedIndexLabRunJson = path.join(archiveRunRoot, 'indexlab', 'run.json');
  const archivedRunSummary = path.join(archiveRunRoot, 'run_output', 'logs', 'summary.json');

  assert.equal(await pathExists(archivedIndexLabRunJson), true);
  assert.equal(await pathExists(archivedRunSummary), true);

  // WHY: shared_logs/ staging killed — runtime events + billing are SQL-only (Wave 5.5+)
  const archivedSharedLogs = path.join(archiveRunRoot, 'shared_logs');
  assert.equal(await pathExists(archivedSharedLogs), false, 'shared_logs should not be staged');

  const sourceRunDir = path.join(outputRoot, 'specs', 'outputs', category, productId, 'runs', runId);
  const sourceIndexLabDir = path.join(indexLabRoot, runId);
  const sourceTraceRunDir = path.join(outputRoot, 'specs', 'outputs', '_runtime', 'traces', 'runs', runId);
  const sourceRuntimeEvents = path.join(outputRoot, '_runtime', 'events.jsonl');
  const sourceBillingLedger = path.join(outputRoot, '_billing', 'ledger', '2026-02.jsonl');

  // WHY: Relocation is MOVE not COPY - source directories are deleted after successful archival.
  assert.equal(await pathExists(sourceRunDir), false);
  assert.equal(await pathExists(sourceIndexLabDir), false);
  assert.equal(await pathExists(sourceTraceRunDir), false);

  // WHY: Shared JSONL pruning killed — events + billing are SQL-only.
  // Source files are left untouched (no rows removed).
  const remainingRuntimeRows = (await fs.readFile(sourceRuntimeEvents, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.equal(remainingRuntimeRows.length, 3, 'source runtime events untouched (no pruning)');

  const remainingBillingRows = (await fs.readFile(sourceBillingLedger, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.equal(remainingBillingRows.length, 3, 'source billing ledger untouched (no pruning)');
});

test('run-data relocation removes the staging directory when destination creation fails', async (t) => {
  const workspace = await createRelocationWorkspace(t, 'spec-factory-run-relocate-fail-cleanup-');
  const { tempRoot, outputRoot, indexLabRoot } = workspace;
  const localDirectoryFile = path.join(tempRoot, 'archive-file');

  const runId = 'run-local-fail-001';
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro';
  const runBase = `specs/outputs/${category}/${productId}/runs/${runId}`;
  const latestBase = `specs/outputs/${category}/${productId}/latest`;

  await writeUtf8(
    path.join(outputRoot, 'specs', 'outputs', category, productId, 'runs', runId, 'logs', 'summary.json'),
    JSON.stringify({ run_id: runId, ok: true }, null, 2),
  );
  await writeUtf8(
    path.join(indexLabRoot, runId, 'run.json'),
    JSON.stringify({ run_id: runId, category, product_id: productId }, null, 2),
  );
  await writeUtf8(localDirectoryFile, 'block-directory-create');

  const forcedStageRoot = path.join(tempRoot, 'forced-stage-root');
  const originalMkdtemp = fs.mkdtemp;
  fs.mkdtemp = async () => {
    await fs.rm(forcedStageRoot, { recursive: true, force: true });
    await fs.mkdir(forcedStageRoot, { recursive: true });
    return forcedStageRoot;
  };

  try {
    await assert.rejects(
      relocateRunDataForCompletedRun({
        settings: createLocalRunDataStorageSettings(localDirectoryFile, {
          awsRegion: '',
          s3Prefix: '',
        }),
        runMeta: {
          run_id: runId,
          category,
          product_id: productId,
          run_base: runBase,
          latest_base: latestBase,
        },
        outputRoot,
        outputPrefix: 'specs/outputs',
        indexLabRoot,
      }),
      /ENOTDIR|not a directory/i,
    );
  } finally {
    fs.mkdtemp = originalMkdtemp;
  }

  assert.equal(await pathExists(forcedStageRoot), false);
});
