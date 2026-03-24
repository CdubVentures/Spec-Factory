export function resolveScreencastCallback(config = {}) {
  return config.runtimeScreencastEnabled && typeof config.onScreencastFrame === 'function'
    ? config.onScreencastFrame
    : undefined;
}
