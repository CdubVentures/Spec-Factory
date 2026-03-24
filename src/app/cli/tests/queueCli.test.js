import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCliJsonHarness } from '../../../cli/tests/helpers/cliJsonHarness.js';

function baseCliArgs({ inputRoot, outputRoot, importsRoot }) {
  return [
    '--local',
    '--output-mode', 'local',
    '--local-input-root', inputRoot,
    '--local-output-root', outputRoot,
    '--imports-root', importsRoot
  ];
}

test('queue CLI supports add/list/stats/pause/retry/clear lifecycle', async () => {
  const runCli = createCliJsonHarness();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-cli-'));
  const inputRoot = path.join(tempRoot, 'fixtures');
  const outputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');

  try {
    // WHY: CATEGORY_AUTHORITY_ROOT must point to the temp dir so the CLI doesn't
    // load the real user-settings.json (which overrides localOutputRoot).
    const env = { CATEGORY_AUTHORITY_ROOT: tempRoot };
    const add = await runCli([
      'queue', 'add',
      '--category', 'mouse',
      '--brand', 'Logitech',
      '--model', 'G Pro X Superlight 2',
      '--variant', 'Wireless',
      '--priority', '2',
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(add.command, 'queue');
    assert.equal(add.action, 'add');
    assert.equal(add.product.status, 'pending');
    const productId = add.product.productId;

    const list = await runCli([
      'queue', 'list',
      '--category', 'mouse',
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(list.count, 1);
    assert.equal(list.products[0].productId, productId);

    const stats = await runCli([
      'queue', 'stats',
      '--category', 'mouse',
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(stats.total_products, 1);
    assert.equal(stats.status.pending, 1);

    const paused = await runCli([
      'queue', 'pause',
      '--category', 'mouse',
      '--product-id', productId,
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(paused.product.status, 'paused');

    const retried = await runCli([
      'queue', 'retry',
      '--category', 'mouse',
      '--product-id', productId,
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(retried.product.status, 'pending');
    assert.equal(retried.product.retry_count, 0);

    const cleared = await runCli([
      'queue', 'clear',
      '--category', 'mouse',
      '--status', 'pending',
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(cleared.removed_count, 1);

    const afterClear = await runCli([
      'queue', 'list',
      '--category', 'mouse',
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(afterClear.count, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('queue add-batch imports csv and writes queue rows', async () => {
  const runCli = createCliJsonHarness();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-cli-batch-'));
  const inputRoot = path.join(tempRoot, 'fixtures');
  const outputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');
  const csvPath = path.join(tempRoot, 'batch.csv');

  try {
    const env = { CATEGORY_AUTHORITY_ROOT: tempRoot };
    await fs.mkdir(tempRoot, { recursive: true });
    await fs.writeFile(
      csvPath,
      [
        'brand,model,variant,seed_urls',
        'Razer,Viper V3 Pro,Wireless,https://www.razer.com',
        'Logitech,G Pro X Superlight 2,Wireless,https://www.logitechg.com'
      ].join('\n'),
      'utf8'
    );

    const batch = await runCli([
      'queue', 'add-batch',
      '--category', 'mouse',
      '--file', csvPath,
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(batch.command, 'queue');
    assert.equal(batch.action, 'add-batch');
    assert.equal(batch.job_count, 2);

    const list = await runCli([
      'queue', 'list',
      '--category', 'mouse',
      '--limit', '10',
      ...baseCliArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(list.count >= 2, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
