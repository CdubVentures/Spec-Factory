export function runSourceSkipDispatchPhase({
  preflight = {},
  runtimeOverrides = {},
  context = {},
  runSourceSkipBeforeFetchPhaseFn = () => false
} = {}) {
  const {
    source = {},
    sourceHost = '',
    hostBudgetRow = {}
  } = preflight;

  return runSourceSkipBeforeFetchPhaseFn({
    runtimeOverrides,
    source,
    sourceHost,
    hostBudgetRow,
    ...context,
  });
}
