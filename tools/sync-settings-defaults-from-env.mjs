import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnvFile } from '../src/config.js';
import {
  CONVERGENCE_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
} from '../src/api/services/settingsContract.js';
import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../src/shared/settingsDefaults.js';

const SECRET_RUNTIME_KEYS = new Set([
  'bingSearchKey',
  'googleCseKey',
  'llmPlanApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'cortexApiKey',
  'eloSupabaseAnonKey',
]);

function toSerializableRuntimeValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  return value ?? '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isScalarValue(value) {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function quoteString(value) {
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/'/g, "\\'")}'`;
}

function asCodeKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quoteString(key);
}

function toFrozenLiteral(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const nextPad = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'Object.freeze([])';
    }
    if (value.every(isScalarValue)) {
      const inlineItems = value.map((entry) => toFrozenLiteral(entry, 0));
      return `Object.freeze([${inlineItems.join(', ')}])`;
    }
    const items = value.map((entry) => `${nextPad}${toFrozenLiteral(entry, indent + 1)}`);
    return `Object.freeze([\n${items.join(',\n')}\n${pad}])`;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return 'Object.freeze({})';
    }
    const lines = entries.map(
      ([key, entry]) => `${nextPad}${asCodeKey(key)}: ${toFrozenLiteral(entry, indent + 1)}`,
    );
    return `Object.freeze({\n${lines.join(',\n')}\n${pad}})`;
  }
  if (typeof value === 'string') return quoteString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  return '""';
}

function buildRuntimeConfigKeyMap() {
  const pairs = [
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
  ];
  return new Map(pairs);
}

function buildConvergenceDefaults(config, baselineConvergence) {
  const next = { ...baselineConvergence };
  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    if (!Object.hasOwn(config, key)) continue;
    const value = config[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      next[key] = value;
    }
  }
  return next;
}

function buildRuntimeDefaults(config, baselineRuntime) {
  const next = { ...baselineRuntime };
  const runtimeConfigKeyMap = buildRuntimeConfigKeyMap();
  const candidateKeys = new Set(Object.keys(baselineRuntime));
  for (const key of candidateKeys) {
    if (SECRET_RUNTIME_KEYS.has(key)) continue;
    const configKey = runtimeConfigKeyMap.get(key) || key;
    if (!Object.hasOwn(config, configKey)) continue;
    next[key] = toSerializableRuntimeValue(config[configKey]);
  }
  return next;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const defaultsPath = path.join(repoRoot, 'src', 'shared', 'settingsDefaults.js');

  loadDotEnvFile(path.join(repoRoot, '.env'));
  const config = loadConfig();

  const nextDefaults = {
    convergence: buildConvergenceDefaults(config, SETTINGS_DEFAULTS.convergence),
    runtime: buildRuntimeDefaults(config, SETTINGS_DEFAULTS.runtime),
    storage: { ...SETTINGS_DEFAULTS.storage },
    ui: { ...SETTINGS_DEFAULTS.ui },
    autosave: {
      debounceMs: { ...SETTINGS_DEFAULTS.autosave.debounceMs },
      statusMs: { ...SETTINGS_DEFAULTS.autosave.statusMs },
    },
  };

  const source = [
    '// AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.',
    '// Run: npm run settings:sync-defaults',
    '',
    `export const SETTINGS_DEFAULTS = ${toFrozenLiteral(nextDefaults)};`,
    '',
    `export const SETTINGS_OPTION_VALUES = ${toFrozenLiteral(SETTINGS_OPTION_VALUES)};`,
    '',
  ].join('\n');

  await fs.writeFile(defaultsPath, source, 'utf8');
}

await main();
