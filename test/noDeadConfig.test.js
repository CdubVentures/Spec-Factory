import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Window 9: No Dead Config CI enforcement
//
// Prevents authorable knobs from being emitted without a consumer.
// Uses src/field-rules/capabilities.json as the canonical registry.
//
// FAIL conditions:
//   - Knob in capabilities.json has status other than live/ui_only/deferred
//   - Knob with status "deferred" lacks a reason
//   - Knob with status "live" lacks a consumer
//   - More than 10 deferred knobs (cap to prevent accumulation)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPABILITIES_PATH = path.join(__dirname, '..', 'src', 'field-rules', 'capabilities.json');

async function loadCapabilities() {
  const raw = await fs.readFile(CAPABILITIES_PATH, 'utf8');
  return JSON.parse(raw);
}

test('capabilities.json exists and is valid JSON', async () => {
  const cap = await loadCapabilities();
  assert.ok(cap.knobs, 'capabilities.json must have a "knobs" object');
  assert.ok(Object.keys(cap.knobs).length > 0, 'knobs must not be empty');
});

test('every knob has a valid status (live, ui_only, or deferred)', async () => {
  const cap = await loadCapabilities();
  const validStatuses = new Set(['live', 'ui_only', 'deferred']);
  const invalid = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (!validStatuses.has(config.status)) {
      invalid.push({ knob, status: config.status });
    }
  }
  assert.equal(invalid.length, 0,
    `Invalid statuses: ${JSON.stringify(invalid)}`);
});

test('every live knob has a consumer specified', async () => {
  const cap = await loadCapabilities();
  const missing = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (config.status === 'live' && !config.consumer) {
      missing.push(knob);
    }
  }
  assert.equal(missing.length, 0,
    `Live knobs without consumers: ${missing.join(', ')}`);
});

test('every deferred knob has a reason', async () => {
  const cap = await loadCapabilities();
  const missing = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (config.status === 'deferred' && !config.reason) {
      missing.push(knob);
    }
  }
  assert.equal(missing.length, 0,
    `Deferred knobs without reasons: ${missing.join(', ')}`);
});

test('deferred knob count does not exceed cap (max 10)', async () => {
  const cap = await loadCapabilities();
  const deferred = Object.entries(cap.knobs)
    .filter(([, config]) => config.status === 'deferred');
  assert.ok(deferred.length <= 10,
    `Too many deferred knobs (${deferred.length}): ${deferred.map(([k]) => k).join(', ')}. ` +
    'Either wire them or remove from the registry.');
});

test('every knob has a description', async () => {
  const cap = await loadCapabilities();
  const missing = [];
  for (const [knob, config] of Object.entries(cap.knobs)) {
    if (!config.description || !config.description.trim()) {
      missing.push(knob);
    }
  }
  assert.equal(missing.length, 0,
    `Knobs without descriptions: ${missing.join(', ')}`);
});

test('no duplicate knob names (case-insensitive)', async () => {
  const cap = await loadCapabilities();
  const seen = new Map();
  const dupes = [];
  for (const knob of Object.keys(cap.knobs)) {
    const lower = knob.toLowerCase();
    if (seen.has(lower)) {
      dupes.push({ knob, conflictsWith: seen.get(lower) });
    }
    seen.set(lower, knob);
  }
  assert.equal(dupes.length, 0,
    `Duplicate knobs: ${JSON.stringify(dupes)}`);
});

test('non-indexlab knobs remain authorable in capabilities registry', async () => {
  const cap = await loadCapabilities();
  const retainedKnobs = [
    'contract.rounding.decimals',
    'contract.rounding.mode',
    'priority.publish_gate',
    'parse.unit',
  ];

  for (const knob of retainedKnobs) {
    assert.ok(cap.knobs[knob], `${knob} should remain authorable in capabilities.json`);
  }
});

test('live AI assist knobs remain registered with consumer metadata', async () => {
  const cap = await loadCapabilities();
  const expectedLiveAiKnobs = [
    'ai_assist.mode',
    'ai_assist.model_strategy',
    'ai_assist.max_calls',
    'ai_assist.max_tokens',
    'ai_assist.reasoning_note',
  ];

  for (const knob of expectedLiveAiKnobs) {
    const config = cap.knobs[knob];
    assert.ok(config, `AI knob ${knob} should exist in capabilities.json`);
    assert.equal(config.status, 'live', `AI knob ${knob} should remain live`);
    assert.ok(
      typeof config.consumer === 'string' && config.consumer.trim().length > 0,
      `AI knob ${knob} should declare consumer metadata`,
    );
  }
});

test('capabilities summary: report live/ui_only/deferred counts', async () => {
  const cap = await loadCapabilities();
  const counts = { live: 0, ui_only: 0, deferred: 0 };
  for (const config of Object.values(cap.knobs)) {
    counts[config.status] = (counts[config.status] || 0) + 1;
  }
  const total = Object.keys(cap.knobs).length;

  // At least 20 live knobs (we have ~30+)
  assert.ok(counts.live >= 20,
    `Expected at least 20 live knobs, got ${counts.live}`);

  // Report for visibility
  assert.ok(true,
    `Capabilities: ${total} total — ${counts.live} live, ${counts.ui_only} ui_only, ${counts.deferred} deferred`);
});
