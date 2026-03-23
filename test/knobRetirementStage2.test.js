import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import {
  CONVERGENCE_SETTINGS_KEYS,
  RUNTIME_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
} from '../src/features/settings-authority/settingsContract.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

describe('Stage 2 knob retirement — hardcoded values', () => {
  it('serpTriageEnabled is fully retired (no longer in config)', () => {
    const config = loadConfig();
    assert.equal(config.serpTriageEnabled, undefined);
  });

  it('llmSerpRerankEnabled is fully retired (no longer in config)', () => {
    const config = loadConfig();
    // WHY: llmSerpRerankEnabled removed entirely — LLM escalation gated by uberMode only
    assert.equal(config.llmSerpRerankEnabled, undefined);
  });

  it('discoveryResultsPerQuery keeps default value 10', () => {
    const config = loadConfig();
    assert.equal(config.discoveryResultsPerQuery, 10);
  });

  it('discoveryQueryConcurrency keeps default value 2', () => {
    const config = loadConfig();
    assert.equal(config.discoveryQueryConcurrency, 2);
  });

  it('env var DISCOVERY_RESULTS_PER_QUERY is respected', () => {
    const original = process.env.DISCOVERY_RESULTS_PER_QUERY;
    try {
      process.env.DISCOVERY_RESULTS_PER_QUERY = '99';
      const config = loadConfig();
      assert.equal(config.discoveryResultsPerQuery, 99);
    } finally {
      if (original !== undefined) {
        process.env.DISCOVERY_RESULTS_PER_QUERY = original;
      } else {
        delete process.env.DISCOVERY_RESULTS_PER_QUERY;
      }
    }
  });

  it('env var DISCOVERY_QUERY_CONCURRENCY is respected', () => {
    const original = process.env.DISCOVERY_QUERY_CONCURRENCY;
    try {
      process.env.DISCOVERY_QUERY_CONCURRENCY = '16';
      const config = loadConfig();
      assert.equal(config.discoveryQueryConcurrency, 16);
    } finally {
      if (original !== undefined) {
        process.env.DISCOVERY_QUERY_CONCURRENCY = original;
      } else {
        delete process.env.DISCOVERY_QUERY_CONCURRENCY;
      }
    }
  });

  it('retired stage 2 knobs remain removed from shared defaults and settings authority surfaces', () => {
    const retiredRuntimeKeys = [
      'phase3LlmTriageEnabled',
      'llmSerpRerankEnabled',
    ];

    for (const key of retiredRuntimeKeys) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS.runtime, key),
        false,
        `runtime shared defaults should not expose retired knob ${key}`,
      );
      assert.equal(
        RUNTIME_SETTINGS_KEYS.includes(key),
        false,
        `runtime settings keys should not expose retired knob ${key}`,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(RUNTIME_SETTINGS_ROUTE_GET.intMap || {}, key)
          || Object.prototype.hasOwnProperty.call(RUNTIME_SETTINGS_ROUTE_GET.boolMap || {}, key)
          || Object.prototype.hasOwnProperty.call(RUNTIME_SETTINGS_ROUTE_GET.stringMap || {}, key),
        false,
        `runtime GET settings surface should not expose retired knob ${key}`,
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap || {}, key)
          || Object.prototype.hasOwnProperty.call(RUNTIME_SETTINGS_ROUTE_PUT.boolMap || {}, key)
          || Object.prototype.hasOwnProperty.call(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap || {}, key),
        false,
        `runtime PUT settings surface should not expose retired knob ${key}`,
      );
    }

    assert.equal(
      Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS.convergence, 'serpTriageEnabled'),
      false,
      'convergence shared defaults should not expose retired serpTriageEnabled',
    );
    assert.equal(
      CONVERGENCE_SETTINGS_KEYS.includes('serpTriageEnabled'),
      false,
      'convergence settings keys should not expose retired serpTriageEnabled',
    );
  });
});
