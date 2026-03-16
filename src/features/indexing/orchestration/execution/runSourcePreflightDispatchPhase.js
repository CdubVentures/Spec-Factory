export async function runSourcePreflightDispatchPhase({
  runtimePauseAnnounced = false,
  context = {},
  runSourcePreflightPhaseFn = async () => ({
    runtimePauseAnnounced,
    preflight: { mode: 'skip' }
  })
} = {}) {
  return runSourcePreflightPhaseFn({
    runtimePauseAnnounced,
    ...context,
  });
}
