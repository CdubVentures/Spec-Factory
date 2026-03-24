import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInfraCategoryRoutes } from '../categoryRoutes.js';

function stubJsonRes() {
  return (_res, status, body) => ({ status, body });
}

function stubReadJsonBody(body) {
  return () => Promise.resolve(body);
}

function stubFs({ accessThrows = false } = {}) {
  return {
    access: accessThrows
      ? () => Promise.reject(new Error('ENOENT'))
      : () => Promise.resolve(),
    mkdir: () => Promise.resolve(),
  };
}

function stubPathApi() {
  return { join: (...parts) => parts.join('/') };
}

function stubSlugify(val) {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function createCategoryRoutesHarness({
  body = null,
  dirs = [],
  fsOptions = {},
  scaffoldCategoryFn = undefined,
  emitDataChangeFn = undefined,
} = {}) {
  const emitCalls = [];
  const handler = createInfraCategoryRoutes({
    jsonRes: stubJsonRes(),
    readJsonBody: stubReadJsonBody(body),
    listDirs: () => Promise.resolve(dirs),
    canonicalSlugify: stubSlugify,
    HELPER_ROOT: '/fake/root',
    fs: stubFs(fsOptions),
    pathApi: stubPathApi(),
    broadcastWs: () => {},
    emitDataChangeFn: emitDataChangeFn || ((event) => emitCalls.push(event)),
    scaffoldCategoryFn,
  });

  return {
    emitCalls,
    handler,
  };
}

describe('GET /api/infra/categories contract', () => {
  it('returns category list when dirs exist', async () => {
    const { handler } = createCategoryRoutesHarness({ dirs: ['mouse', 'keyboard'] });

    const result = await handler(['categories'], new URLSearchParams(), 'GET', {}, {});

    assert.deepEqual(result, {
      status: 200,
      body: ['mouse', 'keyboard'],
    });
  });

  it('returns ["mouse"] fallback when no dirs exist', async () => {
    const { handler } = createCategoryRoutesHarness();

    const result = await handler(['categories'], new URLSearchParams(), 'GET', {}, {});

    assert.deepEqual(result, {
      status: 200,
      body: ['mouse'],
    });
  });

  it('filters out _global and _test_ prefixed dirs by default', async () => {
    const { handler } = createCategoryRoutesHarness({ dirs: ['mouse', '_global', '_test_foo'] });

    const result = await handler(['categories'], new URLSearchParams(), 'GET', {}, {});

    assert.deepEqual(result, {
      status: 200,
      body: ['mouse'],
    });
  });

  it('includes _test_ dirs when includeTest=true', async () => {
    const { handler } = createCategoryRoutesHarness({ dirs: ['mouse', '_test_foo'] });

    const result = await handler(['categories'], new URLSearchParams('includeTest=true'), 'GET', {}, {});

    assert.deepEqual(result, {
      status: 200,
      body: ['mouse', '_test_foo'],
    });
  });

  it('returns false for non-categories path', async () => {
    const { handler } = createCategoryRoutesHarness();

    const result = await handler(['other'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result, false);
  });
});

describe('POST /api/infra/categories contract', () => {
  it('creates dirs and returns 201 for valid name', async () => {
    const { handler } = createCategoryRoutesHarness({
      body: { name: 'widget' },
      dirs: ['widget'],
      fsOptions: { accessThrows: true },
    });

    const result = await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.deepEqual(result, {
      status: 201,
      body: {
        ok: true,
        slug: 'widget',
        categories: ['widget'],
      },
    });
  });

  it('returns 409 when category already exists', async () => {
    const { handler } = createCategoryRoutesHarness({
      body: { name: 'mouse' },
      fsOptions: { accessThrows: false },
    });

    const result = await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.deepEqual(result, {
      status: 409,
      body: {
        ok: false,
        error: 'category_already_exists',
        slug: 'mouse',
      },
    });
  });

  for (const body of [{ name: '' }, {}]) {
    it(`returns 400 when category name is invalid for body ${JSON.stringify(body)}`, async () => {
      const { handler } = createCategoryRoutesHarness({
        body,
        fsOptions: { accessThrows: true },
      });

      const result = await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

      assert.deepEqual(result, {
        status: 400,
        body: {
          ok: false,
          error: 'category_name_required',
        },
      });
    });
  }

  it('calls scaffoldCategoryFn when provided and returns field_count', async () => {
    const { handler } = createCategoryRoutesHarness({
      body: { name: 'gadget' },
      dirs: ['gadget'],
      fsOptions: { accessThrows: true },
      emitDataChangeFn: () => {},
      scaffoldCategoryFn: ({ category }) => Promise.resolve({
        created: true,
        category,
        compileResult: { compiled: true, field_count: 25, warnings: [], errors: [] },
      }),
    });

    const result = await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.deepEqual(result, {
      status: 201,
      body: {
        ok: true,
        slug: 'gadget',
        categories: ['gadget'],
        field_count: 25,
      },
    });
  });

  it('returns 500 when scaffoldCategoryFn compile fails', async () => {
    const { handler } = createCategoryRoutesHarness({
      body: { name: 'broken' },
      fsOptions: { accessThrows: true },
      emitDataChangeFn: () => {},
      scaffoldCategoryFn: () => Promise.resolve({
        created: true,
        compileResult: { compiled: false, errors: ['something_broke'] },
      }),
    });

    const result = await handler(['categories'], new URLSearchParams(), 'POST', {}, {});

    assert.deepEqual(result, {
      status: 500,
      body: {
        ok: false,
        error: 'scaffold_compile_failed',
        details: ['something_broke'],
      },
    });
  });

  it('returns false for PUT method', async () => {
    const { handler } = createCategoryRoutesHarness();

    const result = await handler(['categories'], new URLSearchParams(), 'PUT', {}, {});
    assert.equal(result, false);
  });
});
