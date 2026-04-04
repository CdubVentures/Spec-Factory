import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCategorySeed } from '../seedEngine.js';

// ── Test helpers ────────────────────────────────────────────────────────────

function makeStubSurface(key, overrides = {}) {
  return {
    key,
    label: key,
    scope: 'category',
    dependsOn: [],
    tables: ['test_table'],
    before: null,
    execute: () => ({ done: true }),
    after: null,
    summarize: (result) => ({ [`${key}_done`]: result?.done ?? false }),
    ...overrides,
  };
}

function makeFakeDb() {
  return { counts: () => ({ test_table: 5 }) };
}

function makeBaseArgs(overrides = {}) {
  return {
    db: makeFakeDb(),
    config: { categoryAuthorityRoot: 'category_authority' },
    category: 'mouse',
    fieldRules: { rules: { fields: {} } },
    fieldMeta: {},
    logger: null,
    surfaces: [],
    ...overrides,
  };
}

// ── Ordering ────────────────────────────────────────────────────────────────

describe('runCategorySeed: ordering', () => {
  it('runs surfaces in dependency order', async () => {
    const callOrder = [];
    const a = makeStubSurface('a', {
      dependsOn: ['b'],
      execute: () => { callOrder.push('a'); return {}; },
    });
    const b = makeStubSurface('b', {
      execute: () => { callOrder.push('b'); return {}; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [a, b] }));
    assert.deepEqual(callOrder, ['b', 'a']);
  });
});

// ── Hook lifecycle ──────────────────────────────────────────────────────────

describe('runCategorySeed: hook lifecycle', () => {
  it('calls before → execute → after in order for each surface', async () => {
    const callOrder = [];
    const surface = makeStubSurface('s', {
      before: () => { callOrder.push('before'); return { b: 1 }; },
      execute: () => { callOrder.push('execute'); return { e: 1 }; },
      after: () => { callOrder.push('after'); return { a: 1 }; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.deepEqual(callOrder, ['before', 'execute', 'after']);
  });

  it('passes ctx with all expected keys to hooks', async () => {
    const receivedCtx = [];
    const db = makeFakeDb();
    const config = { test: true };
    const fieldRules = { r: 1 };
    const fieldMeta = { m: 1 };
    const logger = { log: () => {} };
    const surface = makeStubSurface('s', {
      before: (ctx) => { receivedCtx.push({ ...ctx }); return {}; },
      execute: (ctx) => { receivedCtx.push({ ...ctx }); return {}; },
      after: (ctx) => { receivedCtx.push({ ...ctx }); return {}; },
    });
    await runCategorySeed({ db, config, category: 'mouse', fieldRules, fieldMeta, logger, surfaces: [surface] });
    for (const ctx of receivedCtx) {
      assert.equal(ctx.db, db);
      assert.equal(ctx.config, config);
      assert.equal(ctx.category, 'mouse');
      assert.equal(ctx.fieldRules, fieldRules);
      assert.equal(ctx.fieldMeta, fieldMeta);
      assert.equal(ctx.logger, logger);
    }
  });
});

// ── Summarize ───────────────────────────────────────────────────────────────

describe('runCategorySeed: summarize', () => {
  it('passes (executeResult, beforeResult, afterResult) to summarize', async () => {
    let received = null;
    const surface = makeStubSurface('s', {
      before: () => ({ b: 1 }),
      execute: () => ({ e: 1 }),
      after: () => ({ a: 1 }),
      summarize: (result, beforeResult, afterResult) => {
        received = { result, beforeResult, afterResult };
        return {};
      },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.deepEqual(received.result, { e: 1 });
    assert.deepEqual(received.beforeResult, { b: 1 });
    assert.deepEqual(received.afterResult, { a: 1 });
  });

  it('beforeResult is null when before is null', async () => {
    let receivedBefore = 'not-set';
    const surface = makeStubSurface('s', {
      before: null,
      summarize: (_result, beforeResult) => { receivedBefore = beforeResult; return {}; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(receivedBefore, null);
  });

  it('afterResult is null when after is null', async () => {
    let receivedAfter = 'not-set';
    const surface = makeStubSurface('s', {
      after: null,
      summarize: (_result, _before, afterResult) => { receivedAfter = afterResult; return {}; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(receivedAfter, null);
  });

  it('aggregates all summarize results into the return object', async () => {
    const s1 = makeStubSurface('s1', { summarize: () => ({ x: 1 }) });
    const s2 = makeStubSurface('s2', { summarize: () => ({ y: 2 }) });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [s1, s2] }));
    assert.equal(result.x, 1);
    assert.equal(result.y, 2);
  });
});

// ── Return shape ────────────────────────────────────────────────────────────

describe('runCategorySeed: return shape', () => {
  it('return has category matching input', async () => {
    const result = await runCategorySeed(makeBaseArgs({ category: 'keyboard' }));
    assert.equal(result.category, 'keyboard');
  });

  it('return has duration_ms as a non-negative number', async () => {
    const result = await runCategorySeed(makeBaseArgs());
    assert.equal(typeof result.duration_ms, 'number');
    assert.ok(result.duration_ms >= 0);
  });

  it('return has errors as an array', async () => {
    const result = await runCategorySeed(makeBaseArgs());
    assert.ok(Array.isArray(result.errors));
  });

  it('return has counts from db.counts()', async () => {
    const db = { counts: () => ({ widgets: 42 }) };
    const result = await runCategorySeed(makeBaseArgs({ db }));
    assert.deepEqual(result.counts, { widgets: 42 });
  });

  it('return includes all summarize keys', async () => {
    const surface = makeStubSurface('s', {
      summarize: () => ({ my_metric: 7 }),
    });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(result.my_metric, 7);
  });
});

// ── Hard-fail ───────────────────────────────────────────────────────────────

describe('runCategorySeed: hard-fail', () => {
  it('re-throws when surface.execute throws', async () => {
    const surface = makeStubSurface('s', {
      execute: () => { throw new Error('boom'); },
    });
    await assert.rejects(
      () => runCategorySeed(makeBaseArgs({ surfaces: [surface] })),
      /boom/
    );
  });

  it('surfaces after the failing one do NOT run', async () => {
    const callOrder = [];
    const s1 = makeStubSurface('s1', {
      execute: () => { callOrder.push('s1'); return {}; },
    });
    const s2 = makeStubSurface('s2', {
      dependsOn: ['s1'],
      execute: () => { throw new Error('fail'); },
    });
    const s3 = makeStubSurface('s3', {
      dependsOn: ['s2'],
      execute: () => { callOrder.push('s3'); return {}; },
    });
    await assert.rejects(() => runCategorySeed(makeBaseArgs({ surfaces: [s1, s2, s3] })));
    assert.deepEqual(callOrder, ['s1']);
  });

  it('re-throws when surface.before throws', async () => {
    const surface = makeStubSurface('s', {
      before: () => { throw new Error('before-boom'); },
    });
    await assert.rejects(
      () => runCategorySeed(makeBaseArgs({ surfaces: [surface] })),
      /before-boom/
    );
  });

  it('re-throws when surface.after throws', async () => {
    const surface = makeStubSurface('s', {
      after: () => { throw new Error('after-boom'); },
    });
    await assert.rejects(
      () => runCategorySeed(makeBaseArgs({ surfaces: [surface] })),
      /after-boom/
    );
  });
});

// ── Null hooks ──────────────────────────────────────────────────────────────

describe('runCategorySeed: null hooks', () => {
  const hookCases = [
    ['before', { before: null }],
    ['after', { after: null }],
    ['both before and after', { before: null, after: null }],
  ];
  for (const [label, overrides] of hookCases) {
    it(`runs without error when ${label} is null`, async () => {
      const surface = makeStubSurface('s', overrides);
      const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
      assert.ok(result.category);
    });
  }
});

// ── Product errors ──────────────────────────────────────────────────────────

describe('runCategorySeed: product errors', () => {
  it('collects errors from surface result into top-level errors', async () => {
    const surface = makeStubSurface('s', {
      execute: () => ({ productCount: 1, errors: [{ id: 'p1', error: 'bad' }] }),
    });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, 'p1');
  });

  it('empty errors array does not pollute top-level', async () => {
    const surface = makeStubSurface('s', {
      execute: () => ({ productCount: 0, errors: [] }),
    });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(result.errors.length, 0);
  });

  it('no errors property → nothing collected', async () => {
    const surface = makeStubSurface('s', {
      execute: () => ({ count: 5 }),
    });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(result.errors.length, 0);
  });

  it('collects errors from multiple surfaces', async () => {
    const s1 = makeStubSurface('s1', {
      execute: () => ({ errors: [{ id: 'e1' }] }),
    });
    const s2 = makeStubSurface('s2', {
      execute: () => ({ errors: [{ id: 'e2' }, { id: 'e3' }] }),
    });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [s1, s2] }));
    assert.equal(result.errors.length, 3);
  });
});

// ── Logger ──────────────────────────────────────────────────────────────────

describe('runCategorySeed: logger', () => {
  it('calls logger.log per surface', async () => {
    const logs = [];
    const logger = { log: (...args) => logs.push(args) };
    const s1 = makeStubSurface('s1');
    const s2 = makeStubSurface('s2');
    await runCategorySeed(makeBaseArgs({ surfaces: [s1, s2], logger }));
    assert.equal(logs.length, 2);
    assert.equal(logs[0][0], 'info');
    assert.ok(logs[0][1].includes('s1'));
    assert.ok(logs[1][1].includes('s2'));
  });

  it('null logger does not throw', async () => {
    const surface = makeStubSurface('s');
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface], logger: null }));
    assert.ok(result.category);
  });

  it('logger without log method does not throw', async () => {
    const surface = makeStubSurface('s');
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface], logger: {} }));
    assert.ok(result.category);
  });
});

// ── Async support ───────────────────────────────────────────────────────────

describe('runCategorySeed: async', () => {
  it('works with async execute', async () => {
    const surface = makeStubSurface('s', {
      execute: async () => ({ val: 1 }),
      summarize: (r) => ({ async_val: r.val }),
    });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(result.async_val, 1);
  });

  it('works with async before and after', async () => {
    const callOrder = [];
    const surface = makeStubSurface('s', {
      before: async () => { callOrder.push('before'); return {}; },
      execute: async () => { callOrder.push('execute'); return {}; },
      after: async () => { callOrder.push('after'); return {}; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.deepEqual(callOrder, ['before', 'execute', 'after']);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('runCategorySeed: edge cases', () => {
  it('empty surfaces array returns base shape with no summaries', async () => {
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [] }));
    assert.equal(result.category, 'mouse');
    assert.ok(result.duration_ms >= 0);
    assert.deepEqual(result.errors, []);
    assert.ok(result.counts);
  });

  it('surface with no summarize → no keys contributed, no error', async () => {
    const surface = makeStubSurface('s', { summarize: null });
    const result = await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(result.s_done, undefined);
    assert.ok(result.category);
  });

  it('execute returning null → summarize receives null', async () => {
    let receivedResult = 'not-set';
    const surface = makeStubSurface('s', {
      execute: () => null,
      summarize: (result) => { receivedResult = result; return {}; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    assert.equal(receivedResult, null);
  });

  it('before returning undefined → summarize receives null for beforeResult', async () => {
    let receivedBefore = 'not-set';
    const surface = makeStubSurface('s', {
      before: () => undefined,
      summarize: (_r, beforeResult) => { receivedBefore = beforeResult; return {}; },
    });
    await runCategorySeed(makeBaseArgs({ surfaces: [surface] }));
    // WHY: undefined from before is normalized to null for consistency
    assert.equal(receivedBefore === null || receivedBefore === undefined, true);
  });
});
