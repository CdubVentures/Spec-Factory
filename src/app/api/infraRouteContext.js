export function createInfraRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes,
    readJsonBody,
    listDirs,
    canonicalSlugify,
    HELPER_ROOT,
    DIST_ROOT,
    OUTPUT_ROOT,
    INDEXLAB_ROOT,
    fs,
    path,
    runDataStorageState,
    getSerperApiKey,
    getSerperEnabled,
    getSearxngStatus,
    startSearxngStack,
    startProcess,
    stopProcess,
    processStatus,
    isProcessRunning,
    waitForProcessExit,
    broadcastWs,
    fetchApi = globalThis.fetch,
    processRef = process,
  } = options;

  return {
    jsonRes,
    readJsonBody,
    listDirs,
    canonicalSlugify,
    HELPER_ROOT,
    DIST_ROOT,
    OUTPUT_ROOT,
    INDEXLAB_ROOT,
    fs,
    path,
    runDataStorageState,
    getSerperApiKey,
    getSerperEnabled,
    getSearxngStatus,
    startSearxngStack,
    startProcess,
    stopProcess,
    processStatus,
    isProcessRunning,
    waitForProcessExit,
    broadcastWs,
    fetchApi,
    processRef,
  };
}
