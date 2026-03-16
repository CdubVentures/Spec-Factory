import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadIndexingRunIdModule() {
  const esbuild = await import('esbuild');
  const entryPath = path.resolve(
    __dirname,
    '..',
    'tools',
    'gui-react',
    'src',
    'features',
    'indexing',
    'api',
    'indexingRunId.ts',
  );
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexing-run-id-'));
  const tmpFile = path.join(tmpDir, 'indexingRunId.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    return await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('buildRequestedRunId emits a punctuation-free UTC timestamp prefix plus hex suffix', async () => {
  const { buildRequestedRunId } = await loadIndexingRunIdModule();

  const runId = buildRequestedRunId(new Date('2026-03-10T11:22:33.456Z'));
  const [prefix, suffix] = String(runId).split('-');

  assert.equal(prefix, '20260310112233');
  assert.match(suffix, /^[0-9a-f]{6}$/);
  assert.match(runId, /^[0-9]{14}-[0-9a-f]{6}$/);
  assert.equal(/[T:.\-Z]/.test(prefix), false);
});
