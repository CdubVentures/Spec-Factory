import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  captureKnobSnapshot,
  recordKnobSnapshot,
  readKnobSnapshots
} from '../knobTelemetryCapture.js';

async function withTempLog(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'knob-tel-'));
  const logPath = path.join(dir, 'knobs.ndjson');
  try {
    await fn(logPath);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

// ── captureKnobSnapshot ─────────────────────────────────────

test('captureKnobSnapshot compares config against defaults', () => {
  const defaults = { PORT: '8788', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:8788' };
  const config = { PORT: '9000', NODE_ENV: 'development', CORS_ORIGIN: 'http://localhost:8788' };

  const snap = captureKnobSnapshot(config, defaults);
  assert.ok(snap.ts);
  assert.equal(snap.total_knobs, 3);
  assert.equal(snap.mismatch_count, 1);
  assert.equal(snap.entries.length, 3);

  const portEntry = snap.entries.find((e) => e.knob === 'PORT');
  assert.equal(portEntry.config_value, '9000');
  assert.equal(portEntry.default_value, '8788');
  assert.equal(portEntry.match, false);

  const nodeEntry = snap.entries.find((e) => e.knob === 'NODE_ENV');
  assert.equal(nodeEntry.match, true);
});

test('captureKnobSnapshot handles missing config keys', () => {
  const defaults = { A: '1', B: '2' };
  const config = { A: '1' }; // B missing

  const snap = captureKnobSnapshot(config, defaults);
  assert.equal(snap.total_knobs, 2);
  const bEntry = snap.entries.find((e) => e.knob === 'B');
  assert.equal(bEntry.config_value, 'undefined');
  assert.equal(bEntry.match, false);
  assert.equal(snap.mismatch_count, 1);
});

test('captureKnobSnapshot with empty defaults returns zero entries', () => {
  const snap = captureKnobSnapshot({ A: '1' }, {});
  assert.equal(snap.total_knobs, 0);
  assert.equal(snap.entries.length, 0);
  assert.equal(snap.mismatch_count, 0);
});

// ── recordKnobSnapshot + readKnobSnapshots ──────────────────

test('recordKnobSnapshot writes NDJSON and readKnobSnapshots reads it', async () => {
  await withTempLog((logPath) => {
    const snap = { ts: '2026-03-01T00:00:00.000Z', entries: [], mismatch_count: 0, total_knobs: 0 };
    recordKnobSnapshot(snap, logPath);

    const results = readKnobSnapshots(logPath);
    assert.equal(results.length, 1);
    assert.equal(results[0].ts, '2026-03-01T00:00:00.000Z');
  });
});

test('readKnobSnapshots returns empty for missing log', () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-ks-' + Date.now() + '.ndjson');
  const results = readKnobSnapshots(missing);
  assert.deepEqual(results, []);
});

test('readKnobSnapshots sorts by ts ascending', async () => {
  await withTempLog((logPath) => {
    recordKnobSnapshot({ ts: '2026-03-03T00:00:00.000Z', entries: [], mismatch_count: 0, total_knobs: 0 }, logPath);
    recordKnobSnapshot({ ts: '2026-03-01T00:00:00.000Z', entries: [], mismatch_count: 0, total_knobs: 0 }, logPath);
    recordKnobSnapshot({ ts: '2026-03-02T00:00:00.000Z', entries: [], mismatch_count: 0, total_knobs: 0 }, logPath);

    const results = readKnobSnapshots(logPath);
    assert.equal(results.length, 3);
    assert.equal(results[0].ts, '2026-03-01T00:00:00.000Z');
    assert.equal(results[1].ts, '2026-03-02T00:00:00.000Z');
    assert.equal(results[2].ts, '2026-03-03T00:00:00.000Z');
  });
});

test('readKnobSnapshots skips malformed lines', async () => {
  await withTempLog((logPath) => {
    fs.appendFileSync(logPath, '{"ts":"2026-01-01T00:00:00.000Z","entries":[],"mismatch_count":0,"total_knobs":0}\n', 'utf8');
    fs.appendFileSync(logPath, 'not-json\n', 'utf8');
    fs.appendFileSync(logPath, '{"ts":"2026-01-02T00:00:00.000Z","entries":[],"mismatch_count":0,"total_knobs":0}\n', 'utf8');

    const results = readKnobSnapshots(logPath);
    assert.equal(results.length, 2);
  });
});
