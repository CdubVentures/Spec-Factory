function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createRunTraceWriter requires ${name}`);
  }
}

export function createRunTraceWriter({
  storage,
  config = {},
  runId = '',
  productId = '',
  toBoolFn,
  createRuntimeTraceWriterFn,
} = {}) {
  validateFunctionArg('toBoolFn', toBoolFn);
  validateFunctionArg('createRuntimeTraceWriterFn', createRuntimeTraceWriterFn);

  const traceEnabled = toBoolFn(config.runtimeTraceEnabled, true);
  if (!traceEnabled) {
    return null;
  }

  return createRuntimeTraceWriterFn({
    storage,
    runId,
    productId,
  });
}

