import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS,
  CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS,
  resolveSingleRunSecondaryHints,
  resolveLoopRunSecondaryHints,
} from '../secondaryHintsDefaults.js';

/* ── Registry invariants ────────────────────────────────────────── */

describe('CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS', () => {
  it('is a frozen object', () => {
    assert.ok(Object.isFrozen(CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS));
  });

  it('all values are arrays of canonical view keys', () => {
    const CANONICAL = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle'];
    for (const [category, keys] of Object.entries(CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS)) {
      assert.ok(Array.isArray(keys), `${category} must be an array`);
      for (const k of keys) {
        assert.ok(CANONICAL.includes(k), `${category}.${k} is not canonical`);
      }
    }
  });
});

describe('CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS', () => {
  it('is a frozen object', () => {
    assert.ok(Object.isFrozen(CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS));
  });

  it('all values are arrays of canonical view keys', () => {
    const CANONICAL = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle'];
    for (const [category, keys] of Object.entries(CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS)) {
      assert.ok(Array.isArray(keys), `${category} must be an array`);
      for (const k of keys) {
        assert.ok(CANONICAL.includes(k), `${category}.${k} is not canonical`);
      }
    }
  });
});

/* ── resolveSingleRunSecondaryHints ─────────────────────────────── */

describe('resolveSingleRunSecondaryHints', () => {
  it('empty setting → category default (or empty array)', () => {
    const result = resolveSingleRunSecondaryHints('', 'mouse');
    assert.ok(Array.isArray(result));
    assert.deepEqual(
      result,
      CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS.mouse ?? [],
    );
  });

  it('whitespace-only setting → category default (or empty array)', () => {
    const result = resolveSingleRunSecondaryHints('   ', 'mouse');
    assert.deepEqual(
      result,
      CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS.mouse ?? [],
    );
  });

  it('valid JSON array of canonical keys → returned verbatim', () => {
    const result = resolveSingleRunSecondaryHints('["bottom","right"]', 'mouse');
    assert.deepEqual(result, ['bottom', 'right']);
  });

  it('non-canonical keys filtered out', () => {
    const result = resolveSingleRunSecondaryHints('["bottom","notaview","front"]', 'mouse');
    assert.deepEqual(result, ['bottom', 'front']);
  });

  it('all non-canonical keys → empty array (explicit user choice, not fallback)', () => {
    const result = resolveSingleRunSecondaryHints('["foo","bar"]', 'mouse');
    assert.deepEqual(result, []);
  });

  it('explicit empty JSON array → empty array (not fallback)', () => {
    const result = resolveSingleRunSecondaryHints('[]', 'mouse');
    assert.deepEqual(result, []);
  });

  it('invalid JSON → falls back to category default', () => {
    const result = resolveSingleRunSecondaryHints('not json', 'mouse');
    assert.deepEqual(
      result,
      CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS.mouse ?? [],
    );
  });

  it('non-array JSON → falls back to category default', () => {
    const result = resolveSingleRunSecondaryHints('{"bottom":true}', 'mouse');
    assert.deepEqual(
      result,
      CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS.mouse ?? [],
    );
  });

  it('unknown category + empty setting → empty array', () => {
    const result = resolveSingleRunSecondaryHints('', 'spaceship');
    assert.deepEqual(result, []);
  });

  it('unknown category + valid JSON → uses JSON', () => {
    const result = resolveSingleRunSecondaryHints('["top"]', 'spaceship');
    assert.deepEqual(result, ['top']);
  });
});

/* ── resolveLoopRunSecondaryHints ───────────────────────────────── */

describe('resolveLoopRunSecondaryHints', () => {
  it('empty setting → category default (or empty array)', () => {
    const result = resolveLoopRunSecondaryHints('', 'mouse');
    assert.deepEqual(
      result,
      CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS.mouse ?? [],
    );
  });

  it('valid JSON array of canonical keys → returned verbatim', () => {
    const result = resolveLoopRunSecondaryHints('["rear"]', 'mouse');
    assert.deepEqual(result, ['rear']);
  });

  it('explicit empty JSON array → empty array', () => {
    const result = resolveLoopRunSecondaryHints('[]', 'mouse');
    assert.deepEqual(result, []);
  });

  it('non-canonical keys filtered out', () => {
    const result = resolveLoopRunSecondaryHints('["rear","bogus"]', 'mouse');
    assert.deepEqual(result, ['rear']);
  });

  it('invalid JSON → falls back to category default', () => {
    const result = resolveLoopRunSecondaryHints('garbage{', 'mouse');
    assert.deepEqual(
      result,
      CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS.mouse ?? [],
    );
  });

  it('unknown category + empty setting → empty array', () => {
    const result = resolveLoopRunSecondaryHints('', 'spaceship');
    assert.deepEqual(result, []);
  });
});
