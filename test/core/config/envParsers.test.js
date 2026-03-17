import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Phase 1 — Tests for envParsers.js
//
// Tests for the 8 pure parsing utility functions extracted from config.js.
// ---------------------------------------------------------------------------

const {
  parseIntEnv,
  parseFloatEnv,
  parseBoolEnv,
  parseJsonEnv,
  toTokenInt,
  parseTokenPresetList,
  clampIntFromMap,
  clampFloatFromMap
} = await import('../../../src/core/config/envParsers.js');

// =========================================================================
// parseIntEnv
// =========================================================================

test('envParsers: parseIntEnv returns parsed int from process.env', () => {
  const key = '__TEST_PARSE_INT_ENV_' + Date.now();
  process.env[key] = '42';
  try {
    assert.equal(parseIntEnv(key, 0), 42);
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseIntEnv returns default for missing env var', () => {
  assert.equal(parseIntEnv('__NONEXISTENT_' + Date.now(), 99), 99);
});

test('envParsers: parseIntEnv returns default for empty string', () => {
  const key = '__TEST_EMPTY_' + Date.now();
  process.env[key] = '';
  try {
    assert.equal(parseIntEnv(key, 7), 7);
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseIntEnv returns default for non-numeric string', () => {
  const key = '__TEST_NAN_' + Date.now();
  process.env[key] = 'not-a-number';
  try {
    assert.equal(parseIntEnv(key, 5), 5);
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseIntEnv truncates float strings to int', () => {
  const key = '__TEST_FLOAT_' + Date.now();
  process.env[key] = '3.9';
  try {
    assert.equal(parseIntEnv(key, 0), 3);
  } finally {
    delete process.env[key];
  }
});

// =========================================================================
// parseFloatEnv
// =========================================================================

test('envParsers: parseFloatEnv returns parsed float from process.env', () => {
  const key = '__TEST_FLOAT_ENV_' + Date.now();
  process.env[key] = '3.14';
  try {
    assert.equal(parseFloatEnv(key, 0), 3.14);
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseFloatEnv returns default for missing env var', () => {
  assert.equal(parseFloatEnv('__NONEXISTENT_' + Date.now(), 1.5), 1.5);
});

test('envParsers: parseFloatEnv returns default for non-numeric string', () => {
  const key = '__TEST_NAN_F_' + Date.now();
  process.env[key] = 'abc';
  try {
    assert.equal(parseFloatEnv(key, 2.5), 2.5);
  } finally {
    delete process.env[key];
  }
});

// =========================================================================
// parseBoolEnv
// =========================================================================

test('envParsers: parseBoolEnv returns true for truthy values', () => {
  const key = '__TEST_BOOL_' + Date.now();
  for (const truthy of ['1', 'true', 'yes', 'on', 'TRUE', 'Yes', 'ON']) {
    process.env[key] = truthy;
    assert.equal(parseBoolEnv(key, false), true, `${truthy} should be true`);
  }
  delete process.env[key];
});

test('envParsers: parseBoolEnv returns false for falsy values', () => {
  const key = '__TEST_BOOL_F_' + Date.now();
  for (const falsy of ['0', 'false', 'no', 'off', 'anything-else']) {
    process.env[key] = falsy;
    assert.equal(parseBoolEnv(key, true), false, `${falsy} should be false`);
  }
  delete process.env[key];
});

test('envParsers: parseBoolEnv returns default for missing env var', () => {
  assert.equal(parseBoolEnv('__NONEXISTENT_' + Date.now(), true), true);
  assert.equal(parseBoolEnv('__NONEXISTENT_' + Date.now()), false);
});

test('envParsers: parseBoolEnv returns default for empty string', () => {
  const key = '__TEST_BOOL_E_' + Date.now();
  process.env[key] = '';
  try {
    assert.equal(parseBoolEnv(key, true), true);
  } finally {
    delete process.env[key];
  }
});

// =========================================================================
// parseJsonEnv
// =========================================================================

test('envParsers: parseJsonEnv parses valid JSON object', () => {
  const key = '__TEST_JSON_' + Date.now();
  process.env[key] = '{"a":1,"b":"two"}';
  try {
    assert.deepStrictEqual(parseJsonEnv(key, {}), { a: 1, b: 'two' });
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseJsonEnv returns default for missing env var', () => {
  assert.deepStrictEqual(parseJsonEnv('__NONEXISTENT_' + Date.now(), { x: 1 }), { x: 1 });
});

test('envParsers: parseJsonEnv returns default for invalid JSON', () => {
  const key = '__TEST_BAD_JSON_' + Date.now();
  process.env[key] = '{broken json}';
  try {
    assert.deepStrictEqual(parseJsonEnv(key, { fallback: true }), { fallback: true });
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseJsonEnv returns default for non-object JSON', () => {
  const key = '__TEST_SCALAR_JSON_' + Date.now();
  process.env[key] = '"just a string"';
  try {
    assert.deepStrictEqual(parseJsonEnv(key, { def: 1 }), { def: 1 });
  } finally {
    delete process.env[key];
  }
});

test('envParsers: parseJsonEnv returns default for empty string', () => {
  const key = '__TEST_EMPTY_JSON_' + Date.now();
  process.env[key] = '';
  try {
    assert.deepStrictEqual(parseJsonEnv(key, { d: 2 }), { d: 2 });
  } finally {
    delete process.env[key];
  }
});

// =========================================================================
// toTokenInt
// =========================================================================

test('envParsers: toTokenInt parses valid positive int', () => {
  assert.equal(toTokenInt(4096, 0), 4096);
  assert.equal(toTokenInt('8192', 0), 8192);
});

test('envParsers: toTokenInt returns fallback for non-numeric', () => {
  assert.equal(toTokenInt('abc', 100), 100);
  assert.equal(toTokenInt(undefined, 200), 200);
  assert.equal(toTokenInt(null, 300), 300);
});

test('envParsers: toTokenInt clamps negative to 0', () => {
  assert.equal(toTokenInt(-100, 0), 0);
});

// =========================================================================
// parseTokenPresetList
// =========================================================================

test('envParsers: parseTokenPresetList parses comma-separated list', () => {
  const result = parseTokenPresetList('256,512,1024', []);
  assert.deepStrictEqual(result, [256, 512, 1024]);
});

test('envParsers: parseTokenPresetList parses space-separated list', () => {
  const result = parseTokenPresetList('256 512 1024', []);
  assert.deepStrictEqual(result, [256, 512, 1024]);
});

test('envParsers: parseTokenPresetList returns fallback for empty input', () => {
  const fallback = [128, 256];
  const result = parseTokenPresetList('', fallback);
  assert.deepStrictEqual(result, [128, 256]);
});

test('envParsers: parseTokenPresetList deduplicates and sorts', () => {
  const result = parseTokenPresetList('1024,256,1024,512', []);
  assert.deepStrictEqual(result, [256, 512, 1024]);
});

test('envParsers: parseTokenPresetList clamps to [128, 262144]', () => {
  const result = parseTokenPresetList('50,500000', []);
  assert.ok(result.every(n => n >= 128 && n <= 262144));
});

test('envParsers: parseTokenPresetList filters non-positive values', () => {
  const result = parseTokenPresetList('0,-5,abc,256', []);
  assert.deepStrictEqual(result, [256]);
});

// =========================================================================
// clampIntFromMap
// =========================================================================

test('envParsers: clampIntFromMap returns parsed int within bounds', () => {
  assert.equal(clampIntFromMap({ x: '5' }, 'x', 0, 1, 10), 5);
  assert.equal(clampIntFromMap({ x: 5 }, 'x', 0, 1, 10), 5);
});

test('envParsers: clampIntFromMap clamps to min', () => {
  assert.equal(clampIntFromMap({ x: '-5' }, 'x', 0, 1, 10), 1);
});

test('envParsers: clampIntFromMap clamps to max', () => {
  assert.equal(clampIntFromMap({ x: '99' }, 'x', 0, 1, 10), 10);
});

test('envParsers: clampIntFromMap returns fallback for non-numeric', () => {
  assert.equal(clampIntFromMap({ x: 'abc' }, 'x', 7, 1, 10), 7);
});

test('envParsers: clampIntFromMap returns fallback for missing key', () => {
  assert.equal(clampIntFromMap({}, 'x', 3, 1, 10), 3);
});

test('envParsers: clampIntFromMap handles null source', () => {
  assert.equal(clampIntFromMap(null, 'x', 5, 1, 10), 5);
});

// =========================================================================
// clampFloatFromMap
// =========================================================================

test('envParsers: clampFloatFromMap returns parsed float within bounds', () => {
  assert.equal(clampFloatFromMap({ x: '0.5' }, 'x', 0, 0, 1), 0.5);
});

test('envParsers: clampFloatFromMap clamps to min', () => {
  assert.equal(clampFloatFromMap({ x: '-1' }, 'x', 0.5, 0, 1), 0);
});

test('envParsers: clampFloatFromMap clamps to max', () => {
  assert.equal(clampFloatFromMap({ x: '5' }, 'x', 0.5, 0, 1), 1);
});

test('envParsers: clampFloatFromMap returns fallback for non-numeric', () => {
  assert.equal(clampFloatFromMap({ x: 'abc' }, 'x', 0.3, 0, 1), 0.3);
});
