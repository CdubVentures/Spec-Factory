import test from 'node:test';
import assert from 'node:assert/strict';

import { createBenchmarkCommand } from '../benchmarkCommand.js';

function createDeps(overrides = {}) {
  return {
    runGoldenBenchmark: async ({ category, fixturePath, maxCases }) => ({
      fixture_path: fixturePath,
      case_count: maxCases,
      pass_case_count: 3,
      fail_case_count: 1,
      missing_case_count: 0,
      field_checks: 10,
      field_passed: 9,
      field_pass_rate: 0.9,
      results: [{ category }],
    }),
    ...overrides,
  };
}

test('benchmark command forwards args to runGoldenBenchmark and supports command name override', async () => {
  const calls = [];
  const commandBenchmark = createBenchmarkCommand(createDeps({
    runGoldenBenchmark: async (payload) => {
      calls.push(payload);
      return {
        fixture_path: payload.fixturePath,
        case_count: payload.maxCases,
        pass_case_count: 7,
        fail_case_count: 2,
        missing_case_count: 1,
        field_checks: 33,
        field_passed: 25,
        field_pass_rate: 0.7576,
        results: [{ id: 'case-1' }],
      };
    },
  }));

  const storage = { name: 'storage-stub' };
  const result = await commandBenchmark({}, storage, {
    category: 'keyboard',
    fixture: 'fixtures/keyboard.json',
    'max-cases': '15',
  }, 'benchmark-golden');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].category, 'keyboard');
  assert.equal(calls[0].fixturePath, 'fixtures/keyboard.json');
  assert.equal(calls[0].maxCases, 15);

  assert.equal(result.command, 'benchmark-golden');
  assert.equal(result.category, 'keyboard');
  assert.equal(result.fixture_path, 'fixtures/keyboard.json');
  assert.equal(result.case_count, 15);
  assert.equal(result.pass_case_count, 7);
  assert.equal(result.fail_case_count, 2);
  assert.equal(result.missing_case_count, 1);
  assert.equal(result.field_checks, 33);
  assert.equal(result.field_passed, 25);
  assert.equal(result.field_pass_rate, 0.7576);
  assert.deepEqual(result.results, [{ id: 'case-1' }]);
});

test('benchmark command defaults category and max-cases parsing fallback', async () => {
  const calls = [];
  const commandBenchmark = createBenchmarkCommand(createDeps({
    runGoldenBenchmark: async (payload) => {
      calls.push(payload);
      return {
        fixture_path: null,
        case_count: 0,
        pass_case_count: 0,
        fail_case_count: 0,
        missing_case_count: 0,
        field_checks: 0,
        field_passed: 0,
        field_pass_rate: 0,
        results: [],
      };
    },
  }));

  const result = await commandBenchmark({}, {}, {
    'max-cases': 'not-a-number',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'mouse');
  assert.equal(calls[0].maxCases, 0);
  assert.equal(result.command, 'benchmark');
  assert.equal(result.category, 'mouse');
  assert.equal(result.case_count, 0);
});
