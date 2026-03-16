const RUN_ID_PATTERN = /^[A-Za-z0-9._-]{8,96}$/;

export function createRunRuntime({
  runIdOverride = '',
  roundContext = null,
  config = {},
  buildRunIdFn,
} = {}) {
  if (typeof buildRunIdFn !== 'function') {
    throw new TypeError('createRunRuntime requires buildRunIdFn');
  }

  const normalizedRunIdOverride = String(runIdOverride || '').trim();
  const runId = RUN_ID_PATTERN.test(normalizedRunIdOverride)
    ? normalizedRunIdOverride
    : buildRunIdFn();

  return {
    runId,
    runtimeMode: 'production',
  };
}

