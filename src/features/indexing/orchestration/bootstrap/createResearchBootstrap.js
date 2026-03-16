function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createResearchBootstrap requires ${name}`);
  }
}

function resolveFrontierKey({ storage, config = {} } = {}) {
  const rawFrontierKey = String(config.frontierDbPath || '_intel/frontier/frontier.json').trim();
  const outputPrefix = `${config.s3OutputPrefix || 'specs/outputs'}/`;
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
  await frontierDb.load();
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

