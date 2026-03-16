export function buildSourcePreflightDispatchContext({
  context = {},
  runSourcePreflightPhaseFn = async () => ({
    runtimePauseAnnounced: false,
    preflight: { mode: 'skip' }
  }),
} = {}) {
  return {
    context,
    runSourcePreflightPhaseFn,
  };
}
