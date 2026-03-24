import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCliJsonHarness } from '../../../cli/tests/helpers/cliJsonHarness.js';

function localArgs({ inputRoot, outputRoot, importsRoot }) {
  return [
    '--local',
    '--output-mode', 'local',
    '--local-input-root', inputRoot,
    '--local-output-root', outputRoot,
    '--imports-root', importsRoot
  ];
}

test('review CLI suggest appends a suggestion file through the top-level command surface', async () => {
  const runCli = createCliJsonHarness();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-cli-'));
  const inputRoot = path.join(tempRoot, 'fixtures');
  const outputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');
  const helperRoot = path.join(tempRoot, 'category_authority');
  const suggestionPath = path.join(helperRoot, 'mouse', '_suggestions', 'enums.json');

  try {
    const result = await runCli([
      'review', 'suggest',
      '--category', 'mouse',
      '--type', 'enum',
      '--field', 'switch_type',
      '--value', 'synthetic-optical',
      '--evidence-url', 'https://manufacturer.example/spec',
      '--evidence-quote', 'Switch Type: Synthetic Optical',
      '--product-id', 'mouse-review-cli',
      ...localArgs({ inputRoot, outputRoot, importsRoot })
    ], {
      env: { HELPER_FILES_ROOT: helperRoot }
    });

    assert.equal(result.command, 'review');
    assert.equal(result.action, 'suggest');
    assert.equal(result.appended, true);

    const saved = JSON.parse(await fs.readFile(suggestionPath, 'utf8'));
    assert.equal(saved.type, 'enum');
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].field, 'switch_type');
    assert.equal(saved.items[0].value, 'synthetic-optical');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
