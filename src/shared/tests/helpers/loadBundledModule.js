import crypto from 'node:crypto';
import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'sucrase';

const require = createRequire(import.meta.url);
const BUILTIN_MODULES = new Set([
  ...builtinModules,
  ...builtinModules.map((specifier) => specifier.replace(/^node:/, '')),
]);
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const ASSET_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.webp'];
const IMPORT_SPECIFIER_RE = /(?:\bimport\s+(?:[^'"]*?\s+from\s*)?|\bexport\s+[^'"]*?\s+from\s*|\bimport\s*\()\s*(['"])([^'"]+)\1/g;
const BUNDLED_MODULE_CACHE_VERSION = '2026-03-24-01';
const HELPER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HELPER_DIR, '../../../..');
const BUNDLED_MODULE_CACHE_ROOT = path.join(
  os.tmpdir(),
  'spec-factory-load-bundled-module-cache',
  BUNDLED_MODULE_CACHE_VERSION,
  `pid-${process.pid}`,
);
const bundledModuleGraphCache = new Map();
const bundledModuleGraphBuilds = new Map();
let bundledModuleCacheCleanupRegistered = false;

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function ensureRelativeSpecifier(fromFile, toFile) {
  const relative = toPosixPath(path.relative(path.dirname(fromFile), toFile));
  if (!relative) return './';
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function resolveSourceModule(baseDir, specifier) {
  const rawTarget = path.resolve(baseDir, specifier);
  const candidates = [rawTarget];
  const parsedTarget = path.parse(rawTarget);
  const hasExplicitJsLikeExtension = ['.js', '.jsx', '.mjs', '.cjs'].includes(parsedTarget.ext);

  for (const extension of SOURCE_EXTENSIONS) {
    candidates.push(`${rawTarget}${extension}`);
  }

  if (hasExplicitJsLikeExtension) {
    for (const extension of SOURCE_EXTENSIONS) {
      candidates.push(path.join(parsedTarget.dir, `${parsedTarget.name}${extension}`));
    }
  }

  for (const extension of SOURCE_EXTENSIONS) {
    candidates.push(path.join(rawTarget, `index${extension}`));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(`unable_to_resolve_module:${specifier}`);
}

function shouldStubAsset(specifier) {
  return ASSET_EXTENSIONS.some((extension) => specifier.endsWith(extension));
}

function stripSourceLikeExtension(specifier) {
  const text = String(specifier || '');
  for (const extension of SOURCE_EXTENSIONS) {
    if (text.endsWith(extension)) {
      return text.slice(0, -extension.length);
    }
  }
  return text;
}

function transpileModule(source, filePath) {
  const transformed = transform(source, {
    filePath,
    production: true,
    transforms: ['typescript', 'jsx'],
    jsxRuntime: 'automatic',
  });
  return transformed.code;
}

function rewriteImportSpecifiers(code, replacements) {
  return code.replace(IMPORT_SPECIFIER_RE, (fullMatch, quote, specifier) => {
    const replacement = replacements.get(specifier);
    if (!replacement) return fullMatch;
    return fullMatch.replace(`${quote}${specifier}${quote}`, `${quote}${replacement}${quote}`);
  });
}

function createAssetStubCode(specifier) {
  const value = JSON.stringify(String(specifier || ''));
  return `export default ${value};\n`;
}

function createReactStubWrapper(rawSpecifier) {
  return [
    `import * as inner from ${JSON.stringify(rawSpecifier)};`,
    `export * from ${JSON.stringify(rawSpecifier)};`,
    `export const memo = inner.memo ?? ((component) => component);`,
    `export const Fragment = inner.Fragment ?? Symbol.for('fragment');`,
    `export const createElement = inner.createElement ?? ((type, props, ...children) => ({`,
    `  type,`,
    `  props: {`,
    `    ...(props || {}),`,
    `    children: children.length <= 1`,
    `      ? (children.length === 1 ? children[0] : (props && 'children' in props ? props.children : null))`,
    `      : children,`,
    `  },`,
    `}));`,
    `export const useEffect = inner.useEffect ?? (() => {});`,
    `export const useMemo = inner.useMemo ?? ((factory) => factory());`,
    `export const useRef = inner.useRef ?? ((value = null) => ({ current: value }));`,
    `export const useId = inner.useId ?? (() => 'stub-id');`,
    `export const useState = inner.useState ?? ((initialValue) => [typeof initialValue === 'function' ? initialValue() : initialValue, () => {}]);`,
    `export const useCallback = inner.useCallback ?? ((fn) => fn);`,
    `export const useDeferredValue = inner.useDeferredValue ?? ((value) => value);`,
    `export const useSyncExternalStore = inner.useSyncExternalStore ?? ((_subscribe, getSnapshot) => getSnapshot());`,
    `export const startTransition = inner.startTransition ?? ((callback) => callback());`,
    `const defaultExport = inner.default ?? {`,
    `  ...inner,`,
    `  memo,`,
    `  Fragment,`,
    `  createElement,`,
    `  useEffect,`,
    `  useMemo,`,
    `  useRef,`,
    `  useId,`,
    `  useState,`,
    `  useCallback,`,
    `  useDeferredValue,`,
    `  useSyncExternalStore,`,
    `  startTransition,`,
    `};`,
    `export default defaultExport;`,
    '',
  ].join('\n');
}

function createJsxRuntimeStubWrapper(rawSpecifier) {
  return [
    `import * as inner from ${JSON.stringify(rawSpecifier)};`,
    `export * from ${JSON.stringify(rawSpecifier)};`,
    `export const Fragment = inner.Fragment ?? Symbol.for('fragment');`,
    `export const jsx = inner.jsx ?? ((type, props) => ({ type, props: props || {} }));`,
    `export const jsxs = inner.jsxs ?? jsx;`,
    `export const jsxDEV = inner.jsxDEV ?? jsx;`,
    `const defaultExport = inner.default ?? { jsx, jsxs, jsxDEV, Fragment };`,
    `export default defaultExport;`,
    '',
  ].join('\n');
}

function createZustandStubCode() {
  return [
    'function createStore(initializer) {',
    '  let state;',
    '  const listeners = new Set();',
    '  const api = {',
    '    setState(partial, replace = false) {',
    "      const resolved = typeof partial === 'function' ? partial(state) : partial;",
    "      const nextState = replace || typeof resolved !== 'object' || resolved === null",
    '        ? resolved',
    '        : { ...(state || {}), ...resolved };',
    '      state = nextState;',
    '      for (const listener of listeners) listener(state);',
    '    },',
    '    getState() {',
    '      return state;',
    '    },',
    '    subscribe(listener) {',
    '      listeners.add(listener);',
    '      return () => listeners.delete(listener);',
    '    },',
    '    destroy() {',
    '      listeners.clear();',
    '    },',
    '  };',
    '',
    '  state = initializer(api.setState, api.getState, api);',
    '',
    '  function useStore(selector = (value) => value) {',
    "    return typeof selector === 'function' ? selector(state) : state;",
    '  }',
    '',
    '  useStore.getState = api.getState;',
    '  useStore.setState = api.setState;',
    '  useStore.subscribe = api.subscribe;',
    '  useStore.destroy = api.destroy;',
    '  return useStore;',
    '}',
    '',
    'export function create(initializer) {',
    "  if (typeof initializer === 'function') return createStore(initializer);",
    "  return (nextInitializer) => createStore(nextInitializer);",
    '}',
    '',
    'export default create;',
    '',
  ].join('\n');
}

function createZustandMiddlewareStubCode() {
  return [
    'export function createJSONStorage(getStorage) {',
    '  const storage = typeof getStorage === "function" ? getStorage() : null;',
    '  return {',
    '    getItem(name) {',
    '      const raw = storage?.getItem?.(name) ?? null;',
    '      if (!raw) return null;',
    '      try {',
    '        return JSON.parse(raw);',
    '      } catch {',
    '        return null;',
    '      }',
    '    },',
    '    setItem(name, value) {',
    '      storage?.setItem?.(name, JSON.stringify(value));',
    '    },',
    '    removeItem(name) {',
    '      storage?.removeItem?.(name);',
    '    },',
    '  };',
    '}',
    '',
    'export function persist(config, options = {}) {',
    '  return (set, get, api) => {',
    '    const storage = options.storage;',
    '    const persistState = () => {',
    '      if (!storage || typeof storage.setItem !== "function") return;',
    "      const current = typeof get === 'function' ? get() : undefined;",
    '      if (current === undefined) return;',
    "      const partial = typeof options.partialize === 'function' ? options.partialize(current) : current;",
    '      storage.setItem(options.name, { state: partial, version: 0 });',
    '    };',
    '',
    '    const wrappedSet = (partial, replace) => {',
    '      set(partial, replace);',
    '      persistState();',
    '    };',
    '',
    "    const current = typeof get === 'function' ? get() : undefined;",
    '    const baseState = config(wrappedSet, get, api);',
    '    const persistedValue = storage && typeof storage.getItem === "function"',
    '      ? storage.getItem(options.name)',
    '      : null;',
    '    const persistedState = persistedValue && typeof persistedValue === "object"',
    '      ? persistedValue.state ?? persistedValue',
    '      : null;',
    '    const mergedState = persistedState',
    "      ? (typeof options.merge === 'function' ? options.merge(persistedState, baseState) : { ...baseState, ...persistedState })",
    '      : baseState;',
    '',
    '    api.persist = {',
    '      clearStorage() {',
    '        storage?.removeItem?.(options.name);',
    '      },',
    '      getOptions() {',
    '        return options;',
    '      },',
    '      hasHydrated() {',
    '        return true;',
    '      },',
    '      rehydrate() {',
    '        return mergedState;',
    '      },',
    '      setOptions(nextOptions) {',
    '        Object.assign(options, nextOptions || {});',
    '      },',
    '    };',
    '',
    '    if (persistedState) {',
    '      set(mergedState, true);',
    '    }',
    '',
    '    return mergedState;',
    '  };',
    '}',
    '',
  ].join('\n');
}

function isReactFallbackSpecifier(specifier) {
  return specifier === 'react' || specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime';
}

function getBuiltInFallbackStub(specifier) {
  if (specifier === 'react') return '';
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') {
    return `
      export function jsx(type, props) {
        return { type, props: props || {} };
      }
      export const jsxs = jsx;
      export const jsxDEV = jsx;
      export const Fragment = Symbol.for('fragment');
    `;
  }
  if (specifier === 'zustand') {
    return createZustandStubCode();
  }
  if (specifier === 'zustand/middleware') {
    return createZustandMiddlewareStubCode();
  }
  return null;
}

function resolveBareSpecifier(specifier) {
  try {
    require.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

function collectStubRequirements(statement) {
  const requirements = {
    exportNames: new Set(),
    needsDefault: false,
  };

  const sourceText = String(statement || '').trim();
  if (!sourceText) return requirements;
  if (sourceText.startsWith('import(')) return requirements;
  if (/^import\s*['"]/.test(sourceText)) return requirements;

  const fromIndex = sourceText.lastIndexOf(' from ');
  const clause = fromIndex >= 0
    ? sourceText.slice(sourceText.startsWith('export') ? 'export'.length : 'import'.length, fromIndex).trim()
    : '';

  if (sourceText.startsWith('import') && clause && !clause.startsWith('{') && !clause.startsWith('*')) {
    requirements.needsDefault = true;
  }

  const braceMatch = clause.match(/\{([^}]+)\}/);
  if (!braceMatch) return requirements;

  for (const token of braceMatch[1].split(',')) {
    const normalized = String(token || '').trim();
    if (!normalized) continue;
    const [exportName] = normalized.split(/\s+as\s+/i);
    const cleaned = String(exportName || '').trim();
    if (cleaned) {
      requirements.exportNames.add(cleaned);
    }
  }

  return requirements;
}

function createGenericBareStubCode({ exportNames = [], needsDefault = false } = {}) {
  const lines = [
    "const stub = new Proxy(function stubbedDependency() { return null; }, {",
    "  get() { return stub; },",
    "  apply() { return null; },",
    "});",
  ];

  for (const exportName of exportNames) {
    lines.push(`export const ${exportName} = stub;`);
  }

  if (needsDefault || exportNames.length === 0) {
    lines.push('export default stub;');
  }

  lines.push('');
  return lines.join('\n');
}

function createResolvedBareModuleStubCode(resolvedSpecifierPath) {
  const target = pathToFileURL(resolvedSpecifierPath).href;
  return [
    `import * as inner from ${JSON.stringify(target)};`,
    `export * from ${JSON.stringify(target)};`,
    'const defaultExport = inner.default ?? inner;',
    'export default defaultExport;',
    '',
  ].join('\n');
}

function isResolvedExternalSpecifier(specifier) {
  const text = String(specifier || '');
  return text.startsWith('file:')
    || /^[A-Za-z]:[\\/]/.test(text)
    || text.startsWith('/');
}

function resolveBareSpecifierPath(specifier, fromDir = process.cwd()) {
  if (BUILTIN_MODULES.has(specifier) || specifier.startsWith('node:')) {
    return null;
  }
  try {
    return require.resolve(specifier, { paths: [fromDir] });
  } catch {
    return null;
  }
}

function normalizeStubEntries(stubs = {}) {
  return Object.entries(stubs || {})
    .map(([specifier, source]) => [String(specifier || ''), String(source ?? '')])
    .sort((left, right) => left[0].localeCompare(right[0]));
}

function createBundleCacheKey(entryPath, stubs = {}) {
  return crypto.createHash('sha1').update(JSON.stringify({
    entryPath: path.resolve(entryPath),
    stubs: normalizeStubEntries(stubs),
  })).digest('hex');
}

function getBundleCachePaths(cacheKey) {
  const cacheDir = path.join(BUNDLED_MODULE_CACHE_ROOT, cacheKey);
  return {
    cacheDir,
    bundleDir: path.join(cacheDir, 'bundle'),
    manifestPath: path.join(cacheDir, 'manifest.json'),
  };
}

function resolveEntryPath(entryRelativePath) {
  const rawPath = String(entryRelativePath || '');
  if (path.isAbsolute(rawPath)) return rawPath;

  const cwdPath = path.resolve(rawPath);
  if (fs.existsSync(cwdPath)) return cwdPath;

  return path.resolve(REPO_ROOT, rawPath);
}

function buildDependencySignature(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
}

function dependenciesAreFresh(dependencies = []) {
  for (const dependency of dependencies) {
    try {
      if (!dependency?.path || !fs.existsSync(dependency.path)) return false;
      const stat = fs.statSync(dependency.path);
      if (stat.mtimeMs !== dependency.mtimeMs || stat.size !== dependency.size) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function getFreshCachedBundle(cacheKey) {
  const inMemory = bundledModuleGraphCache.get(cacheKey);
  if (inMemory && fs.existsSync(inMemory.bundleDir) && dependenciesAreFresh(inMemory.dependencies)) {
    return inMemory;
  }

  const { bundleDir, manifestPath } = getBundleCachePaths(cacheKey);
  if (!fs.existsSync(bundleDir) || !fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!dependenciesAreFresh(manifest.dependencies)) {
      return null;
    }
    const cached = {
      cacheKey,
      bundleDir,
      entryOutputRelativePath: String(manifest.entryOutputRelativePath || ''),
      dependencies: Array.isArray(manifest.dependencies) ? manifest.dependencies : [],
    };
    bundledModuleGraphCache.set(cacheKey, cached);
    return cached;
  } catch {
    return null;
  }
}

function registerBundledModuleCacheCleanup() {
  if (bundledModuleCacheCleanupRegistered) return;
  bundledModuleCacheCleanupRegistered = true;
  process.once('exit', () => {
    try {
      fs.rmSync(BUNDLED_MODULE_CACHE_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures in test shutdown.
    }
  });
}

async function buildBundledGraph(entryPath, stubs = {}) {
  const cacheKey = createBundleCacheKey(entryPath, stubs);
  const cached = getFreshCachedBundle(cacheKey);
  if (cached) return cached;

  if (bundledModuleGraphBuilds.has(cacheKey)) {
    return bundledModuleGraphBuilds.get(cacheKey);
  }

  const buildPromise = (async () => {
    const { cacheDir, bundleDir, manifestPath } = getBundleCachePaths(cacheKey);
    registerBundledModuleCacheCleanup();
    fs.mkdirSync(BUNDLED_MODULE_CACHE_ROOT, { recursive: true });

    const stagingDir = fs.mkdtempSync(path.join(BUNDLED_MODULE_CACHE_ROOT, `${cacheKey}-`));
    const buildRoot = path.join(stagingDir, 'bundle');
    const emittedFiles = new Map();
    const stubFiles = new Map();
    const genericBareStubRequirements = new Map();
    const dependencies = new Map();

    function resolveStubSource(specifier) {
      if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
        return stubs[specifier];
      }
      const strippedSpecifier = stripSourceLikeExtension(specifier);
      if (
        strippedSpecifier !== specifier
        && Object.prototype.hasOwnProperty.call(stubs, strippedSpecifier)
      ) {
        return stubs[strippedSpecifier];
      }
      return null;
    }

    function stubOutputPath(specifier) {
      const hash = crypto.createHash('sha1').update(String(specifier || '')).digest('hex').slice(0, 12);
      return path.join(buildRoot, '__stubs__', `${hash}.mjs`);
    }

    function moduleOutputPath(absPath) {
      const relativePath = path.relative(REPO_ROOT, absPath);
      const normalized = relativePath && !relativePath.startsWith('..')
        ? relativePath
        : path.basename(absPath);
      const parsed = path.parse(normalized);
      return path.join(buildRoot, parsed.dir, `${parsed.name}.mjs`);
    }

    async function writeStub(specifier, contents) {
      if (stubFiles.has(specifier)) {
        return stubFiles.get(specifier);
      }

      const outPath = stubOutputPath(specifier);
      const rawPath = path.join(path.dirname(outPath), `${path.basename(outPath, '.mjs')}.raw.mjs`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const transpiledContents = transpileModule(contents, `${specifier}.tsx`);
      const stubReplacements = new Map();

      for (const match of transpiledContents.matchAll(IMPORT_SPECIFIER_RE)) {
        const importedSpecifier = match[2];
        if (stubReplacements.has(importedSpecifier)) continue;
        if (importedSpecifier === specifier) continue;
        if (importedSpecifier.startsWith('node:') || isResolvedExternalSpecifier(importedSpecifier)) continue;

        const importedStubSource = resolveStubSource(importedSpecifier);
        if (importedStubSource !== null) {
          const dependencyPath = await writeStub(importedSpecifier, importedStubSource);
          stubReplacements.set(importedSpecifier, ensureRelativeSpecifier(rawPath, dependencyPath));
          continue;
        }

        const builtInFallbackStub = getBuiltInFallbackStub(importedSpecifier);
        if (builtInFallbackStub !== null) {
          const dependencyPath = await writeStub(importedSpecifier, builtInFallbackStub);
          stubReplacements.set(importedSpecifier, ensureRelativeSpecifier(rawPath, dependencyPath));
          continue;
        }

        const resolvedBarePath = resolveBareSpecifierPath(importedSpecifier, process.cwd());
        if (resolvedBarePath) {
          const dependencyPath = await writeStub(
            importedSpecifier,
            createResolvedBareModuleStubCode(resolvedBarePath),
          );
          stubReplacements.set(importedSpecifier, ensureRelativeSpecifier(rawPath, dependencyPath));
          continue;
        }

        if (!resolveBareSpecifier(importedSpecifier)) {
          const dependencyPath = await writeGenericBareStub(importedSpecifier, collectStubRequirements(match[0]));
          stubReplacements.set(importedSpecifier, ensureRelativeSpecifier(rawPath, dependencyPath));
        }
      }

      fs.writeFileSync(rawPath, rewriteImportSpecifiers(transpiledContents, stubReplacements), 'utf8');

      if (specifier === 'react') {
        fs.writeFileSync(outPath, createReactStubWrapper(`./${path.basename(rawPath)}`), 'utf8');
      } else if (specifier === 'react/jsx-runtime') {
        fs.writeFileSync(outPath, createJsxRuntimeStubWrapper(`./${path.basename(rawPath)}`), 'utf8');
      } else if (specifier === 'react/jsx-dev-runtime') {
        fs.writeFileSync(outPath, createJsxRuntimeStubWrapper(`./${path.basename(rawPath)}`), 'utf8');
      } else {
        fs.copyFileSync(rawPath, outPath);
      }
      stubFiles.set(specifier, outPath);
      return outPath;
    }

    async function writeGenericBareStub(specifier, requirements) {
      const existing = genericBareStubRequirements.get(specifier) || {
        exportNames: new Set(),
        needsDefault: false,
      };

      for (const exportName of requirements.exportNames || []) {
        existing.exportNames.add(exportName);
      }
      existing.needsDefault = existing.needsDefault || Boolean(requirements.needsDefault);
      genericBareStubRequirements.set(specifier, existing);

      const code = createGenericBareStubCode({
        exportNames: [...existing.exportNames].sort(),
        needsDefault: existing.needsDefault,
      });

      return writeStub(specifier, code);
    }

    async function emitModule(absPath) {
      if (emittedFiles.has(absPath)) {
        return emittedFiles.get(absPath);
      }

      dependencies.set(absPath, buildDependencySignature(absPath));

      const outPath = moduleOutputPath(absPath);
      emittedFiles.set(absPath, outPath);

      const source = fs.readFileSync(absPath, 'utf8');
      const transpiled = transpileModule(source, absPath);
      const replacements = new Map();
      const dirName = path.dirname(absPath);

      for (const match of transpiled.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[2];
        if (replacements.has(specifier)) continue;
        if (specifier.startsWith('node:') || isResolvedExternalSpecifier(specifier)) continue;

        const stubSource = resolveStubSource(specifier);
        if (stubSource !== null) {
          const stubPath = await writeStub(specifier, stubSource);
          replacements.set(specifier, ensureRelativeSpecifier(outPath, stubPath));
          continue;
        }

        const builtInFallbackStub = getBuiltInFallbackStub(specifier);
        if (builtInFallbackStub !== null) {
          const stubPath = await writeStub(specifier, builtInFallbackStub);
          replacements.set(specifier, ensureRelativeSpecifier(outPath, stubPath));
          continue;
        }

        if (shouldStubAsset(specifier)) {
          const stubPath = await writeStub(specifier, createAssetStubCode(specifier));
          replacements.set(specifier, ensureRelativeSpecifier(outPath, stubPath));
          continue;
        }

        if (specifier.startsWith('.')) {
          const resolvedPath = resolveSourceModule(dirName, specifier);
          const emittedPath = await emitModule(resolvedPath);
          replacements.set(specifier, ensureRelativeSpecifier(outPath, emittedPath));
          continue;
        }

        const resolvedBarePath = resolveBareSpecifierPath(specifier, dirName);
        if (resolvedBarePath) {
          const stubPath = await writeStub(specifier, createResolvedBareModuleStubCode(resolvedBarePath));
          replacements.set(specifier, ensureRelativeSpecifier(outPath, stubPath));
          continue;
        }

        if (!resolveBareSpecifier(specifier)) {
          const stubPath = await writeGenericBareStub(specifier, collectStubRequirements(match[0]));
          replacements.set(specifier, ensureRelativeSpecifier(outPath, stubPath));
        }
      }

      const rewritten = rewriteImportSpecifiers(transpiled, replacements);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, rewritten, 'utf8');
      return outPath;
    }

    try {
      const entryOutputPath = await emitModule(path.resolve(entryPath));
      const manifest = {
        entryOutputRelativePath: toPosixPath(path.relative(buildRoot, entryOutputPath)),
        dependencies: [...dependencies.values()].sort((left, right) => left.path.localeCompare(right.path)),
      };

      fs.mkdirSync(cacheDir, { recursive: true });
      fs.rmSync(bundleDir, { recursive: true, force: true });
      fs.cpSync(buildRoot, bundleDir, { recursive: true, force: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const result = {
        cacheKey,
        bundleDir,
        entryOutputRelativePath: manifest.entryOutputRelativePath,
        dependencies: manifest.dependencies,
      };
      bundledModuleGraphCache.set(cacheKey, result);
      return result;
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    }
  })();

  bundledModuleGraphBuilds.set(cacheKey, buildPromise);
  try {
    return await buildPromise;
  } finally {
    bundledModuleGraphBuilds.delete(cacheKey);
  }
}

export async function loadBundledModule(entryRelativePath, {
  stubs = {},
  prefix = 'bundled-module-',
} = {}) {
  const entryPath = resolveEntryPath(entryRelativePath);
  const cachedGraph = await buildBundledGraph(entryPath, stubs);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const bundleDir = path.join(tmpDir, 'bundle');
  fs.cpSync(cachedGraph.bundleDir, bundleDir, { recursive: true, force: true });
  const entryOutputPath = path.resolve(bundleDir, cachedGraph.entryOutputRelativePath);

  try {
    return await import(`${pathToFileURL(entryOutputPath).href}?v=${Date.now()}-${Math.random()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
