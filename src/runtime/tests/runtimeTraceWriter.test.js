import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuntimeTraceWriter } from '../runtimeTraceWriter.js';

async function makeTempRunDir() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'trace-test-'));
  const runDir = path.join(tempRoot, 'test-run-1');
  return { tempRoot, runDir };
}

async function cleanupTemp(tempRoot) {
  try { await fsp.rm(tempRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
}

// --- Filesystem-based trace writing ---

test('writeJson creates trace file on disk at {runDir}/traces/{section}/{prefix_000.json}', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  try {
    const writer = new RuntimeTraceWriter({ runDir, runId: 'run-1', productId: 'mouse-1' });
    const out = await writer.writeJson({ section: 'llm', prefix: 'call', payload: { q: 'x' } });

    assert.ok(out.trace_path.includes(path.join('traces', 'llm', 'call_000.json')));
    assert.ok(fs.existsSync(out.trace_path), `trace file should exist: ${out.trace_path}`);
    const content = JSON.parse(await fsp.readFile(out.trace_path, 'utf8'));
    assert.equal(content.q, 'x');
  } finally {
    await cleanupTemp(tempRoot);
  }
});

test('appendJsonl creates NDJSON file on disk and appends rows', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  try {
    const writer = new RuntimeTraceWriter({ runDir, runId: 'run-2', productId: 'mouse-2' });

    await writer.appendJsonl({ section: 'fields', filename: 'timeline.jsonl', row: { field: 'weight', value: '54' } });
    await writer.appendJsonl({ section: 'fields', filename: 'timeline.jsonl', row: { field: 'sensor', value: 'PAW3950' } });

    const out = writer; // just verify file content
    const expectedPath = path.join(runDir, 'traces', 'fields', 'timeline.jsonl');
    assert.ok(fs.existsSync(expectedPath), `NDJSON file should exist: ${expectedPath}`);
    const lines = (await fsp.readFile(expectedPath, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).field, 'weight');
    assert.equal(JSON.parse(lines[1]).field, 'sensor');
  } finally {
    await cleanupTemp(tempRoot);
  }
});

test('writeText creates text file on disk', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  try {
    const writer = new RuntimeTraceWriter({ runDir, runId: 'run-3', productId: 'mouse-3' });
    const out = await writer.writeText({ section: 'planner', prefix: 'plan', text: 'hello world', extension: 'txt' });

    assert.ok(out.trace_path.includes(path.join('traces', 'planner', 'plan_000.txt')));
    assert.ok(fs.existsSync(out.trace_path));
    const content = await fsp.readFile(out.trace_path, 'utf8');
    assert.equal(content, 'hello world');
  } finally {
    await cleanupTemp(tempRoot);
  }
});

test('nested trace directories are created automatically', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  try {
    const writer = new RuntimeTraceWriter({ runDir, runId: 'run-4', productId: 'mouse-4' });
    const out = await writer.writeJson({ section: 'search', prefix: 'query', payload: { q: 'test' } });

    const traceDir = path.join(runDir, 'traces', 'search');
    assert.ok(fs.existsSync(traceDir), `trace directory should be created: ${traceDir}`);
    assert.ok(fs.existsSync(out.trace_path));
  } finally {
    await cleanupTemp(tempRoot);
  }
});

test('ring slots reuse filenames for bounded traces', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  try {
    const writer = new RuntimeTraceWriter({ runDir, runId: 'run-5', productId: 'mouse-5' });
    const paths = [];
    for (let i = 0; i < 6; i += 1) {
      const row = await writer.writeJson({ section: 'fetch', prefix: 'fetch', payload: { idx: i }, ringSize: 3 });
      paths.push(row.trace_path);
    }
    const unique = new Set(paths);
    assert.equal(unique.size, 3, 'ring of 3 should produce exactly 3 unique paths');

    // Verify last write overwrote slot 0 (idx=3), slot 1 (idx=4), slot 2 (idx=5)
    const content = JSON.parse(await fsp.readFile(paths[0], 'utf8'));
    assert.equal(content.idx, 3, 'slot 0 should contain the 4th write (ring wraparound)');
  } finally {
    await cleanupTemp(tempRoot);
  }
});

test('trace_path is an absolute filesystem path', async () => {
  const { tempRoot, runDir } = await makeTempRunDir();
  try {
    const writer = new RuntimeTraceWriter({ runDir, runId: 'run-6', productId: 'mouse-6' });
    const out = await writer.writeJson({ section: 'llm', prefix: 'call', payload: {} });

    assert.ok(path.isAbsolute(out.trace_path), `trace_path should be absolute: ${out.trace_path}`);
  } finally {
    await cleanupTemp(tempRoot);
  }
});
