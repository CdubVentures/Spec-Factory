import path from 'node:path';

import { registerInfraRoutes } from '../../infraRoutes.js';

export function createPresentPathFs(overrides = {}) {
  return {
    access: async () => {},
    mkdir: async () => {},
    ...overrides,
  };
}

export function createMissingPathError(message = 'missing') {
  const error = new Error(message);
  error.code = 'ENOENT';
  return error;
}

export function createMissingPathFs(overrides = {}) {
  return createPresentPathFs({
    access: async () => {
      throw createMissingPathError();
    },
    ...overrides,
  });
}

export function createInfraRoutesContext(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    listDirs: async () => [],
    canonicalSlugify: (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-'),
    HELPER_ROOT: path.resolve('category_authority'),
    DIST_ROOT: path.resolve('gui-dist'),
    OUTPUT_ROOT: path.resolve('out'),
    INDEXLAB_ROOT: path.resolve('indexlab'),
    fs: createPresentPathFs(),
    path,
    processRef: {
      cwd: () => process.cwd(),
      env: {},
      pkg: undefined,
    },
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
    },
    getSearxngStatus: async () => ({ ok: true }),
    startSearxngStack: async () => ({ ok: true }),
    startProcess: () => ({ running: true }),
    stopProcess: async () => ({ running: false }),
    processStatus: () => ({ running: false }),
    isProcessRunning: () => false,
    waitForProcessExit: async () => true,
    broadcastWs: () => {},
    ...overrides,
  };
}

export function createInfraRoutesHandler(overrides = {}) {
  return registerInfraRoutes(createInfraRoutesContext(overrides));
}

export async function invokeInfraRoute(
  handler,
  parts,
  method,
  { params = '', req = {}, res = {} } = {},
) {
  const searchParams =
    params instanceof URLSearchParams ? params : new URLSearchParams(params);
  return handler(parts, searchParams, method, req, res);
}
