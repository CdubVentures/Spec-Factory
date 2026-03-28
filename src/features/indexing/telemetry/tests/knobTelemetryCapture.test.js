import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureKnobSnapshot,
} from '../knobTelemetryCapture.js';

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

