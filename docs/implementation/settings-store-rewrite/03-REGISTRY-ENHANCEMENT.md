# Plan 03: Registry Enhancement — Transport & Consumer Metadata

## Goal
Extend `RUNTIME_SETTINGS_REGISTRY` so each setting declares HOW it reaches the child process, WHICH env var it maps to, WHICH config key it uses, and WHETHER round overrides are allowed. This is the structural SSOT that makes all other plans possible.

## Depends On
Plan 02 (characterization tests must be green first)

## Blocks
Plans 05, 06, 07 (they consume the enhanced registry)

---

## Files to Modify

### 1. `src/shared/settingsRegistry.js`

#### New Fields Per Entry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `envKey` | string | Yes (empty if no env var) | Exact `UPPER_SNAKE_CASE` env var name. Derived from configBuilder.js audit. |
| `configKey` | string | Yes | Exact key on the config object. Replaces `cfgKey`. Defaults to `key` if same. |
| `transport` | `'snapshot'` \| `'env'` \| `'cli'` | Yes (default: `'snapshot'`) | How the setting reaches the child process. |
| `roundOverridable` | boolean | No (default: false) | Whether roundConfigBuilder.js may override this setting. |
| `deprecated` | boolean | No (default: false) | Whether this setting is being retired. |
| `uiSection` | string | No | Which pipeline settings section displays this knob. |

#### Transport Values

- `'snapshot'` — Setting travels via runtime snapshot JSON file (new default). All 209 settings use this.
- `'env'` — Setting ALSO needs an env var because it's read before config loads (path resolution, process-level). Small set: CATEGORY_AUTHORITY_ROOT, SPEC_DB_DIR, LLM_EXTRACTION_CACHE_DIR, LOCAL_OUTPUT_ROOT.
- `'cli'` — Setting is passed as a CLI argument (category, productId, searchEngines, runId).

#### Migration: cfgKey → configKey

Current entries with `cfgKey`:
- `fetchConcurrency` → cfgKey: `"concurrency"` → configKey: `"concurrency"`
- `reextractAfterHours` → cfgKey: `"indexingReextractAfterHours"` → configKey: `"indexingReextractAfterHours"`
- `reextractIndexed` → cfgKey: `"indexingReextractEnabled"` → configKey: `"indexingReextractEnabled"`
- `resumeMode` → cfgKey: `"indexingResumeMode"` → configKey: `"indexingResumeMode"`
- `resumeWindowHours` → cfgKey: `"indexingResumeMaxAgeHours"` → configKey: `"indexingResumeMaxAgeHours"`

Remove `cfgKey` from all entries. Replace with `configKey`. Update all derivation functions that read `cfgKey` to read `configKey` instead.

#### Example Entry (Before)
```javascript
{ key: "fetchConcurrency", type: "int", default: 4, min: 1, max: 64, cfgKey: "concurrency" },
```

#### Example Entry (After)
```javascript
{
  key: "fetchConcurrency", type: "int", default: 4, min: 1, max: 64,
  configKey: "concurrency", envKey: "CONCURRENCY",
  transport: "snapshot", roundOverridable: false,
},
```

#### Deprecated Entries
```javascript
{ key: "fetchSchedulerFallbackWaitMs", ..., deprecated: true },
{ key: "runtimeTraceLlmRing", ..., deprecated: true },
{ key: "helperFilesRoot", ..., deprecated: true },
```

#### Round-Overridable Entries (from roundConfigBuilder.js audit)
Settings that roundConfigBuilder.js overrides — mark `roundOverridable: true`:
- discoveryEnabled, fetchCandidateSources, searchEngines
- maxUrlsPerProduct, maxCandidateUrls, maxPagesPerDomain
- maxRunSeconds, maxJsonBytes
- llmMaxCallsPerRound, llmMaxCallsPerProductTotal
- discoveryMaxQueries, discoveryMaxDiscovered
- preferHttpFetcher, autoScrollEnabled, autoScrollPasses, autoScrollDelayMs
- pageGotoTimeoutMs, pageNetworkIdleTimeoutMs, postLoadWaitMs
- endpointSignalLimit, endpointSuggestionLimit, endpointNetworkScanLimit
- maxHypothesisItems, hypothesisAutoFollowupRounds, hypothesisFollowupUrlsPerRound
- maxNetworkResponsesPerPage, maxGraphqlReplays
- perHostMinDelayMs

### 2. `src/shared/settingsRegistryDerivations.js`

#### New Derivation Functions

```javascript
/**
 * Derive the envKey map from registry.
 * Produces: { [settingKey]: 'ENV_VAR_NAME' } for entries with non-empty envKey.
 */
export function deriveEnvKeyMap(registry) { ... }

/**
 * Derive the configKey map from registry.
 * Produces: { [settingKey]: 'configKey' } for all entries.
 */
export function deriveConfigKeyMap(registry) { ... }

/**
 * Derive the transport map from registry.
 * Produces: { [settingKey]: 'snapshot' | 'env' | 'cli' } for all entries.
 */
export function deriveTransportMap(registry) { ... }

/**
 * Derive the set of round-overridable setting keys.
 * Produces: Set<string> of keys where roundOverridable === true.
 */
export function deriveRoundOverridableSet(registry) { ... }

/**
 * Derive the set of deprecated setting keys.
 * Produces: Set<string> of keys where deprecated === true.
 */
export function deriveDeprecatedSet(registry) { ... }
```

#### Update Existing Functions
All existing derivation functions that read `entry.cfgKey` must be updated to read `entry.configKey`:
- `deriveRuntimeDefaults` (line 16: `const cfgKey = entry.cfgKey || entry.key`)
- `deriveClampingIntRangeMap` (line 50)
- `deriveClampingFloatRangeMap` (line 67)
- `deriveClampingStringEnumMap` (line 87)
- `deriveRouteGetMaps` (line 107)
- `deriveRoutePutContract` (line 144)
- `deriveValueTypeMap` (line 175)

### 3. Files That Read `cfgKey` — Must Update to `configKey`

- `src/shared/settingsClampingRanges.js` — imports derivation functions (should auto-update)
- `src/core/config/settingsKeyMap.js` — may reference cfgKey directly
- `src/features/settings-authority/runtimeSettingsRoutePut.js` — derived from registry
- `src/features/settings-authority/runtimeSettingsRouteGet.js` — derived from registry

---

## Test File to Create

### `test/contracts/settingsRegistryTransportContract.test.js`

```
Tests:
- T1: Every registry entry has a valid transport value ('snapshot', 'env', or 'cli')
- T2: Every entry with transport='env' has a non-empty envKey
- T3: Every entry has a non-empty configKey
- T4: No two entries share the same configKey
- T5: No two entries share the same envKey (among those with non-empty envKey)
- T6: Every envKey matches the pattern /^[A-Z][A-Z0-9_]*$/
- T7: roundOverridable entries match the audit list from Plan 01
- T8: deprecated entries are exactly: fetchSchedulerFallbackWaitMs, runtimeTraceLlmRing, helperFilesRoot
- T9: cfgKey field no longer exists on any entry (migration complete)
- T10: All existing derivation function outputs are unchanged (backward compat)
- T11: New derivation functions produce correct output for known entries
- T12: deriveRoundOverridableSet contains all keys overridden in roundConfigBuilder.js
```

---

## Execution Steps

1. Run Plan 02 characterization tests — confirm green
2. Add new fields to every registry entry (209 entries)
3. Rename cfgKey → configKey across all entries
4. Update all derivation functions to read configKey
5. Add new derivation functions
6. Update settingsKeyMap.js, settingsClassification.js, route contracts
7. Write transport contract tests
8. Run ALL tests (characterization + new + existing)
9. Confirm zero regressions

## Estimated Effort
~4-5 hours. Mostly mechanical addition of metadata to 209 entries + updating cfgKey references.

## Rollback
Revert settingsRegistry.js and settingsRegistryDerivations.js. The cfgKey → configKey rename is the riskiest part — if tests break, revert and investigate.
