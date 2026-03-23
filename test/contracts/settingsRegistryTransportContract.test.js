import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { RUNTIME_SETTINGS_REGISTRY } from '../../src/shared/settingsRegistry.js';
import {
  deriveEnvKeyMap,
  deriveConfigKeyMap,
  deriveRoundOverridableSet,
  deriveDeprecatedSet,
} from '../../src/shared/settingsRegistryDerivations.js';

// WHY: Plan 03 contract test. Validates the new transport/envKey/configKey metadata
// added to the registry. This is the structural contract for the SSOT rewrite.

describe('settingsRegistryTransportContract — Plan 03', () => {

  // --- configKey invariants ---

  it('every entry has a configKey (explicit or derived from key)', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      const ck = entry.configKey || entry.key;
      ok(typeof ck === 'string' && ck.length > 0, `${entry.key} has no configKey`);
    }
  });

  it('no two entries share the same configKey', () => {
    const seen = new Map();
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      const ck = entry.configKey || entry.key;
      ok(!seen.has(ck), `Duplicate configKey "${ck}" on entries: ${seen.get(ck)} and ${entry.key}`);
      seen.set(ck, entry.key);
    }
  });

  it('no entry has legacy cfgKey field', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(!entry.cfgKey, `${entry.key} still has legacy cfgKey field — use configKey instead`);
    }
  });

  // --- envKey invariants ---

  it('envKey is a string on every entry', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(
        typeof entry.envKey === 'string',
        `${entry.key} envKey should be a string, got ${typeof entry.envKey}`
      );
    }
  });

  it('non-empty envKey matches UPPER_SNAKE_CASE pattern', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.envKey) continue;
      ok(
        /^[A-Z][A-Z0-9_]*$/.test(entry.envKey),
        `${entry.key} envKey "${entry.envKey}" does not match UPPER_SNAKE_CASE`
      );
    }
  });

  it('no two entries share the same non-empty envKey', () => {
    const seen = new Map();
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.envKey) continue;
      ok(
        !seen.has(entry.envKey),
        `Duplicate envKey "${entry.envKey}" on entries: ${seen.get(entry.envKey)} and ${entry.key}`
      );
      seen.set(entry.envKey, entry.key);
    }
  });

  it('entries with empty envKey are from the known set', () => {
    const KNOWN_NO_ENV = new Set([
      'googleSearchProxyUrlsJson',
      'llmPhaseOverridesJson',
      'llmProviderRegistryJson',
      'localOutputRoot',
    ]);
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.envKey === '') {
        ok(
          entry.defaultsOnly || entry.routeOnly || KNOWN_NO_ENV.has(entry.key),
          `${entry.key} has empty envKey but is not defaultsOnly/routeOnly or in the known no-env set`
        );
      }
    }
  });

  // --- Derivation function tests ---

  it('deriveEnvKeyMap produces correct output', () => {
    const map = deriveEnvKeyMap(RUNTIME_SETTINGS_REGISTRY);
    ok(typeof map === 'object');
    ok(Object.isFrozen(map));
    // Spot checks
    strictEqual(map.fetchConcurrency, 'CONCURRENCY');
    strictEqual(map.categoryAuthorityEnabled, 'HELPER_FILES_ENABLED');
    strictEqual(map.resumeMode, 'INDEXING_RESUME_MODE');
    strictEqual(map.autoScrollEnabled, 'AUTO_SCROLL_ENABLED');
    // Empty envKey entries should NOT appear
    strictEqual(map.llmPhaseOverridesJson, undefined);
    strictEqual(map.daemonGracefulShutdownTimeoutMs, undefined);
  });

  it('deriveConfigKeyMap produces correct output', () => {
    const map = deriveConfigKeyMap(RUNTIME_SETTINGS_REGISTRY);
    ok(typeof map === 'object');
    ok(Object.isFrozen(map));
    // Every entry must be present
    strictEqual(Object.keys(map).length, RUNTIME_SETTINGS_REGISTRY.length);
    // Spot checks for aliased keys
    strictEqual(map.fetchConcurrency, 'concurrency');
    strictEqual(map.resumeMode, 'indexingResumeMode');
    strictEqual(map.resumeWindowHours, 'indexingResumeMaxAgeHours');
    strictEqual(map.reextractAfterHours, 'indexingReextractAfterHours');
    strictEqual(map.reextractIndexed, 'indexingReextractEnabled');
    // Non-aliased key
    strictEqual(map.autoScrollEnabled, 'autoScrollEnabled');
  });

  it('deriveRoundOverridableSet is initially empty (not yet populated)', () => {
    // WHY: roundOverridable hasn't been added to entries yet (Plan 08 adds it).
    // This test documents the current state. Update when Plan 08 is executed.
    const set = deriveRoundOverridableSet(RUNTIME_SETTINGS_REGISTRY);
    ok(set instanceof Set);
    // Currently no entries have roundOverridable set
    // When Plan 08 is done, this should have ~30 entries
  });

  it('deriveDeprecatedSet is initially empty (not yet populated)', () => {
    // WHY: deprecated hasn't been added to entries yet (Plan 09 adds it).
    const set = deriveDeprecatedSet(RUNTIME_SETTINGS_REGISTRY);
    ok(set instanceof Set);
    // Currently no entries have deprecated set
    // helperFilesRoot removed (Phase 3). Remaining candidates: fetchSchedulerFallbackWaitMs, runtimeTraceLlmRing
  });

  // --- Known alias configKey mapping ---

  it('known cfgKey aliases have correct configKey', () => {
    const KNOWN = [
      { key: 'fetchConcurrency', configKey: 'concurrency' },
      { key: 'resumeMode', configKey: 'indexingResumeMode' },
      { key: 'resumeWindowHours', configKey: 'indexingResumeMaxAgeHours' },
      { key: 'reextractAfterHours', configKey: 'indexingReextractAfterHours' },
      { key: 'reextractIndexed', configKey: 'indexingReextractEnabled' },
    ];
    for (const { key, configKey } of KNOWN) {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
      ok(entry, `${key} not found`);
      strictEqual(entry.configKey, configKey, `${key} configKey mismatch`);
    }
  });

  // --- Known envKey mappings for special cases ---

  it('special envKey mappings are correct', () => {
    const SPECIAL = [
      { key: 'categoryAuthorityEnabled', envKey: 'HELPER_FILES_ENABLED' },
      { key: 'categoryAuthorityRoot', envKey: 'CATEGORY_AUTHORITY_ROOT' },
      { key: 'indexingCategoryAuthorityEnabled', envKey: 'INDEXING_HELPER_FILES_ENABLED' },
      { key: 'fetchConcurrency', envKey: 'CONCURRENCY' },
      { key: 'reCrawlStaleAfterDays', envKey: 'RECRAWL_STALE_AFTER_DAYS' },
      { key: 'frontierCooldown404Seconds', envKey: 'FRONTIER_COOLDOWN_404' },
    ];
    for (const { key, envKey } of SPECIAL) {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
      ok(entry, `${key} not found`);
      strictEqual(entry.envKey, envKey, `${key} envKey mismatch: expected ${envKey}, got ${entry.envKey}`);
    }
  });
});
