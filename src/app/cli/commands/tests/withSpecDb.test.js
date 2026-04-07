import test from 'node:test';
import assert from 'node:assert/strict';

// WHY: createWithSpecDb doesn't exist yet — import will fail until Step 2 (GREEN).
// Design: createWithSpecDb(openFn) returns a withSpecDb(config, category, fn) function.
// This makes the opener injectable for testing.
import { createWithSpecDb } from '../../cliHelpers.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockSpecDb({ closeThrows = false } = {}) {
  let closed = false;
  return {
    get closed() { return closed; },
    close() {
      if (closeThrows) throw new Error('close-kaboom');
      closed = true;
    },
    getAllProducts() { return [{ product_id: 'p1' }]; },
  };
}

// ── Contract tests (table-driven) ────────────────────────────────────────────

const CONTRACT = [
  {
    name: 'happy path — fn receives specDb, result returned, close called',
    openReturns: () => createMockSpecDb(),
    fn: async (specDb) => {
      assert.ok(specDb, 'fn must receive a specDb instance');
      return { found: true };
    },
    assert(result, db) {
      assert.deepEqual(result, { found: true });
      assert.equal(db.closed, true, 'specDb must be closed after fn completes');
    },
  },
  {
    name: 'null specDb — fn receives null, result returned, no close error',
    openReturns: () => null,
    fn: async (specDb) => {
      assert.equal(specDb, null);
      return { fallback: true };
    },
    assert(result) {
      assert.deepEqual(result, { fallback: true });
    },
  },
  {
    name: 'fn throws — error propagates, close still called',
    openReturns: () => createMockSpecDb(),
    fn: async () => { throw new Error('domain-error'); },
    expectError: 'domain-error',
    assert(_result, db) {
      assert.equal(db.closed, true, 'specDb must be closed even when fn throws');
    },
  },
  {
    name: 'close throws — swallowed, fn result still returned',
    openReturns: () => createMockSpecDb({ closeThrows: true }),
    fn: async () => ({ survived: true }),
    assert(result) {
      assert.deepEqual(result, { survived: true });
    },
  },
];

for (const { name, openReturns, fn, expectError, assert: doAssert } of CONTRACT) {
  test(`withSpecDb: ${name}`, async () => {
    const db = openReturns();
    const openCalls = [];
    const mockOpen = async (config, category) => {
      openCalls.push({ config, category });
      return db;
    };

    const withSpecDb = createWithSpecDb(mockOpen);
    const config = { specDbDir: '.workspace/db' };
    const category = 'test-cat';

    if (expectError) {
      await assert.rejects(
        () => withSpecDb(config, category, fn),
        { message: expectError },
      );
    } else {
      const result = await withSpecDb(config, category, fn);
      doAssert(result, db);
    }

    // Opener was called with correct args
    assert.equal(openCalls.length, 1);
    assert.deepEqual(openCalls[0], { config, category });

    // For error case, still verify close
    if (expectError) {
      doAssert(undefined, db);
    }
  });
}
