// WHY: Contract test for the generic config assembly loop.
// assembleConfigFromRegistry produces values for SIMPLE settings (those that
// follow the parseXxxEnv('ENV_KEY', default) pattern) from the registry SSOT.
// CUSTOM settings (computed, json-normalize, multi-env, sub-field, hardcoded)
// are excluded via CUSTOM_KEYS and handled as overlays in configBuilder.

import { describe, it, before, after } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import { assembleConfigFromRegistry, CUSTOM_KEYS } from '../src/core/config/configAssembly.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';

const SAVED_ENV = { ...process.env };

function clearAppEnv() {
  const prefixes = [
    'AWS_', 'S3_', 'MAX_', 'LLM_', 'OPENAI_', 'DEEPSEEK_', 'GEMINI_',
    'ANTHROPIC_', 'SEARCH_', 'SEARXNG_', 'SERPER_', 'FRONTIER_', 'CRAWLEE_',
    'DYNAMIC_', 'STATIC_', 'RUNTIME_', 'INDEXING_', 'HELPER_', 'CATEGORY_',
    'LOCAL_', 'MIRROR_', 'OUTPUT_', 'SPEC_', 'PDF_', 'SCANNED_', 'FETCH_',
    'CAPTURE_', 'AUTO_SCROLL_', 'ROBOTS_', 'ENDPOINT_', 'DOMAIN_', 'GLOBAL_',
    'PAGE_', 'POST_LOAD_', 'ARTICLE_', 'DOM_', 'BATCH_', 'REPAIR_',
    'HYPOTHESIS_', 'FIELD_', 'EVENTS_', 'IMPORTS_', 'DAEMON_', 'DRIFT_',
    'GRAPHQL_', 'SELF_IMPROVE_', 'DRY_RUN', 'PREFER_', 'CONCURRENCY',
    'PER_HOST_', 'USER_AGENT', 'ELO_', 'SERP_', 'RECRAWL_', 'WRITE_',
    'DISCOVERY_',
  ];
  for (const key of Object.keys(process.env)) {
    if (prefixes.some(p => key.startsWith(p))) delete process.env[key];
  }
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in SAVED_ENV)) delete process.env[key];
  }
  Object.assign(process.env, SAVED_ENV);
}

describe('assembleConfigFromRegistry', () => {
  let cfg;

  before(() => {
    clearAppEnv();
    cfg = assembleConfigFromRegistry(RUNTIME_SETTINGS_REGISTRY);
  });

  after(() => {
    restoreEnv();
  });

  it('returns a non-null object', () => {
    ok(cfg && typeof cfg === 'object');
  });

  it('includes all non-custom registry entries with envKey', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (CUSTOM_KEYS.has(entry.key)) continue;
      if (CUSTOM_KEYS.has(entry.configKey)) continue;
      if (!entry.envKey) continue;
      if (entry.routeOnly || entry.defaultsOnly) continue;
      const cfgKey = entry.configKey || entry.key;
      ok(cfgKey in cfg, `missing cfg key: ${cfgKey} (registry key: ${entry.key})`);
    }
  });

  it('excludes custom keys', () => {
    for (const key of CUSTOM_KEYS) {
      ok(!(key in cfg), `custom key should not be in assembled cfg: ${key}`);
    }
  });

  it('int entries produce numbers', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (CUSTOM_KEYS.has(entry.key) || CUSTOM_KEYS.has(entry.configKey)) continue;
      if (entry.type !== 'int') continue;
      if (!entry.envKey || entry.routeOnly || entry.defaultsOnly) continue;
      const cfgKey = entry.configKey || entry.key;
      strictEqual(typeof cfg[cfgKey], 'number',
        `${cfgKey} should be number, got ${typeof cfg[cfgKey]}`);
    }
  });

  it('bool entries produce booleans', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (CUSTOM_KEYS.has(entry.key) || CUSTOM_KEYS.has(entry.configKey)) continue;
      if (entry.type !== 'bool') continue;
      if (!entry.envKey || entry.routeOnly || entry.defaultsOnly) continue;
      const cfgKey = entry.configKey || entry.key;
      strictEqual(typeof cfg[cfgKey], 'boolean',
        `${cfgKey} should be boolean, got ${typeof cfg[cfgKey]}`);
    }
  });

  it('float entries produce numbers', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (CUSTOM_KEYS.has(entry.key) || CUSTOM_KEYS.has(entry.configKey)) continue;
      if (entry.type !== 'float') continue;
      if (!entry.envKey || entry.routeOnly || entry.defaultsOnly) continue;
      const cfgKey = entry.configKey || entry.key;
      strictEqual(typeof cfg[cfgKey], 'number',
        `${cfgKey} should be number, got ${typeof cfg[cfgKey]}`);
    }
  });

  it('string/enum entries produce strings', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (CUSTOM_KEYS.has(entry.key) || CUSTOM_KEYS.has(entry.configKey)) continue;
      if (!['string', 'enum', 'csv_enum'].includes(entry.type)) continue;
      if (!entry.envKey || entry.routeOnly || entry.defaultsOnly) continue;
      const cfgKey = entry.configKey || entry.key;
      strictEqual(typeof cfg[cfgKey], 'string',
        `${cfgKey} should be string, got ${typeof cfg[cfgKey]}`);
    }
  });

  it('default values match registry (clean env, no env overrides)', () => {
    const spot = [
      { key: 'maxPagesPerDomain', expected: 5 },
      { key: 'maxRunSeconds', expected: 480 },
      { key: 'searchProfileQueryCap', expected: 10 },
      { key: 'searchPlannerQueryCap', expected: 30 },
      { key: 'discoveryResultsPerQuery', expected: 10 },
      { key: 'discoveryQueryConcurrency', expected: 2 },
      { key: 'fetchBudgetMs', expected: 45000 },
      { key: 'robotsTxtTimeoutMs', expected: 6000 },
      { key: 'driftPollSeconds', expected: 86400 },
    ];
    for (const { key, expected } of spot) {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
      const cfgKey = entry?.configKey || key;
      strictEqual(cfg[cfgKey], expected, `${cfgKey} default should be ${expected}`);
    }
  });

  it('env override propagates for int settings', () => {
    clearAppEnv();
    process.env.MAX_RUN_SECONDS = '999';
    const overrideCfg = assembleConfigFromRegistry(RUNTIME_SETTINGS_REGISTRY);
    strictEqual(overrideCfg.maxRunSeconds, 999);
    delete process.env.MAX_RUN_SECONDS;
  });

  it('env override propagates for bool settings', () => {
    clearAppEnv();
    process.env.DRY_RUN = 'true';
    const overrideCfg = assembleConfigFromRegistry(RUNTIME_SETTINGS_REGISTRY);
    strictEqual(overrideCfg.dryRun, true);
    delete process.env.DRY_RUN;
  });

  it('env override propagates for string settings', () => {
    clearAppEnv();
    process.env.FRONTIER_DB_PATH = '/custom/path';
    const overrideCfg = assembleConfigFromRegistry(RUNTIME_SETTINGS_REGISTRY);
    strictEqual(overrideCfg.frontierDbPath, '/custom/path');
    delete process.env.FRONTIER_DB_PATH;
  });
});
