export function resolveSourcePreflightDispatchState({
  sourcePreflightDispatchResult = {},
} = {}) {
  return {
    runtimePauseAnnounced: sourcePreflightDispatchResult.runtimePauseAnnounced,
    preflight: sourcePreflightDispatchResult.preflight,
  };
}
