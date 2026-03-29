export function createBenchmarkCommand({
  runGoldenBenchmark,
  openSpecDbForCategory,
}) {
  return async function commandBenchmark(config, storage, args, commandName = 'benchmark') {
    const category = args.category || 'mouse';
    const fixturePath = args.fixture || null;
    const maxCases = Math.max(0, Number.parseInt(String(args['max-cases'] || '0'), 10) || 0);

    const specDb = await openSpecDbForCategory?.(config, category) ?? null;
    try {
    const result = await runGoldenBenchmark({
      storage,
      category,
      fixturePath,
      maxCases,
      specDb,
    });

    return {
      command: commandName,
      category,
      fixture_path: result.fixture_path,
      case_count: result.case_count,
      pass_case_count: result.pass_case_count,
      fail_case_count: result.fail_case_count,
      missing_case_count: result.missing_case_count,
      field_checks: result.field_checks,
      field_passed: result.field_passed,
      field_pass_rate: result.field_pass_rate,
      results: result.results,
    };
    } finally {
      try { specDb?.close(); } catch { /* */ }
    }
  };
}
