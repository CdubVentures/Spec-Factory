import test from 'node:test';
import assert from 'node:assert/strict';
import { createCliJsonHarness } from '../../../cli/tests/helpers/cliJsonHarness.js';
import { createLocalCliWorkspace } from './helpers/localCliWorkspaceHarness.js';

test('review CLI suggest appends a suggestion through the top-level command surface', async (t) => {
  const runCli = createCliJsonHarness();
  const workspace = await createLocalCliWorkspace(t, 'spec-harvester-review-cli-');

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
});
