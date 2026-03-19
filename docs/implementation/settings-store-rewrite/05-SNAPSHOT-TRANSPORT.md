# Plan 05: Runtime Snapshot Transport — Replace Env Var Explosion

## Goal
Replace the 42-field env-var-to-child pipeline with one runtime snapshot JSON file per run.

## Depends On
Plans 03 (enhanced registry), 04 (store architecture)

## Blocks
Plan 06 (child consumer rewrite)

---

## Files to Modify

### 1. `src/features/indexing/api/builders/processStartLaunchPlan.js`

#### Current State (~370 LOC)
- Destructures ~42 fields from POST body
- Calls assignBoolean/assignString/assignInt/assignJsonObject for each field
- Returns `{ ok, requestedRunId, cliArgs, envOverrides, ... }`

#### Target State (~150 LOC)
- Receives full POST body
- Calls `writeRuntimeSettingsSnapshot(runId, body.settings || body)` to persist snapshot
- Sets ONE env var: `RUNTIME_SETTINGS_SNAPSHOT=<absolute-path>`
- Keeps only path-resolution env vars that must exist before config loads:
  - `CATEGORY_AUTHORITY_ROOT` — needed for field rules file lookup
  - `SPEC_DB_DIR` — if overridden by storage backend
  - `LLM_EXTRACTION_CACHE_DIR` — if overridden by storage backend
  - `LOCAL_OUTPUT_ROOT` — if overridden by storage backend
- Deletes: ALL assignBoolean, assignString, assignInt, assignJsonObject calls
- Deletes: ALL per-field destructuring from body (except product identity + run control)
- Preserves: Product identity parsing (category, productId, brand, model, variant, sku, seedUrls)
- Preserves: Run control (mode, replaceRunning, requestedRunId)
- Preserves: CLI args construction
- Preserves: Storage-backed run roots resolution

#### Key Change
```javascript
// BEFORE: 42 hand-picked env vars
envOverrides.FETCH_PER_HOST_CONCURRENCY_CAP = String(fetchPerHostConcurrencyCap);
envOverrides.PREFER_HTTP_FETCHER = preferHttpFetcher ? 'true' : 'false';
// ... 40 more lines ...

// AFTER: 1 snapshot file
const snapshotPath = writeRuntimeSettingsSnapshot(requestedRunId, body, effectiveHelperRoot);
envOverrides.RUNTIME_SETTINGS_SNAPSHOT = snapshotPath;
```

### 2. `src/app/api/routes/infra/processRoutes.js`

Minor change: ensure the full POST body is forwarded to processStartLaunchPlan (already happens).

---

## Files to Create

### 1. `src/core/config/runtimeSettingsSnapshot.js`

```javascript
import fs from 'node:fs';
import path from 'node:path';

/**
 * Write a runtime settings snapshot to disk.
 * @param {string} runId — Run identifier
 * @param {Object} settings — Full settings payload from POST body
 * @param {string} runtimeRoot — Category authority root path
 * @returns {string} Absolute path to the written snapshot file
 */
export function writeRuntimeSettingsSnapshot(runId, settings, runtimeRoot) {
  const snapshotsDir = path.join(path.resolve(runtimeRoot), '_runtime', 'snapshots');
  fs.mkdirSync(snapshotsDir, { recursive: true });

  const snapshot = {
    snapshotId: runId,
    schemaVersion: '1.0',
    createdAt: Date.now(),
    source: 'gui',
    settings: extractSettingsFromBody(settings),
  };

  const filePath = path.join(snapshotsDir, `${runId}-settings.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filePath;
}

/**
 * Read a runtime settings snapshot from disk.
 * @param {string} snapshotPath — Absolute path to snapshot file
 * @returns {Object} Parsed snapshot
 * @throws {Error} If file missing or invalid
 */
export function readRuntimeSettingsSnapshot(snapshotPath) {
  if (!snapshotPath) throw new Error('RUNTIME_SETTINGS_SNAPSHOT path is empty');
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed?.settings || typeof parsed.settings !== 'object') {
    throw new Error('Invalid snapshot: missing settings object');
  }
  return parsed;
}

/**
 * Resolve snapshot path from environment.
 * @param {Object} [env=process.env]
 * @returns {string|null} Snapshot path or null if not present
 */
export function resolveSnapshotPath(env = process.env) {
  const p = String(env.RUNTIME_SETTINGS_SNAPSHOT || '').trim();
  return p || null;
}

/**
 * Extract just the settings keys from the POST body, filtering out run control fields.
 * @param {Object} body — Full POST body
 * @returns {Object} Settings-only fields
 */
function extractSettingsFromBody(body) {
  // Run control fields to exclude from snapshot
  const RUN_CONTROL_KEYS = new Set([
    'requestedRunId', 'runId', 'category', 'productId', 'brand', 'model',
    'variant', 'sku', 'seedUrls', 'mode', 'profile', 'seed', 'fields',
    'providers', 'indexlabOut', 'replaceRunning',
  ]);
  const settings = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (!RUN_CONTROL_KEYS.has(key)) {
      settings[key] = value;
    }
  }
  return settings;
}
```

---

## Test File to Create

### `test/contracts/runtimeSettingsSnapshotTransport.test.js`

```
Test Group A: Write/Read Round-Trip
- A1: Write snapshot → read snapshot → settings match exactly
- A2: All 209 registry keys present in snapshot after write
- A3: Snapshot file is valid JSON
- A4: Snapshot has required fields: snapshotId, schemaVersion, createdAt, source, settings
- A5: Run control fields (category, productId, etc.) excluded from settings

Test Group B: Error Handling
- B1: readRuntimeSettingsSnapshot with empty path throws clear error
- B2: readRuntimeSettingsSnapshot with non-existent file throws clear error
- B3: readRuntimeSettingsSnapshot with invalid JSON throws clear error
- B4: readRuntimeSettingsSnapshot with missing settings object throws clear error

Test Group C: resolveSnapshotPath
- C1: Returns path when RUNTIME_SETTINGS_SNAPSHOT is set
- C2: Returns null when RUNTIME_SETTINGS_SNAPSHOT is empty
- C3: Returns null when RUNTIME_SETTINGS_SNAPSHOT is not in env

Test Group D: processStartLaunchPlan Integration
- D1: envOverrides contains RUNTIME_SETTINGS_SNAPSHOT key
- D2: envOverrides does NOT contain old per-field keys (FETCH_PER_HOST_CONCURRENCY_CAP, etc.)
- D3: Snapshot file exists at the path in envOverrides
- D4: Snapshot file contains all settings from POST body
- D5: Path-resolution env vars still present (CATEGORY_AUTHORITY_ROOT, SPEC_DB_DIR, etc.)
```

---

## Migration Strategy

The processStartLaunchPlan rewrite is the biggest risk. Strategy:
1. Add snapshot writing alongside existing env vars first (dual-write)
2. Verify snapshot content matches env var content
3. Switch child to read snapshot (Plan 06)
4. Remove env var writing (this plan, final step)

This allows reverting to env vars if snapshot reading has issues.

---

## Execution Steps

1. Create `src/core/config/runtimeSettingsSnapshot.js`
2. Write snapshot transport tests
3. Modify processStartLaunchPlan.js to write snapshot + set RUNTIME_SETTINGS_SNAPSHOT env var
4. Initially keep existing env var assignments (dual-write for safety)
5. Run all tests (characterization + new)
6. After Plan 06 confirms child reads snapshot: remove env var assignments

## Estimated Effort
~3-4 hours.

## Rollback
Revert processStartLaunchPlan.js to restore env var assignments. Delete snapshot module.
