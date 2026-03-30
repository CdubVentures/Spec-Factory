import { registerStudioRoutes } from '../../studioRoutes.js';

export function makeCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    HELPER_ROOT: 'category_authority',
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
    fs: {
      mkdir: async () => {},
      writeFile: async () => {},
      readdir: async () => [],
    },
    path: {
      join: (...parts) => parts.join('/'),
    },
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {},
        mergedFieldOrder: [],
        labels: {},
        compiledAt: null,
        mapSavedAt: null,
        compileStale: false,
      }),
      invalidateSessionCache: () => {},
    },
    loadFieldStudioMap: async () => ({ file_path: '', map: {} }),
    saveFieldStudioMap: async () => ({ ok: true }),
    validateFieldStudioMap: (map) => ({ valid: true, errors: [], warnings: [], normalized: map }),
    invalidateFieldRulesCache: () => {},
    buildFieldLabelsMap: () => ({}),
    storage: {},
    loadCategoryConfig: async () => ({}),
    startProcess: () => ({ running: true }),
    getSpecDb: () => null,
    getSpecDbReady: async () => null,
    broadcastWs: () => {},
    reviewLayoutByCategory: new Map(),
    loadProductCatalog: async () => ({ products: {} }),
    cleanVariant: (value) => String(value || '').trim(),
  };
  return { ...ctx, ...overrides };
}

export async function invokeStudioRoute(ctxOverrides, parts, method, params = new URLSearchParams()) {
  const handler = registerStudioRoutes(makeCtx(ctxOverrides));
  return handler(parts, params, method, {}, {});
}
