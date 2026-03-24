import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadConfig,
} from './helpers/sourceRegistryPhase02Harness.js';
// ========================================================================
// 8. DEFAULT-SYNC VERIFICATION (safety-audited)
// ========================================================================

describe('Phase02 — Default-Sync (safety-audited)', () => {
  const defaultConfig = loadConfig({});

  it('searchEngines has a valid engine in the shared runtime config', () => {
    const engines = String(defaultConfig.searchEngines || '').split(',').map(e => e.trim()).filter(Boolean);
    assert.ok(
      engines.length > 0,
      'searchEngines should have at least one engine configured'
    );
  });

});

// ========================================================================
// 9. REAL STARTUP SMOKE (registry loads cleanly through categories/loader)
// ========================================================================

describe('Phase02 — Real Startup Smoke', () => {
  // Registry always loads — no feature flag gating.

  for (const category of ['mouse', 'keyboard', 'monitor']) {
    it(`${category}: loadCategoryConfig produces valid registry`, async () => {
      const { loadCategoryConfig } = await import('../../../../../categories/loader.js');
      const config = await loadCategoryConfig(category, {
        config: {},
      });
      assert.ok(config.validatedRegistry, `${category} must have validatedRegistry`);
      assert.ok(config.validatedRegistry.entries.length > 0, `${category} must have entries`);
      assert.equal(config.validatedRegistry.category, category);
      assert.ok(config.registryPopulationGate, `${category} must have population gate result`);
      assert.equal(
        config.registryPopulationGate.passed, true,
        `${category} gate must pass: ${JSON.stringify(config.registryPopulationGate?.reasons)}`
      );
    });
  }
});
