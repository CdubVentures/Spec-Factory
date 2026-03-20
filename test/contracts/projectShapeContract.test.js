// WHY: Contract test for the generic projectShape/buildDefaults coercion utilities.
// These are the engine behind schema-driven prefetch projection — all 8 coercion
// strategies must produce deterministic, type-safe output from arbitrary input.

import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { projectShape, buildDefaults } from '../../src/features/indexing/api/builders/runtimeOpsEventPrimitives.js';

// ── projectShape ──

describe('projectShape', () => {

  const MIXED_SHAPE = Object.freeze([
    { key: 'name', coerce: 'string' },
    { key: 'count', coerce: 'int' },
    { key: 'score', coerce: 'float' },
    { key: 'active', coerce: 'bool' },
    { key: 'tags', coerce: 'array' },
    { key: 'meta', coerce: 'object_or_null' },
    { key: 'config', coerce: 'object_or_empty' },
    { key: 'raw', coerce: 'passthrough' },
  ]);

  it('returns defaults when source is null', () => {
    const result = projectShape(null, MIXED_SHAPE);
    deepStrictEqual(result, {
      name: '',
      count: 0,
      score: 0,
      active: false,
      tags: [],
      meta: null,
      config: {},
      raw: null,
    });
  });

  it('returns defaults when source is undefined', () => {
    const result = projectShape(undefined, MIXED_SHAPE);
    deepStrictEqual(result, {
      name: '',
      count: 0,
      score: 0,
      active: false,
      tags: [],
      meta: null,
      config: {},
      raw: null,
    });
  });

  it('returns defaults when source is empty object', () => {
    const result = projectShape({}, MIXED_SHAPE);
    deepStrictEqual(result, {
      name: '',
      count: 0,
      score: 0,
      active: false,
      tags: [],
      meta: null,
      config: {},
      raw: null,
    });
  });

  it('coerces a fully populated source', () => {
    const source = {
      name: '  hello world  ',
      count: '42',
      score: '3.14',
      active: 1,
      tags: ['a', 'b'],
      meta: { x: 1 },
      config: { y: 2 },
      raw: 'anything',
    };
    const result = projectShape(source, MIXED_SHAPE);
    deepStrictEqual(result, {
      name: 'hello world',
      count: 42,
      score: 3.14,
      active: true,
      tags: ['a', 'b'],
      meta: { x: 1 },
      config: { y: 2 },
      raw: 'anything',
    });
  });

  it('only includes keys from the descriptor (no extra keys)', () => {
    const source = { name: 'test', extra_field: 'should not appear', count: 5 };
    const result = projectShape(source, MIXED_SHAPE);
    strictEqual('extra_field' in result, false);
    strictEqual(Object.keys(result).length, MIXED_SHAPE.length);
  });
});

// ── string coercion ──

describe('projectShape — string coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'string' }]);

  it('trims whitespace', () => {
    deepStrictEqual(projectShape({ val: '  padded  ' }, SHAPE), { val: 'padded' });
  });

  it('coerces null to empty string', () => {
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: '' });
  });

  it('coerces undefined to empty string', () => {
    deepStrictEqual(projectShape({ val: undefined }, SHAPE), { val: '' });
  });

  it('coerces number to trimmed string', () => {
    deepStrictEqual(projectShape({ val: 42 }, SHAPE), { val: '42' });
  });

  it('coerces false to empty string', () => {
    deepStrictEqual(projectShape({ val: false }, SHAPE), { val: '' });
  });
});

// ── int coercion ──

describe('projectShape — int coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'int' }]);

  it('parses string integer', () => {
    deepStrictEqual(projectShape({ val: '99' }, SHAPE), { val: 99 });
  });

  it('truncates float string to integer', () => {
    deepStrictEqual(projectShape({ val: '3.7' }, SHAPE), { val: 3 });
  });

  it('returns 0 for non-numeric string', () => {
    deepStrictEqual(projectShape({ val: 'abc' }, SHAPE), { val: 0 });
  });

  it('returns 0 for null', () => {
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: 0 });
  });

  it('passes through integer unchanged', () => {
    deepStrictEqual(projectShape({ val: 42 }, SHAPE), { val: 42 });
  });
});

// ── float coercion ──

describe('projectShape — float coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'float' }]);

  it('parses string float', () => {
    deepStrictEqual(projectShape({ val: '3.14' }, SHAPE), { val: 3.14 });
  });

  it('returns 0 for non-numeric string', () => {
    deepStrictEqual(projectShape({ val: 'xyz' }, SHAPE), { val: 0 });
  });

  it('returns 0 for null', () => {
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: 0 });
  });

  it('passes through float unchanged', () => {
    deepStrictEqual(projectShape({ val: 2.718 }, SHAPE), { val: 2.718 });
  });
});

// ── bool coercion ──

describe('projectShape — bool coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'bool' }]);

  it('coerces truthy to true', () => {
    deepStrictEqual(projectShape({ val: 1 }, SHAPE), { val: true });
    deepStrictEqual(projectShape({ val: 'yes' }, SHAPE), { val: true });
  });

  it('coerces falsy to false', () => {
    deepStrictEqual(projectShape({ val: 0 }, SHAPE), { val: false });
    deepStrictEqual(projectShape({ val: '' }, SHAPE), { val: false });
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: false });
    deepStrictEqual(projectShape({ val: undefined }, SHAPE), { val: false });
  });
});

// ── array coercion ──

describe('projectShape — array coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'array' }]);

  it('passes through arrays', () => {
    deepStrictEqual(projectShape({ val: [1, 2, 3] }, SHAPE), { val: [1, 2, 3] });
  });

  it('returns empty array for non-array', () => {
    deepStrictEqual(projectShape({ val: 'not array' }, SHAPE), { val: [] });
    deepStrictEqual(projectShape({ val: 42 }, SHAPE), { val: [] });
    deepStrictEqual(projectShape({ val: {} }, SHAPE), { val: [] });
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: [] });
  });
});

// ── object_or_null coercion ──

describe('projectShape — object_or_null coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'object_or_null' }]);

  it('passes through objects', () => {
    deepStrictEqual(projectShape({ val: { a: 1 } }, SHAPE), { val: { a: 1 } });
  });

  it('returns null for non-object', () => {
    deepStrictEqual(projectShape({ val: 'string' }, SHAPE), { val: null });
    deepStrictEqual(projectShape({ val: 42 }, SHAPE), { val: null });
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: null });
    deepStrictEqual(projectShape({ val: undefined }, SHAPE), { val: null });
  });

  it('returns null for arrays (arrays are not plain objects)', () => {
    deepStrictEqual(projectShape({ val: [1, 2] }, SHAPE), { val: null });
  });
});

// ── object_or_empty coercion ──

describe('projectShape — object_or_empty coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'object_or_empty' }]);

  it('passes through objects', () => {
    deepStrictEqual(projectShape({ val: { a: 1 } }, SHAPE), { val: { a: 1 } });
  });

  it('returns empty object for non-object', () => {
    deepStrictEqual(projectShape({ val: 'string' }, SHAPE), { val: {} });
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: {} });
  });

  it('returns empty object for arrays', () => {
    deepStrictEqual(projectShape({ val: [1, 2] }, SHAPE), { val: {} });
  });
});

// ── passthrough coercion ──

describe('projectShape — passthrough coercion', () => {
  const SHAPE = Object.freeze([{ key: 'val', coerce: 'passthrough' }]);

  it('passes value through with null coalesce', () => {
    deepStrictEqual(projectShape({ val: 'hello' }, SHAPE), { val: 'hello' });
    deepStrictEqual(projectShape({ val: 42 }, SHAPE), { val: 42 });
    deepStrictEqual(projectShape({ val: [1, 2] }, SHAPE), { val: [1, 2] });
    deepStrictEqual(projectShape({ val: { a: 1 } }, SHAPE), { val: { a: 1 } });
  });

  it('returns null for undefined', () => {
    deepStrictEqual(projectShape({ val: undefined }, SHAPE), { val: null });
    deepStrictEqual(projectShape({}, SHAPE), { val: null });
  });

  it('passes null through as null', () => {
    deepStrictEqual(projectShape({ val: null }, SHAPE), { val: null });
  });
});

// ── buildDefaults ──

describe('buildDefaults', () => {
  const MIXED_SHAPE = Object.freeze([
    { key: 'name', coerce: 'string' },
    { key: 'count', coerce: 'int' },
    { key: 'score', coerce: 'float' },
    { key: 'active', coerce: 'bool' },
    { key: 'tags', coerce: 'array' },
    { key: 'meta', coerce: 'object_or_null' },
    { key: 'config', coerce: 'object_or_empty' },
    { key: 'raw', coerce: 'passthrough' },
  ]);

  it('generates zero-value defaults from descriptor', () => {
    const defaults = buildDefaults(MIXED_SHAPE);
    deepStrictEqual(defaults, {
      name: '',
      count: 0,
      score: 0,
      active: false,
      tags: [],
      meta: null,
      config: {},
      raw: null,
    });
  });

  it('returns empty object for empty descriptor', () => {
    deepStrictEqual(buildDefaults([]), {});
  });

  it('each call returns a fresh object (no shared references)', () => {
    const a = buildDefaults(MIXED_SHAPE);
    const b = buildDefaults(MIXED_SHAPE);
    strictEqual(a === b, false);
    strictEqual(a.tags === b.tags, false);
    strictEqual(a.config === b.config, false);
  });
});
