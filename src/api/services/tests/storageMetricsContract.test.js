// WHY: Contract test for storage metrics computation.
// Verifies computeRunStorageMetrics returns correct shape, totals, and breakdown.

import { describe, it, before, after } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  computeRunStorageMetrics,
} from '../storageMetricsService.js';

const KNOWN_ARTIFACT_TYPES = ['indexlab', 'run_output', 'runtime_traces'];

function assertBreakdownEntry(entry) {
  ok(typeof entry.type === 'string', 'type is string');
  ok(typeof entry.count === 'number', 'count is number');
  ok(typeof entry.size_bytes === 'number', 'size_bytes is number');
  ok(typeof entry.path === 'string', 'path is string');
  ok(entry.count >= 0, 'count >= 0');
  ok(entry.size_bytes >= 0, 'size_bytes >= 0');
}

describe('computeRunStorageMetrics', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-metrics-test-'));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('returns correct shape for a populated directory', async () => {
    const runDir = path.join(tmpDir, 'populated-run');
    const indexlabDir = path.join(runDir, 'indexlab');
    const runOutputDir = path.join(runDir, 'run_output');
    await fs.mkdir(indexlabDir, { recursive: true });
    await fs.mkdir(runOutputDir, { recursive: true });

    await fs.writeFile(path.join(indexlabDir, 'run.json'), '{"run_id":"test"}');
    await fs.writeFile(path.join(runOutputDir, 'output.json'), '{"data":true}');

    const result = await computeRunStorageMetrics(runDir);

    ok(typeof result.total_size_bytes === 'number', 'total_size_bytes is number');
    ok(result.total_size_bytes > 0, 'total_size_bytes > 0');
    ok(Array.isArray(result.artifact_breakdown), 'artifact_breakdown is array');
    ok(typeof result.computed_at === 'string', 'computed_at is ISO string');
    ok(!isNaN(Date.parse(result.computed_at)), 'computed_at is valid date');
  });

  it('total_size_bytes equals sum of all artifact_breakdown size_bytes', async () => {
    const runDir = path.join(tmpDir, 'sum-check-run');
    const indexlabDir = path.join(runDir, 'indexlab');
    const runOutputDir = path.join(runDir, 'run_output');

    await fs.mkdir(indexlabDir, { recursive: true });
    await fs.mkdir(runOutputDir, { recursive: true });

    await fs.writeFile(path.join(indexlabDir, 'run.json'), 'A'.repeat(100));
    await fs.writeFile(path.join(runOutputDir, 'output.json'), 'B'.repeat(200));

    const result = await computeRunStorageMetrics(runDir);
    const breakdownSum = result.artifact_breakdown.reduce((s, e) => s + e.size_bytes, 0);
    strictEqual(result.total_size_bytes, breakdownSum, 'total = sum of breakdown');
  });

  it('each breakdown entry has type, count, size_bytes, path', async () => {
    const runDir = path.join(tmpDir, 'shape-check-run');
    const indexlabDir = path.join(runDir, 'indexlab');

    await fs.mkdir(indexlabDir, { recursive: true });
    await fs.writeFile(path.join(indexlabDir, 'run.json'), '{}');

    const result = await computeRunStorageMetrics(runDir);
    ok(result.artifact_breakdown.length >= 1, 'at least 1 breakdown entry');
    for (const entry of result.artifact_breakdown) {
      assertBreakdownEntry(entry);
    }
  });

  it('correctly counts files per artifact type', async () => {
    const runDir = path.join(tmpDir, 'count-check-run');
    const indexlabDir = path.join(runDir, 'indexlab');

    await fs.mkdir(indexlabDir, { recursive: true });
    await fs.writeFile(path.join(indexlabDir, 'run.json'), '{}');
    await fs.writeFile(path.join(indexlabDir, 'needset.json'), '{}');
    await fs.writeFile(path.join(indexlabDir, 'search_profile.json'), '{}');

    const result = await computeRunStorageMetrics(runDir);
    const indexlabEntry = result.artifact_breakdown.find(e => e.type === 'indexlab');
    ok(indexlabEntry, 'indexlab entry exists');
    strictEqual(indexlabEntry.count, 3, 'indexlab has 3 files');
    strictEqual(indexlabEntry.path, 'indexlab/', 'path ends with slash');
  });

  it('returns zero-shape for an empty directory', async () => {
    const runDir = path.join(tmpDir, 'empty-run');
    await fs.mkdir(runDir, { recursive: true });

    const result = await computeRunStorageMetrics(runDir);
    strictEqual(result.total_size_bytes, 0, 'total is 0');
    deepStrictEqual(result.artifact_breakdown, [], 'breakdown is empty');
    ok(typeof result.computed_at === 'string');
  });

  it('returns zero-shape for a missing directory', async () => {
    const runDir = path.join(tmpDir, 'does-not-exist');

    const result = await computeRunStorageMetrics(runDir);
    strictEqual(result.total_size_bytes, 0, 'total is 0');
    deepStrictEqual(result.artifact_breakdown, [], 'breakdown is empty');
    ok(typeof result.computed_at === 'string');
  });

  it('handles files at root level (outside known artifact subdirectories)', async () => {
    const runDir = path.join(tmpDir, 'root-files-run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'manifest.json'), '{"root":true}');

    const result = await computeRunStorageMetrics(runDir);
    ok(result.total_size_bytes > 0, 'counts root-level files');
    const rootEntry = result.artifact_breakdown.find(e => e.type === 'other');
    ok(rootEntry, 'root files grouped under "other"');
    strictEqual(rootEntry.count, 1);
  });

  it('only includes known artifact types plus "other"', async () => {
    const runDir = path.join(tmpDir, 'types-check-run');
    const indexlabDir = path.join(runDir, 'indexlab');
    const unknownDir = path.join(runDir, 'mystery_folder');

    await fs.mkdir(indexlabDir, { recursive: true });
    await fs.mkdir(unknownDir, { recursive: true });
    await fs.writeFile(path.join(indexlabDir, 'run.json'), '{}');
    await fs.writeFile(path.join(unknownDir, 'data.bin'), 'binary');

    const result = await computeRunStorageMetrics(runDir);
    const validTypes = [...KNOWN_ARTIFACT_TYPES, 'other'];
    for (const entry of result.artifact_breakdown) {
      ok(validTypes.includes(entry.type), `type "${entry.type}" is valid`);
    }
  });

  it('recurses into nested subdirectories', async () => {
    const runDir = path.join(tmpDir, 'nested-run');
    const nestedDir = path.join(runDir, 'runtime_traces', 'screenshots', 'round1');

    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(nestedDir, 'frame001.png'), 'X'.repeat(500));
    await fs.writeFile(path.join(nestedDir, 'frame002.png'), 'Y'.repeat(500));

    const result = await computeRunStorageMetrics(runDir);
    const tracesEntry = result.artifact_breakdown.find(e => e.type === 'runtime_traces');
    ok(tracesEntry, 'runtime_traces entry exists');
    strictEqual(tracesEntry.count, 2, 'counts nested files');
    strictEqual(tracesEntry.size_bytes, 1000, 'sums nested sizes');
  });
});
