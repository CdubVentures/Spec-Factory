import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeCli } from '../spec.js';
import { createCliJsonHarness } from './helpers/cliJsonHarness.js';

function localArgs({ inputRoot, outputRoot, importsRoot }) {
  return [
    '--local',
    '--output-mode', 'local',
    '--local-input-root', inputRoot,
    '--local-output-root', outputRoot,
    '--imports-root', importsRoot
  ];
}

async function ensureFile(filePath, content = '') {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(content), 'utf8');
}

async function captureCliUsage(argv = []) {
  const stdout = [];
  const stderr = [];
  const result = await executeCli(argv, {
    stdout: {
      write(chunk) {
        stdout.push(String(chunk));
      },
    },
    stderr: {
      write(chunk) {
        stderr.push(String(chunk));
      },
    },
  });
  return {
    result,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
  };
}

test('CLI usage advertises canonical expansion commands without the retired phase10 alias', async () => {
  const { result, stdout } = await captureCliUsage([]);

  assert.equal(result.exitCode, 1);
  assert.equal(stdout.includes('expansion-bootstrap'), true);
  assert.equal(stdout.includes('hardening-harness'), true);
  assert.equal(stdout.includes('hardening-report'), true);
  assert.equal(stdout.includes('phase10-bootstrap'), false);
});

test('retired phase10 bootstrap alias is rejected at the CLI dispatcher boundary', async () => {
  const sink = {
    write() {
      return true;
    },
  };

  await assert.rejects(
    executeCli(['phase10-bootstrap'], { stdout: sink, stderr: sink }),
    /Unknown command: phase10-bootstrap/,
  );
});

test('expansion bootstrap/harness/report CLI commands execute with expected outputs', async () => {
  const runCli = createCliJsonHarness();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-expansion-cli-'));
  const inputRoot = path.join(tempRoot, 'fixtures');
  const outputRoot = path.join(tempRoot, 'out');
  const importsRoot = path.join(tempRoot, 'imports');
  const helperRoot = path.join(tempRoot, 'category_authority');
  const categoriesRoot = path.join(tempRoot, 'categories');
  const goldenRoot = path.join(tempRoot, 'fixtures', 'golden');
  const complianceRoot = path.join(tempRoot, 'compliance_repo');

  try {
    const specDbDir = path.join(tempRoot, 'db');
    const env = { CATEGORY_AUTHORITY_ROOT: tempRoot, SPEC_DB_DIR: specDbDir };

    const bootstrap = await runCli([
      'expansion-bootstrap',
      '--categories', 'monitor,keyboard',
      '--helper-root', helperRoot,
      '--categories-root', categoriesRoot,
      '--golden-root', goldenRoot,
      ...localArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(bootstrap.command, 'expansion-bootstrap');
    assert.equal(bootstrap.categories_count, 2);
    assert.equal(Array.isArray(bootstrap.rows), true);

    const harness = await runCli([
      'hardening-harness',
      '--category', 'monitor',
      '--products', '25',
      '--cycles', '10',
      '--fuzz-iterations', '60',
      '--seed', '17',
      '--failure-attempts', '2',
      ...localArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(harness.command, 'hardening-harness');
    assert.equal(harness.passed, true);
    assert.equal(harness.fuzz_source_health.passed, true);

    await ensureFile(path.join(complianceRoot, 'README.md'), '# hardening report\n');
    await ensureFile(path.join(complianceRoot, '.gitignore'), '.env\nnode_modules/\n');
    await ensureFile(
      path.join(complianceRoot, 'package.json'),
      JSON.stringify({
        name: 'compliance-pass',
        version: '1.0.0',
        engines: { node: '>=20' },
        dependencies: { example: '1.2.3' },
        scripts: { test: 'node --test' }
      }, null, 2)
    );
    await ensureFile(path.join(complianceRoot, 'package-lock.json'), '{}\n');
    await ensureFile(path.join(complianceRoot, 'docs', 'ARCHITECTURE.md'), '# a\n');
    await ensureFile(path.join(complianceRoot, 'docs', 'NEW-CATEGORY-GUIDE.md'), '# a\n');
    await ensureFile(path.join(complianceRoot, 'docs', 'RUNBOOK.md'), '# a\n');
    await ensureFile(path.join(complianceRoot, 'docs', 'API-REFERENCE.md'), '# a\n');

    const report = await runCli([
      'hardening-report',
      '--root-dir', complianceRoot,
      ...localArgs({ inputRoot, outputRoot, importsRoot })
    ], { env });
    assert.equal(report.command, 'hardening-report');
    assert.equal(report.passed, true);
    assert.equal(report.docs_missing_count, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
