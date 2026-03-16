function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createPlannerBootstrap requires ${name}`);
  }
}

export async function createPlannerBootstrap({
  storage,
  config = {},
  logger = null,
  category = '',
  job = {},
  categoryConfig = {},
  requiredFields = [],
  createAdapterManagerFn,
  loadSourceIntelFn,
  createSourcePlannerFn,
  syncRuntimeOverridesFn,
  applyRuntimeOverridesToPlannerFn,
} = {}) {
  validateFunctionArg('createAdapterManagerFn', createAdapterManagerFn);
  validateFunctionArg('loadSourceIntelFn', loadSourceIntelFn);
  validateFunctionArg('createSourcePlannerFn', createSourcePlannerFn);
  validateFunctionArg('syncRuntimeOverridesFn', syncRuntimeOverridesFn);
  validateFunctionArg('applyRuntimeOverridesToPlannerFn', applyRuntimeOverridesToPlannerFn);

  const adapterManager = createAdapterManagerFn(config, logger);
  const sourceIntel = await loadSourceIntelFn({ storage, config, category });
  const planner = createSourcePlannerFn(job, config, categoryConfig, {
    requiredFields,
    sourceIntel: sourceIntel?.data,
  });
  const runtimeOverrides = await syncRuntimeOverridesFn({ force: true });
  applyRuntimeOverridesToPlannerFn(planner, runtimeOverrides);

  return {
    adapterManager,
    sourceIntel,
    planner,
    runtimeOverrides,
  };
}

