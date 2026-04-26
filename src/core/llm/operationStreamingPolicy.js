import { configInt, configValue } from '../../shared/settingsAccessor.js';

export const OPERATION_STREAMING_MODES = Object.freeze(['adaptive', 'always', 'off']);

const OPERATION_STREAMING_MODE_SET = new Set(OPERATION_STREAMING_MODES);

export function resolveOperationStreamingPolicy(config = {}) {
  const rawMode = String(configValue(config, 'llmOperationStreamingMode') ?? 'adaptive');
  const mode = OPERATION_STREAMING_MODE_SET.has(rawMode) ? rawMode : 'adaptive';

  return Object.freeze({
    mode,
    maxActiveOps: configInt(config, 'llmOperationStreamingMaxActiveOps'),
    flushMs: configInt(config, 'llmOperationStreamingFlushMs'),
  });
}

export function shouldEmitOperationStream({ policy, activeOperationCount }) {
  if (policy?.mode === 'off') return false;
  if (policy?.mode === 'always') return true;

  const active = Number(activeOperationCount);
  const normalizedActive = Number.isFinite(active) ? active : 0;
  const maxActiveOps = Number.isFinite(Number(policy?.maxActiveOps)) ? Number(policy.maxActiveOps) : 10;
  return normalizedActive <= maxActiveOps;
}
