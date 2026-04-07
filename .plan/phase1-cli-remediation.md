# Phase 1 — CLI Remediation (Revised)

Based on the full audit of every file the CLI touches, here's what's actually worth doing — stripped of the inflated DB-path framing.

---

## Bug found during audit

**`discover` command is broken in production.** `spec.js:170-175` never injects `openSpecDbForCategory` into the discover factory. The command's line 15 does `await undefined?.()` → `null` → always returns 0 products. The test passes because the test mock injects the helper (line 17-22 of discoverCommand.test.js). This is a live bug, not a hygiene issue.

---

## Steps (ordered by dependency)

### Step 1 — Add barrel exports for 2 real feature boundary violations

`pipelineCommands.js` reaches into feature internals for 2 functions that have no barrel export:

| Function | Deep import today | Barrel to add to |
|----------|------------------|-------------------|
| `deriveFullModel` | `features/catalog/identity/identityDedup.js` | `features/catalog/index.js:33` (same file already exports `cleanVariant`, `isFabricatedVariant`, `normalizeProductIdentity` — just add `deriveFullModel` to the list) |
| `buildRuntimeOpsPanels` | `features/indexing/api/builders/buildRuntimeOpsPanels.js` | `features/indexing/api/index.js` (add one export line at bottom) |

`buildJobFromDb` already has a full barrel chain through `features/indexing/orchestration/bootstrap/index.js` → `orchestration/index.js` → `features/indexing/index.js`. No barrel work needed — just update the import path in pipelineCommands.

**Files touched:** `src/features/catalog/index.js`, `src/features/indexing/api/index.js`

---

### Step 2 — Add `withSpecDb` helper to cliHelpers.js

```js
export async function withSpecDb(config, category, fn) {
  const specDb = await openSpecDbForCategory(config, category);
  try {
    return await fn(specDb);
  } finally {
    try { specDb?.close(); } catch { /* best-effort */ }
  }
}
```

**Files touched:** `src/app/cli/cliHelpers.js`

---

### Step 3 — Fix `pipelineCommands.js` imports + inject `openSpecDbForCategory`

**3a.** Add `openSpecDbForCategory` to the factory signature (`createPipelineCommands`).

**3b.** Route the 3 feature imports through barrels:
- `buildJobFromDb` → `from '../../../features/indexing/orchestration/index.js'` (or `features/indexing/index.js`)
- `buildRuntimeOpsPanels` → `from '../../../features/indexing/api/index.js'`
- `deriveFullModel` → `from '../../../features/catalog/index.js'`

**3c.** Replace the 3 direct `new SpecDb()` constructions:
- Lines 107-108 (identity lookup in commandIndexLab) — use `withSpecDb` for the short-lived lookup. Today this opens a SpecDb and **never closes it** (leak).
- Lines 149-152 (long-lived event logging DB) — use `openSpecDbForCategory` for path resolution, keep existing lifecycle (closed at line 369 in finally).
- Lines 392-393 (identity lookup in commandRunAdHoc) — same pattern as 107, use `withSpecDb`. Also **never closed** today.

**3d.** Delete the `PROJECT_ROOT` constant (lines 18-20) and `import { SpecDb as SpecDbForLookup }` (line 6). Both become unnecessary.

**3e.** Update the lazy loader in `spec.js` (loadPipelineCommands, ~line 314) to inject `openSpecDbForCategory`.

**Files touched:** `src/app/cli/commands/pipelineCommands.js`, `src/app/cli/spec.js`

---

### Step 4 — Fix `dataUtilityCommands.js` dead param

The factory accepts `openSpecDbForCategory = null` (line 10) but never uses it. Both `commandSeedDb` (line 16-22) and `commandSeedCheckpoint` (line 57-65) do direct `import('../../../db/specDb.js')` + inline path construction.

**Fix:** Actually use the injected helper:
- Replace the inline `import + new SpecDb()` blocks in both functions with `openSpecDbForCategory(config, category)`
- Remove the two `await import('../../../db/specDb.js')` calls
- Remove the inline `pathNode.join(config.specDbDir || '.workspace/db', category)` path construction

The factory already receives `openSpecDbForCategory` from `spec.js:277`. Just use it.

**Files touched:** `src/app/cli/commands/dataUtilityCommands.js`

---

### Step 5 — Fix `discover` command injection bug

`spec.js:170-175` creates the discover command factory without `openSpecDbForCategory`. Add it:

```js
return createDiscoverCommand({
  loadCategoryConfig,
  runDiscoverySeedPlan,
  EventLogger,
  buildRunId,
  openSpecDbForCategory,  // ← add this
});
```

Also add `specDb?.close()` in a finally block in `discoverCommand.js` — today it opens but never closes (moot currently since it's always null, but once we inject the helper it will be a real connection).

**Files touched:** `src/app/cli/spec.js`, `src/app/cli/commands/discoverCommand.js`

---

### Step 6 — Replace open/close ceremonies with `withSpecDb`

reviewCommand.js has 8 identical try/finally blocks. Replace them:

| Action | Lines (approx) | Pattern today |
|--------|----------------|---------------|
| `layout` | 26-33 | open, use, close outside finally |
| `queue` | 44-57 | open, try/finally |
| `product` | 74-87 | open, try/finally |
| `override` | 182-198 | open, try/finally |
| `approve-greens` | 212-226 | open, try/finally |
| `manual-override` | 243-268 | open, try/finally |
| `finalize` | 282-297 | open, try/finally |
| `suggest` | 327-350 | open, try, close outside finally (inconsistent) |

Also replace in:
- `exportOverridesCommand.js` — 2 ceremonies (export + migrate)
- `batchCommand.js` — 1 ceremony (commandRunBatch)
- `migrateToSqliteCommand.js` — 1 ceremony

**Files touched:** `src/app/cli/commands/reviewCommand.js`, `src/app/cli/commands/exportOverridesCommand.js`, `src/app/cli/commands/batchCommand.js`, `src/app/cli/commands/migrateToSqliteCommand.js`

---

### Step 7 — Wire `migrate-overrides` into dispatcher (or delete)

`exportOverridesCommand.js:76` exports `createMigrateOverridesCommand` — 40 lines of functional code with a clear purpose (SQL → consolidated v2 overrides.json). But it's never wired into the CLI dispatcher.

**Recommendation: Wire it in.**
- Add lazy loader for `createMigrateOverridesCommand` (alongside the existing export-overrides loader at spec.js:151-154)
- Add `case 'migrate-overrides':` to the switch at spec.js:360
- Add to usage text

If you'd rather delete it, say so and I'll remove it instead.

**Files touched:** `src/app/cli/spec.js`

---

## What we are NOT doing (and why)

- **DB path unification** — All 4 patterns resolve to `.workspace/db/<cat>/spec.sqlite` in practice. `SPEC_DB_DIR` is never set to anything else. Steps 3-5 eliminate the divergent patterns as a side effect of fixing the real issues (injection, leaks, dead code), but we're not treating this as its own workstream.
- **`_storage` param removal** — Convention debate, not a bug. 15+ signatures would change for cosmetic reasons.
- **`pipeline/` and `indexlab/` barrel creation** — These are infra (`src/pipeline/`, `src/indexlab/`), not feature boundaries. Direct imports from infra are allowed by CLAUDE.md.

---

## Verification

After each step, run:
```
node --test src/app/cli/tests/ src/app/cli/commands/tests/
```

This covers 9 test files: cli.test.js, reviewCli.test.js, reviewCommand.test.js, discoverCommand.test.js, exportOverridesCommand.test.js, migrateToSqliteCommand.test.js, billingReportCommand.test.js, llmHealthCommand.test.js, commandIndexLabCharacterization.test.js.

No new characterization tests needed — all changes are mechanical (import paths, barrel re-exports, using an already-injected helper) with identical behavior, or bug fixes with existing test coverage.

---

## Files touched (complete list)

| File | Change type |
|------|------------|
| `src/features/catalog/index.js` | Add 1 re-export |
| `src/features/indexing/api/index.js` | Add 1 re-export |
| `src/app/cli/cliHelpers.js` | Add `withSpecDb` helper |
| `src/app/cli/commands/pipelineCommands.js` | Fix imports, inject helper, delete PROJECT_ROOT + SpecDbForLookup |
| `src/app/cli/commands/dataUtilityCommands.js` | Use injected helper instead of inline construction |
| `src/app/cli/commands/discoverCommand.js` | Add specDb close, add finally block |
| `src/app/cli/commands/reviewCommand.js` | Replace 8 open/close ceremonies with withSpecDb |
| `src/app/cli/commands/exportOverridesCommand.js` | Replace 2 open/close ceremonies with withSpecDb |
| `src/app/cli/commands/batchCommand.js` | Replace 1 open/close ceremony with withSpecDb |
| `src/app/cli/commands/migrateToSqliteCommand.js` | Replace 1 open/close ceremony with withSpecDb |
| `src/app/cli/spec.js` | Inject openSpecDbForCategory into pipeline + discover loaders; wire migrate-overrides |
