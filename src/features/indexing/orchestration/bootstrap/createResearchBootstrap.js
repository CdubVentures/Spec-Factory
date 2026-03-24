function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createResearchBootstrap requires ${name}`);
  }
}

function resolveFrontierKey({ storage } = {}) {
  const rawFrontierKey = '_intel/frontier/frontier.json';
  const outputPrefix = `specs/outputs/`;
  if (rawFrontierKey.startsWith(outputPrefix)) {
    return rawFrontierKey;
  }
  return storage.resolveOutputKey(rawFrontierKey);
}

export async function createResearchBootstrap({
  storage,
  config = {},
  logger = null,
  createFrontierFn,
  createUberAggressiveOrchestratorFn,
} = {}) {
  validateFunctionArg('createFrontierFn', createFrontierFn);
  validateFunctionArg('createUberAggressiveOrchestratorFn', createUberAggressiveOrchestratorFn);

  const frontierKey = resolveFrontierKey({ storage, config });
  const frontierDb = createFrontierFn({
    storage,
    key: frontierKey,
    config: { ...config, _logger: logger },
  });
  const uberOrchestrator = createUberAggressiveOrchestratorFn({
    config,
    logger,
    frontier: frontierDb,
  });

  return {
    frontierDb,
    uberOrchestrator,
  };
}
