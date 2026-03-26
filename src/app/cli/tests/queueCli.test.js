import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCliJsonHarness } from '../../../cli/tests/helpers/cliJsonHarness.js';
import { createLocalCliWorkspace } from './helpers/localCliWorkspaceHarness.js';

test('queue CLI supports add/list/stats/pause/retry/clear lifecycle', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-queue-cli-');

  // WHY: CATEGORY_AUTHORITY_ROOT must point to the temp dir so the CLI doesn't
  // load the real user-settings.json (which overrides localOutputRoot).
  const env = { CATEGORY_AUTHORITY_ROOT: workspace.tempRoot };
  const add = await runCli([
    'queue', 'add',
    '--category', 'mouse',
    '--brand', 'Logitech',
    '--model', 'G Pro X Superlight 2',
    '--variant', 'Wireless',
    '--priority', '2',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(add.command, 'queue');
  assert.equal(add.action, 'add');
  assert.equal(add.product.status, 'pending');
  const productId = add.product.productId;

  const list = await runCli([
    'queue', 'list',
    '--category', 'mouse',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(list.count, 1);
  assert.equal(list.products[0].productId, productId);

  const stats = await runCli([
    'queue', 'stats',
    '--category', 'mouse',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(stats.total_products, 1);
  assert.equal(stats.status.pending, 1);

  const paused = await runCli([
    'queue', 'pause',
    '--category', 'mouse',
    '--product-id', productId,
    ...workspace.localArgs(),
  ], { env });
  assert.equal(paused.product.status, 'paused');

  const retried = await runCli([
    'queue', 'retry',
    '--category', 'mouse',
    '--product-id', productId,
    ...workspace.localArgs(),
  ], { env });
  assert.equal(retried.product.status, 'pending');
  assert.equal(retried.product.retry_count, 0);

  const cleared = await runCli([
    'queue', 'clear',
    '--category', 'mouse',
    '--status', 'pending',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(cleared.removed_count, 1);

  const afterClear = await runCli([
    'queue', 'list',
    '--category', 'mouse',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(afterClear.count, 0);
});

test('queue add-batch imports csv and writes queue rows', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-queue-cli-batch-');
  const csvPath = path.join(workspace.tempRoot, 'batch.csv');

  const env = { CATEGORY_AUTHORITY_ROOT: workspace.tempRoot };
  await fs.mkdir(workspace.tempRoot, { recursive: true });
  await fs.writeFile(
    csvPath,
    [
      'brand,model,variant,seed_urls',
      'Razer,Viper V3 Pro,Wireless,https://www.razer.com',
      'Logitech,G Pro X Superlight 2,Wireless,https://www.logitechg.com',
    ].join('\n'),
    'utf8',
  );

  const batch = await runCli([
    'queue', 'add-batch',
    '--category', 'mouse',
    '--file', csvPath,
    ...workspace.localArgs(),
  ], { env });
  assert.equal(batch.command, 'queue');
  assert.equal(batch.action, 'add-batch');
  assert.equal(batch.job_count, 2);

  const list = await runCli([
    'queue', 'list',
    '--category', 'mouse',
    '--limit', '10',
    ...workspace.localArgs(),
  ], { env });
  assert.equal(list.count >= 2, true);
});

test('queue CLI surfaces missing-product errors for pause through the top-level command surface', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-queue-cli-missing-');
  const env = { CATEGORY_AUTHORITY_ROOT: workspace.tempRoot };

  await assert.rejects(
    runCli([
      'queue', 'pause',
      '--category', 'mouse',
      '--product-id', 'mouse-missing',
      ...workspace.localArgs(),
    ], { env }),
    /queue pause could not find product 'mouse-missing'/,
  );
});
