import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCliJsonHarness } from '../../../cli/tests/helpers/cliJsonHarness.js';
import { createLocalCliWorkspace } from './helpers/localCliWorkspaceHarness.js';

test('review CLI suggest appends a suggestion file through the top-level command surface', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-review-cli-');
  const suggestionPath = path.join(workspace.helperRoot, 'mouse', '_suggestions', 'enums.json');

  const result = await runCli([
    'review', 'suggest',
    '--category', 'mouse',
    '--type', 'enum',
    '--field', 'switch_type',
    '--value', 'synthetic-optical',
    '--evidence-url', 'https://manufacturer.example/spec',
    '--evidence-quote', 'Switch Type: Synthetic Optical',
    '--product-id', 'mouse-review-cli',
    ...workspace.localArgs(),
  ], {
    env: { HELPER_FILES_ROOT: workspace.helperRoot },
  });

  assert.equal(result.command, 'review');
  assert.equal(result.action, 'suggest');
  assert.equal(result.appended, true);

  const saved = JSON.parse(await fs.readFile(suggestionPath, 'utf8'));
  assert.equal(saved.type, 'enum');
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].field, 'switch_type');
  assert.equal(saved.items[0].value, 'synthetic-optical');
  assert.equal(saved.items[0].product_id, 'mouse-review-cli');
  assert.equal(saved.items[0].evidence.url, 'https://manufacturer.example/spec');
  assert.equal(saved.items[0].evidence.quote, 'Switch Type: Synthetic Optical');
});
