export function buildSourceSkipDispatchContext({
  runtimeOverrides = {},
  context = {},
  runSourceSkipBeforeFetchPhaseFn = () => false,
} = {}) {
  return {
    runtimeOverrides,
    context,
    runSourceSkipBeforeFetchPhaseFn,
  };
}
