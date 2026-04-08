import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_SURFACES,
  buildCategorySurfaces,
  buildReseedSurfaces,
  topologicalSort,
  getSurfaceByKey,
} from '../seedRegistry.js';

// ── Test helpers ────────────────────────────────────────────────────────────

function makeStubSteps() {
  const calls = [];
  const stub = (name) => (...args) => { calls.push({ name, args }); return { stubbed: name }; };
  return {
    steps: {
      reconcileComponentDbRows: stub('reconcileComponentDbRows'),
      seedComponents: stub('seedComponents'),
      seedComponentOverrides: stub('seedComponentOverrides'),
      reconcileComponentOverrideRows: stub('reconcileComponentOverrideRows'),
      reconcileListSeedRows: stub('reconcileListSeedRows'),
      seedListValues: stub('seedListValues'),
      seedProducts: stub('seedProducts'),
      backfillComponentLinks: stub('backfillComponentLinks'),
      seedSourceAndKeyReview: stub('seedSourceAndKeyReview'),
    },
    calls,
  };
}

function makeStubReseedDeps() {
  const calls = [];
  const stub = (name) => (...args) => { calls.push({ name, args }); return { stubbed: name }; };
  return {
    deps: {
      scanAndSeedCheckpoints: stub('scanAndSeedCheckpoints'),
      rebuildColorEditionFinderFromJson: stub('rebuildColorEditionFinderFromJson'),
      rebuildLlmRouteMatrixFromJson: stub('rebuildLlmRouteMatrixFromJson'),
      reseedFieldKeyOrderFromJson: stub('reseedFieldKeyOrderFromJson'),
      reseedFieldStudioMapFromJson: stub('reseedFieldStudioMapFromJson'),
      reseedOverridesFromJson: stub('reseedOverridesFromJson'),
      rebuildFieldCandidatesFromJson: stub('rebuildFieldCandidatesFromJson'),
    },
    calls,
  };
}

function makeFakeCtx(overrides = {}) {
  return {
    db: {},
    config: { categoryAuthorityRoot: 'category_authority' },
    category: 'mouse',
    fieldRules: { componentDBs: {} },
    fieldMeta: {},
    logger: null,
    ...overrides,
  };
}

// ── GLOBAL_SURFACES ─────────────────────────────────────────────────────────

describe('GLOBAL_SURFACES', () => {
  it('has exactly 3 entries', () => {
    assert.equal(GLOBAL_SURFACES.length, 3);
  });

  const expectedGlobalKeys = ['brands', 'settings', 'colors'];
  for (const key of expectedGlobalKeys) {
    it(`contains entry with key "${key}"`, () => {
      assert.ok(GLOBAL_SURFACES.find(s => s.key === key), `missing key: ${key}`);
    });
  }

  it('every entry has scope "global" and db "app.sqlite"', () => {
    for (const entry of GLOBAL_SURFACES) {
      assert.equal(entry.scope, 'global', `${entry.key} scope`);
      assert.equal(entry.db, 'app.sqlite', `${entry.key} db`);
    }
  });

  it('no entry has an execute property', () => {
    for (const entry of GLOBAL_SURFACES) {
      assert.equal(entry.execute, undefined, `${entry.key} should not have execute`);
    }
  });

  it('every entry has calledFrom and seederFile as strings', () => {
    for (const entry of GLOBAL_SURFACES) {
      assert.equal(typeof entry.calledFrom, 'string', `${entry.key} calledFrom`);
      assert.equal(typeof entry.seederFile, 'string', `${entry.key} seederFile`);
      assert.ok(entry.calledFrom.length > 0, `${entry.key} calledFrom non-empty`);
      assert.ok(entry.seederFile.length > 0, `${entry.key} seederFile non-empty`);
    }
  });

  it('every entry has hashGated true and a non-empty hashKey', () => {
    for (const entry of GLOBAL_SURFACES) {
      assert.equal(entry.hashGated, true, `${entry.key} hashGated`);
      assert.equal(typeof entry.hashKey, 'string', `${entry.key} hashKey type`);
      assert.ok(entry.hashKey.length > 0, `${entry.key} hashKey non-empty`);
    }
  });

  it('every entry has a non-empty tables array', () => {
    for (const entry of GLOBAL_SURFACES) {
      assert.ok(Array.isArray(entry.tables), `${entry.key} tables is array`);
      assert.ok(entry.tables.length > 0, `${entry.key} tables non-empty`);
    }
  });

  // Table-driven: expected tables per surface
  const expectedTables = [
    ['brands', ['brands', 'brand_categories', 'brand_renames']],
    ['settings', ['settings', 'studio_maps']],
    ['colors', ['color_registry']],
  ];
  for (const [key, tables] of expectedTables) {
    it(`${key} references correct tables`, () => {
      const entry = GLOBAL_SURFACES.find(s => s.key === key);
      assert.deepEqual(entry.tables, tables);
    });
  }
});

// ── buildCategorySurfaces ───────────────────────────────────────────────────

describe('buildCategorySurfaces', () => {
  it('returns exactly 6 entries', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    assert.equal(surfaces.length, 6);
  });

  it('every entry has scope "category" and required fields', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    for (const entry of surfaces) {
      assert.equal(entry.scope, 'category', `${entry.key} scope`);
      assert.equal(typeof entry.execute, 'function', `${entry.key} execute`);
      assert.equal(typeof entry.summarize, 'function', `${entry.key} summarize`);
      assert.ok(Array.isArray(entry.dependsOn), `${entry.key} dependsOn is array`);
      assert.ok(Array.isArray(entry.tables), `${entry.key} tables is array`);
      assert.ok(entry.tables.length > 0, `${entry.key} tables non-empty`);
    }
  });

  const expectedCategoryKeys = [
    'components', 'component_overrides', 'lists',
    'products', 'backfill_links', 'source_key_review',
  ];
  it('contains all expected keys', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    const keys = surfaces.map(s => s.key);
    assert.deepEqual(keys.sort(), [...expectedCategoryKeys].sort());
  });

  // Table-driven: dependency edges
  const depEdges = [
    ['component_overrides', ['components']],
    ['products', ['components', 'lists']],
    ['backfill_links', ['products']],
    ['source_key_review', ['products', 'backfill_links']],
  ];
  for (const [key, deps] of depEdges) {
    it(`${key} depends on ${deps.join(', ')}`, () => {
      const { steps } = makeStubSteps();
      const surfaces = buildCategorySurfaces(steps);
      const entry = surfaces.find(s => s.key === key);
      assert.deepEqual(entry.dependsOn, deps);
    });
  }

  it('components and lists have no dependencies', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    for (const key of ['components', 'lists']) {
      const entry = surfaces.find(s => s.key === key);
      assert.deepEqual(entry.dependsOn, [], `${key} dependsOn`);
    }
  });

  // Table-driven: closure wiring — execute calls correct step with correct args
  const executeWiring = [
    ['components', 'seedComponents', (ctx) => [ctx.db, ctx.fieldRules]],
    ['component_overrides', 'seedComponentOverrides', (ctx) => [ctx.db, ctx.config, ctx.category]],
    ['lists', 'seedListValues', (ctx) => [ctx.db, ctx.fieldRules, ctx.config, ctx.category]],
    ['products', 'seedProducts', (ctx) => [ctx.db, ctx.config, ctx.category, ctx.fieldRules, ctx.fieldMeta]],
    ['backfill_links', 'backfillComponentLinks', (ctx) => [ctx.db, ctx.fieldMeta, ctx.fieldRules]],
    ['source_key_review', 'seedSourceAndKeyReview', (ctx) => [ctx.db, ctx.category, ctx.fieldMeta]],
  ];
  for (const [surfaceKey, stepName, argsFn] of executeWiring) {
    it(`${surfaceKey}.execute calls steps.${stepName} with correct args`, () => {
      const { steps, calls } = makeStubSteps();
      const surfaces = buildCategorySurfaces(steps);
      const entry = surfaces.find(s => s.key === surfaceKey);
      const ctx = makeFakeCtx();
      entry.execute(ctx);
      const call = calls.find(c => c.name === stepName);
      assert.ok(call, `${stepName} was not called`);
      assert.deepEqual(call.args, argsFn(ctx));
    });
  }

  // Table-driven: before hooks
  const beforeWiring = [
    ['components', 'reconcileComponentDbRows', (ctx) => [ctx.db, ctx.fieldRules]],
    ['component_overrides', 'reconcileComponentOverrideRows', (ctx) => [ctx.db, ctx.config, ctx.category]],
    ['lists', 'reconcileListSeedRows', (ctx) => [ctx.db, ctx.fieldRules, ctx.config, ctx.category]],
  ];
  for (const [surfaceKey, stepName, argsFn] of beforeWiring) {
    it(`${surfaceKey}.before calls steps.${stepName} with correct args`, () => {
      const { steps, calls } = makeStubSteps();
      const surfaces = buildCategorySurfaces(steps);
      const entry = surfaces.find(s => s.key === surfaceKey);
      const ctx = makeFakeCtx();
      entry.before(ctx);
      const call = calls.find(c => c.name === stepName);
      assert.ok(call, `${stepName} was not called`);
      assert.deepEqual(call.args, argsFn(ctx));
    });
  }

  // Table-driven: null hooks
  const nullBeforeKeys = ['products', 'backfill_links', 'source_key_review'];
  for (const key of nullBeforeKeys) {
    it(`${key}.before is null`, () => {
      const { steps } = makeStubSteps();
      const surfaces = buildCategorySurfaces(steps);
      const entry = surfaces.find(s => s.key === key);
      assert.equal(entry.before, null);
    });
  }

  const nullAfterKeys = ['components', 'component_overrides', 'lists', 'products', 'backfill_links', 'source_key_review'];
  for (const key of nullAfterKeys) {
    it(`${key}.after is null`, () => {
      const { steps } = makeStubSteps();
      const surfaces = buildCategorySurfaces(steps);
      const entry = surfaces.find(s => s.key === key);
      assert.equal(entry.after, null);
    });
  }
});

// ── buildReseedSurfaces ─────────────────────────────────────────────────────

describe('buildReseedSurfaces', () => {
  it('returns exactly 6 entries', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    assert.equal(surfaces.length, 7);
  });

  it('every entry has scope "reseed", execute (fn), formatLog (fn)', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    for (const entry of surfaces) {
      assert.equal(entry.scope, 'reseed', `${entry.key} scope`);
      assert.equal(typeof entry.execute, 'function', `${entry.key} execute`);
      assert.equal(typeof entry.formatLog, 'function', `${entry.key} formatLog`);
    }
  });

  const expectedReseedKeys = ['checkpoint', 'color_edition', 'llm_route_matrix', 'overrides', 'field_key_order', 'field_studio_map', 'field_candidates'];
  it('contains all expected keys', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const keys = surfaces.map(s => s.key);
    assert.deepEqual(keys.sort(), [...expectedReseedKeys].sort());
  });

  it('every entry has a non-empty tables array', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    for (const entry of surfaces) {
      assert.ok(Array.isArray(entry.tables), `${entry.key} tables is array`);
      assert.ok(entry.tables.length > 0, `${entry.key} tables non-empty`);
    }
  });

  it('checkpoint.shouldRun returns true when indexLabRoot is truthy', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const entry = surfaces.find(s => s.key === 'checkpoint');
    assert.equal(entry.shouldRun({ indexLabRoot: '/some/path' }), true);
  });

  it('checkpoint.shouldRun returns false when indexLabRoot is falsy', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const entry = surfaces.find(s => s.key === 'checkpoint');
    assert.equal(entry.shouldRun({ indexLabRoot: '' }), false);
    assert.equal(entry.shouldRun({ indexLabRoot: null }), false);
  });

  it('color_edition, llm_route_matrix, overrides, field_key_order, field_studio_map shouldRun is null', () => {
    const { deps } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    for (const key of ['color_edition', 'llm_route_matrix', 'overrides', 'field_key_order', 'field_studio_map', 'field_candidates']) {
      const entry = surfaces.find(s => s.key === key);
      assert.equal(entry.shouldRun, null, `${key} shouldRun`);
    }
  });

  it('checkpoint.execute calls deps.scanAndSeedCheckpoints with correct shape', () => {
    const { deps, calls } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const entry = surfaces.find(s => s.key === 'checkpoint');
    const fakeDb = { name: 'testDb' };
    entry.execute({ db: fakeDb, indexLabRoot: '/idx', productRoot: '/prod' });
    const call = calls.find(c => c.name === 'scanAndSeedCheckpoints');
    assert.ok(call, 'scanAndSeedCheckpoints was not called');
    assert.deepEqual(call.args[0], { specDb: fakeDb, indexLabRoot: '/idx', productRoot: '/prod' });
  });

  it('color_edition.execute calls deps.rebuildColorEditionFinderFromJson', () => {
    const { deps, calls } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const entry = surfaces.find(s => s.key === 'color_edition');
    const fakeDb = { name: 'testDb' };
    entry.execute({ db: fakeDb, productRoot: '/prod' });
    const call = calls.find(c => c.name === 'rebuildColorEditionFinderFromJson');
    assert.ok(call);
    assert.deepEqual(call.args[0], { specDb: fakeDb, productRoot: '/prod' });
  });

  it('llm_route_matrix.execute calls deps.rebuildLlmRouteMatrixFromJson', () => {
    const { deps, calls } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const entry = surfaces.find(s => s.key === 'llm_route_matrix');
    const fakeDb = { name: 'testDb' };
    entry.execute({ db: fakeDb, helperRoot: '/helpers' });
    const call = calls.find(c => c.name === 'rebuildLlmRouteMatrixFromJson');
    assert.ok(call);
    assert.deepEqual(call.args[0], { specDb: fakeDb, helperRoot: '/helpers' });
  });

  it('field_candidates.execute calls deps.rebuildFieldCandidatesFromJson', () => {
    const { deps, calls } = makeStubReseedDeps();
    const surfaces = buildReseedSurfaces(deps);
    const entry = surfaces.find(s => s.key === 'field_candidates');
    const fakeDb = { name: 'testDb' };
    entry.execute({ db: fakeDb, productRoot: '/prod' });
    const call = calls.find(c => c.name === 'rebuildFieldCandidatesFromJson');
    assert.ok(call);
    assert.deepEqual(call.args[0], { specDb: fakeDb, productRoot: '/prod' });
  });
});

// ── Key uniqueness ──────────────────────────────────────────────────────────

describe('key uniqueness', () => {
  it('all keys are unique across global + category + reseed', () => {
    const { steps } = makeStubSteps();
    const { deps } = makeStubReseedDeps();
    const allSurfaces = [
      ...GLOBAL_SURFACES,
      ...buildCategorySurfaces(steps),
      ...buildReseedSurfaces(deps),
    ];
    const keys = allSurfaces.map(s => s.key);
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length, `duplicate keys found: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`);
    assert.equal(unique.size, 16, 'expected 16 total surfaces');
  });
});

// ── topologicalSort ─────────────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('sorts category surfaces without error', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    const sorted = topologicalSort(surfaces);
    assert.equal(sorted.length, surfaces.length);
  });

  // Table-driven: ordering constraints
  const orderingConstraints = [
    ['components', 'component_overrides'],
    ['components', 'products'],
    ['lists', 'products'],
    ['products', 'backfill_links'],
    ['products', 'source_key_review'],
    ['backfill_links', 'source_key_review'],
  ];
  for (const [before, after] of orderingConstraints) {
    it(`${before} appears before ${after}`, () => {
      const { steps } = makeStubSteps();
      const surfaces = buildCategorySurfaces(steps);
      const sorted = topologicalSort(surfaces);
      const keys = sorted.map(s => s.key);
      assert.ok(
        keys.indexOf(before) < keys.indexOf(after),
        `expected ${before} (idx ${keys.indexOf(before)}) before ${after} (idx ${keys.indexOf(after)})`
      );
    });
  }

  it('returns same count as input', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    const sorted = topologicalSort(surfaces);
    assert.equal(sorted.length, surfaces.length);
  });

  it('handles surfaces with no dependencies', () => {
    const sorted = topologicalSort([
      { key: 'a', dependsOn: [] },
      { key: 'b', dependsOn: [] },
    ]);
    assert.equal(sorted.length, 2);
  });

  it('returns empty array for empty input', () => {
    const sorted = topologicalSort([]);
    assert.deepEqual(sorted, []);
  });

  it('throws on circular dependency', () => {
    assert.throws(
      () => topologicalSort([
        { key: 'a', dependsOn: ['b'] },
        { key: 'b', dependsOn: ['a'] },
      ]),
      /[Cc]ircular/
    );
  });

  it('throws on self-referencing dependency', () => {
    assert.throws(
      () => topologicalSort([{ key: 'a', dependsOn: ['a'] }]),
      /[Cc]ircular/
    );
  });
});

// ── getSurfaceByKey ─────────────────────────────────────────────────────────

describe('getSurfaceByKey', () => {
  it('finds a category surface by key', () => {
    const { steps } = makeStubSteps();
    const surfaces = buildCategorySurfaces(steps);
    const result = getSurfaceByKey(surfaces, 'products');
    assert.equal(result?.key, 'products');
  });

  it('finds a global surface by key', () => {
    const result = getSurfaceByKey(GLOBAL_SURFACES, 'brands');
    assert.equal(result?.key, 'brands');
  });

  it('returns undefined for nonexistent key', () => {
    const result = getSurfaceByKey(GLOBAL_SURFACES, 'nonexistent');
    assert.equal(result, undefined);
  });

  it('works across combined arrays', () => {
    const { steps } = makeStubSteps();
    const { deps } = makeStubReseedDeps();
    const all = [...GLOBAL_SURFACES, ...buildCategorySurfaces(steps), ...buildReseedSurfaces(deps)];
    assert.equal(getSurfaceByKey(all, 'brands')?.scope, 'global');
    assert.equal(getSurfaceByKey(all, 'products')?.scope, 'category');
    assert.equal(getSurfaceByKey(all, 'checkpoint')?.scope, 'reseed');
  });
});
