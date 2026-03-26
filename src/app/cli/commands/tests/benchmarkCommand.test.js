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

test('benchmark command returns the benchmark summary payload and supports command name override', async () => {
  const benchmarkCalls = [];
  const commandBenchmark = createBenchmarkCommand(createDeps({
    runGoldenBenchmark: async ({ storage, category, fixturePath, maxCases }) => {
      benchmarkCalls.push({ storage, category, fixturePath, maxCases });
      return ({
      fixture_path: fixturePath,
      case_count: maxCases,
      pass_case_count: 7,
      fail_case_count: 2,
      missing_case_count: 1,
      field_checks: 33,
      field_passed: 25,
      field_pass_rate: 0.7576,
      results: [{ id: 'case-1' }],
    });
    },
  }));

  const storage = { name: 'storage-stub' };
  const result = await commandBenchmark(
    {},
    storage,
    { category: 'keyboard', fixture: 'fixtures/keyboard.json', 'max-cases': '15' },
    'benchmark-golden',
  );

  assert.deepEqual(result, {
    command: 'benchmark-golden',
    category: 'keyboard',
    fixture_path: 'fixtures/keyboard.json',
    case_count: 15,
    pass_case_count: 7,
    fail_case_count: 2,
    missing_case_count: 1,
    field_checks: 33,
    field_passed: 25,
    field_pass_rate: 0.7576,
    results: [{ id: 'case-1' }],
  });
  assert.deepEqual(benchmarkCalls, [{
    storage,
    category: 'keyboard',
    fixturePath: 'fixtures/keyboard.json',
    maxCases: 15,
  }]);
});

test('benchmark command defaults category and falls back invalid max-cases to zero', async () => {
  const commandBenchmark = createBenchmarkCommand(createDeps({
    runGoldenBenchmark: async () => ({
      fixture_path: null,
      case_count: 0,
      pass_case_count: 0,
      fail_case_count: 0,
      missing_case_count: 0,
      field_checks: 0,
      field_passed: 0,
      field_pass_rate: 0,
      results: [],
    }),
  }));

  const result = await commandBenchmark({}, {}, {
    'max-cases': 'not-a-number',
  });

  assert.deepEqual(result, {
    command: 'benchmark',
    category: 'mouse',
    fixture_path: null,
    case_count: 0,
    pass_case_count: 0,
    fail_case_count: 0,
    missing_case_count: 0,
    field_checks: 0,
    field_passed: 0,
    field_pass_rate: 0,
    results: [],
  });
});
