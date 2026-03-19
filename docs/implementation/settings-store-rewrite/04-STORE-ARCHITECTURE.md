# Plan 04: Settings Store Architecture Design

## Goal
Design the unified settings store interfaces. Pure architecture — defines contracts, not implementation.

## Depends On
Plan 03 (enhanced registry with transport/configKey metadata)

## Blocks
Plans 05, 06, 07, 08 (they implement these interfaces)

---

## Core Interfaces

### RuntimeSettingsSnapshot
The complete, serializable settings object that travels from GUI → backend → child process.

```javascript
/**
 * @typedef {Object} RuntimeSettingsSnapshot
 * @property {string} snapshotId — Unique ID (run ID + timestamp)
 * @property {string} schemaVersion — Registry schema version
 * @property {number} createdAt — Unix timestamp
 * @property {string} source — 'gui' | 'cli' | 'api'
 * @property {Object<string, *>} settings — { [registryKey]: value } for ALL non-deprecated registry entries
 */
```

**Invariants**:
- Every non-deprecated, non-secret registry key MUST appear in `settings`
- Values MUST be the correct type per registry (no string "4" for int 4)
- Secret keys (API keys) are included in the snapshot file but the file is local-only (never persisted to S3/remote)
- The snapshot is immutable after creation — round overrides produce a new derived object, not a mutation

### resolveEffectiveRuntimeConfig
The single resolver function that replaces the current 5-layer merge.

```javascript
/**
 * Resolve the effective runtime config from all sources.
 *
 * @param {Object} options
 * @param {Object} options.baseConfig — From configBuilder (env vars + defaults)
 * @param {RuntimeSettingsSnapshot|null} options.snapshot — From GUI or CLI
 * @param {Object} [options.roundContext] — { round, availabilityEffort, contractEffort, ... }
 * @returns {{ effective: Object, patches: SettingsPatch[], auditLog: SettingsAuditEntry[] }}
 */
export function resolveEffectiveRuntimeConfig({ baseConfig, snapshot, roundContext }) { ... }
```

### SettingsPatch
Records a single setting override with reason.

```javascript
/**
 * @typedef {Object} SettingsPatch
 * @property {string} key — Registry key
 * @property {*} originalValue — Value before override
 * @property {*} effectiveValue — Value after override
 * @property {string} source — 'snapshot' | 'round_0_fast' | 'round_2_thorough' | 'round_effort_boost' | 'env_override' | 'default'
 * @property {string} reason — Human-readable explanation
 */
```

### SettingsAuditEntry
Full audit trail for a single setting in a single run.

```javascript
/**
 * @typedef {Object} SettingsAuditEntry
 * @property {string} key — Registry key
 * @property {*} registryDefault — Default from settingsRegistry.js
 * @property {*} envValue — Value from env var (if any)
 * @property {*} snapshotValue — Value from runtime snapshot (if any)
 * @property {*} roundOverrideValue — Value after round override (if any)
 * @property {*} effectiveValue — Final value used
 * @property {string} effectiveSource — Which layer won
 */
```

---

## Data Flow (New Architecture)

```
GUI Editor State (in-memory)
    │
    ├─→ User clicks "Start Run"
    │
    ▼
POST /process/start { ...allRegistryKeys, runControl }
    │
    ▼
Backend: buildProcessStartLaunchPlan()
    ├─→ writeRuntimeSettingsSnapshot(runId, settings)  →  _runtime/snapshots/<runId>.json
    ├─→ env: RUNTIME_SETTINGS_SNAPSHOT=<path>
    ├─→ env: CATEGORY_AUTHORITY_ROOT=<path>  (path-resolution-only env vars)
    └─→ spawn child process
         │
         ▼
Child: loadConfigWithUserSettings()
    ├─→ Detects RUNTIME_SETTINGS_SNAPSHOT env var
    ├─→ readRuntimeSettingsSnapshot(<path>)  →  snapshot object
    ├─→ buildConfigFromSnapshot(snapshot)  →  base config + snapshot overlay
    ├─→ applyPostMergeNormalization()  →  clamped, fallback-chained config
    └─→ resolveEffectiveRuntimeConfig({ baseConfig, snapshot })  →  { effective, patches }
         │
         ▼
Runner: runUntilComplete()
    ├─→ Per round: resolveEffectiveRuntimeConfig({ effective, roundContext })
    ├─→ patches logged to run events
    └─→ Pipeline consumers read effective config
```

---

## Snapshot File Format

```json
{
  "snapshotId": "run-20260318-143022-abc123",
  "schemaVersion": "1.0",
  "createdAt": 1774050622000,
  "source": "gui",
  "settings": {
    "articleExtractorMaxChars": 24000,
    "autoScrollEnabled": true,
    "fetchConcurrency": 4,
    "llmModelPlan": "gemini-2.5-flash",
    ...all 209 keys...
  }
}
```

**File location**: `<categoryAuthorityRoot>/_runtime/snapshots/<runId>-settings.json`
**Lifetime**: Persisted for the duration of the run + kept as audit artifact afterward.

---

## Resolver Merge Precedence

For each registry key, the effective value is determined by (highest wins):

1. **Round override** — if `roundOverridable: true` and round context applies
2. **Snapshot value** — from the GUI POST body (current editor state)
3. **Env var** — only for `transport: 'env'` keys (path resolution)
4. **Registry default** — fallback

The resolver records which layer won for each key in the audit log.

---

## Interface Stub File

### `src/core/config/settingsStore.js`

```javascript
/**
 * Settings Store — unified interface for settings resolution.
 *
 * This module replaces the 5-layer merge chain:
 * configBuilder → configPostMerge → userSettingsService → processStartLaunchPlan → roundConfigBuilder
 *
 * With one function: resolveEffectiveRuntimeConfig()
 */

/**
 * @param {Object} options
 * @param {Object} options.baseConfig
 * @param {import('./runtimeSettingsSnapshot.js').RuntimeSettingsSnapshot|null} options.snapshot
 * @param {Object} [options.roundContext]
 * @returns {{ effective: Object, patches: Array, auditLog: Array }}
 */
export function resolveEffectiveRuntimeConfig({ baseConfig, snapshot = null, roundContext = null }) {
  throw new Error('Not implemented — see Plan 05/06 for implementation');
}
```

---

## GUI Integration Contract

The GUI MUST:
1. Send ALL non-secret, non-readOnly registry keys in the POST body (not just the ones it currently hand-picks)
2. Use the current in-memory editor state, NOT the last-persisted state
3. Not wait for autosave to complete before starting a run

The backend MUST:
1. Write the snapshot file before spawning the child process
2. Pass RUNTIME_SETTINGS_SNAPSHOT env var to the child
3. NOT rely on user-settings.json for the spawned run (it's a backup for CLI only)

---

## Execution Steps

1. Write architecture doc (this file)
2. Create interface stub in `src/core/config/settingsStore.js`
3. Review interfaces with Plan 01 audit matrix to confirm coverage
4. No tests needed (stubs throw; tests come in Plans 05-06)

## Estimated Effort
~2 hours. Architecture and interface design only.

## Rollback
Delete the stub file. No production code depends on it yet.
