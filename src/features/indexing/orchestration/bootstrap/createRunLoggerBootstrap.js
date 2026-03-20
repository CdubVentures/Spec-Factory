import { configValue } from '../../../../shared/settingsAccessor.js';

function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createRunLoggerBootstrap requires ${name}`);
  }
}

export function createRunLoggerBootstrap({
  storage,
  config = {},
  runId = '',
  createEventLoggerFn,
  nowFn = Date.now,
} = {}) {
  validateFunctionArg('createEventLoggerFn', createEventLoggerFn);
  validateFunctionArg('nowFn', nowFn);

  const logger = createEventLoggerFn({
    storage,
    runtimeEventsKey: configValue(config, 'runtimeEventsKey'),
    onEvent: config.onRuntimeEvent,
    context: {
      runId,
    },
  });
  const startMs = nowFn();

  return {
    logger,
    startMs,
  };
}

export function buildRunBootstrapLogPayload({
  s3Key = '',
  runId = '',
  roundContext = null,
  category = '',
  productId = '',
  config = {},
  runtimeMode = 'production',
  identityFingerprint = '',
  identityLockStatus = 'unknown',
  identityLock = {},
  dedupeMode = '',
} = {}) {
  return {
    runStartedPayload: {
      s3Key,
      runId,
      round: roundContext?.round ?? 0,
    },
    loggerContext: {
      category,
      productId,
    },
    runContextPayload: {
      productId,
      runId,
      category,
      run_profile: 'standard',
      runtime_mode: runtimeMode,
      identity_fingerprint: identityFingerprint,
      identity_lock_status: identityLockStatus,
      family_model_count: identityLock.family_model_count || 0,
      ambiguity_level: identityLock.ambiguity_level || 'unknown',
      dedupe_mode: dedupeMode,
      phase_cursor: 'phase_00_bootstrap',
    },
  };
}

