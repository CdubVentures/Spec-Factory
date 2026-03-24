import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInfraCategoryRoutes } from '../categoryRoutes.js';

/* ── DI stub factories ── */

function stubJsonRes() {
  const calls = [];
  const fn = (res, status, body) => {
    calls.push({ status, body });
    return true;
  };
  fn.calls = calls;
  return fn;
}

function stubReadJsonBody(body) {
  return () => Promise.resolve(body);
}

function stubFs({ accessThrows = false } = {}) {
  const mkdirCalls = [];
  return {
    access: accessThrows
      ? () => Promise.reject(new Error('ENOENT'))
      : () => Promise.resolve(),
    mkdir: (dir, opts) => { mkdirCalls.calls = mkdirCalls; mkdirCalls.push({ dir, opts }); return Promise.resolve(); },
    _mkdirCalls: mkdirCalls,
  };
}

function stubPathApi() {
  return { join: (...parts) => parts.join('/') };
}

function stubSlugify(val) {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, '_');
}

/* ── Characterization: GET /api/infra/categories ── */

describe('GET /api/infra/categories (characterization)', () => {
  it('returns category list when dirs exist', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody(null),
      listDirs: () => Promise.resolve(['mouse', 'keyboard']),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs(),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(jsonRes.calls.length, 1);
    assert.equal(jsonRes.calls[0].status, 200);
    assert.deepEqual(jsonRes.calls[0].body, ['mouse', 'keyboard']);
  });

  it('returns ["mouse"] fallback when no dirs exist', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody(null),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs(),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(jsonRes.calls[0].status, 200);
    assert.deepEqual(jsonRes.calls[0].body, ['mouse']);
  });

  it('filters out _global and _test_ prefixed dirs by default', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody(null),
      listDirs: () => Promise.resolve(['mouse', '_global', '_test_foo']),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs(),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams(), 'GET', {}, {});

    assert.deepEqual(jsonRes.calls[0].body, ['mouse']);
  });

  it('includes _test_ dirs when includeTest=true', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody(null),
      listDirs: () => Promise.resolve(['mouse', '_test_foo']),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs(),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams('includeTest=true'), 'GET', {}, {});

    assert.deepEqual(jsonRes.calls[0].body, ['mouse', '_test_foo']);
  });

  it('returns false for non-categories path', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody(null),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs(),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    const result = await handler(['other'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result, false);
  });
});

/* ── Characterization: POST /api/infra/categories ── */

describe('POST /api/infra/categories (characterization)', () => {
  it('creates dirs and returns 201 for valid name', async () => {
    const jsonRes = stubJsonRes();
    const fakeFs = stubFs({ accessThrows: true });
    const emitCalls = [];
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({ name: 'widget' }),
      listDirs: () => Promise.resolve(['widget']),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: fakeFs,
      pathApi: stubPathApi(),
      broadcastWs: () => {},
      emitDataChangeFn: (ev) => emitCalls.push(ev),
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(jsonRes.calls[0].status, 201);
    assert.equal(jsonRes.calls[0].body.ok, true);
    assert.equal(jsonRes.calls[0].body.slug, 'widget');
    assert.deepEqual(jsonRes.calls[0].body.categories, ['widget']);
  });

  it('returns 409 when category already exists', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({ name: 'mouse' }),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs({ accessThrows: false }),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(jsonRes.calls[0].status, 409);
    assert.equal(jsonRes.calls[0].body.error, 'category_already_exists');
  });

  it('returns 400 when name is empty', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({ name: '' }),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs({ accessThrows: true }),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(jsonRes.calls[0].status, 400);
    assert.equal(jsonRes.calls[0].body.error, 'category_name_required');
  });

  it('returns 400 when body has no name', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({}),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs({ accessThrows: true }),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(jsonRes.calls[0].status, 400);
    assert.equal(jsonRes.calls[0].body.error, 'category_name_required');
  });

  it('emits category-created data change event', async () => {
    const jsonRes = stubJsonRes();
    const emitCalls = [];
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({ name: 'headset' }),
      listDirs: () => Promise.resolve(['headset']),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs({ accessThrows: true }),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
      emitDataChangeFn: (ev) => emitCalls.push(ev),
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(emitCalls.length, 1);
    assert.equal(emitCalls[0].event, 'category-created');
    assert.equal(emitCalls[0].category, 'all');
    assert.equal(emitCalls[0].meta.slug, 'headset');
  });

  it('calls scaffoldCategoryFn when provided and returns field_count', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({ name: 'gadget' }),
      listDirs: () => Promise.resolve(['gadget']),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs({ accessThrows: true }),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
      emitDataChangeFn: () => {},
      scaffoldCategoryFn: ({ category }) => Promise.resolve({
        created: true,
        category,
        compileResult: { compiled: true, field_count: 25, warnings: [], errors: [] },
      }),
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(jsonRes.calls[0].status, 201);
    assert.equal(jsonRes.calls[0].body.ok, true);
    assert.equal(jsonRes.calls[0].body.slug, 'gadget');
    assert.equal(jsonRes.calls[0].body.field_count, 25);
  });

  it('returns 500 when scaffoldCategoryFn compile fails', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody({ name: 'broken' }),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs({ accessThrows: true }),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
      emitDataChangeFn: () => {},
      scaffoldCategoryFn: () => Promise.resolve({
        created: true,
        compileResult: { compiled: false, errors: ['something_broke'] },
      }),
    });

    await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.equal(jsonRes.calls[0].status, 500);
    assert.equal(jsonRes.calls[0].body.error, 'scaffold_compile_failed');
  });

  it('returns false for PUT method', async () => {
    const jsonRes = stubJsonRes();
    const handler = createInfraCategoryRoutes({
      jsonRes,
      readJsonBody: stubReadJsonBody(null),
      listDirs: () => Promise.resolve([]),
      canonicalSlugify: stubSlugify,
      HELPER_ROOT: '/fake/root',
      fs: stubFs(),
      pathApi: stubPathApi(),
      broadcastWs: () => {},
    });

    const result = await handler(['categories'], new URLSearchParams(), 'PUT', {}, {});
    assert.equal(result, false);
  });
});
