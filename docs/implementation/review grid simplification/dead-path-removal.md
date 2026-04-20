# Review-grid dead-code removal

## Context

While fixing the 100%-confidence bug we discovered the same "clamp without normalize" bug had landed **three times independently** in three parallel projection paths that all map `field_candidates` rows → UI candidate objects with a `score`. We fixed all three, but the duplication itself is the real legacy — every future scale bug will repeat.

Additional legacy code was uncovered along the way:

1. **`buildFieldState()`** (`src/features/review/domain/reviewGridData.js:216`) — superseded by `buildProductReviewPayload()` but still exported; only called by tests + codegen-docs. Carries three helpers that are used nowhere else.
2. **Legacy `sources_json` fan-out branch** in `candidateFanOut.js` — the old pre-Phase-8 multi-source schema. Column was dropped from the DB; the branch cannot fire for production data.
3. **Stale front-end workaround** `maxSourceConfidence()` — already deleted (noted for completeness).
4. **Dead import** `extractHostFromUrl` in `reviewGridData.js` — imported but never called; becomes fully dead once `candidateSourceLabel()` goes.

Intended outcome: delete the legacy paths, so the review grid has **exactly two** projection paths — `buildProductReviewPayload` for the main grid, `fanOutCandidates` for the drawer's lazy-load endpoint — both delegating to the canonical `normalizeConfidence` helper at `src/features/publisher/publish/publishCandidate.js:28`.

---

## Audit findings — dead code inventory

### A. `buildFieldState()` and its private helpers — PROVABLY DEAD in production

**Definition:** `src/features/review/domain/reviewGridData.js:216-382` (~165 lines)

**All callers (worktree-wide):**
- Tests: `reviewGridData.fieldState.listContracts.test.js`, `reviewGridData.fieldState.selectionContracts.test.js`, `reviewEcosystem.grid.test.js` (tests GRID-06 + GRID-07 only)
- Test harnesses: `reviewGridDataHarness.js`, `reviewEcosystemHarness.js` (only to re-export for the above tests)
- Comment at `src/features/review/contracts/reviewFieldContract.js:8` — describes the shape, not a runtime caller
- Zero production callers in `src/`, `tools/gui-react/src/`, `scripts/`, or CLI

**Private helpers used only by `buildFieldState()`** (in `src/features/review/domain/reviewGridHelpers.js`):
- `candidateScore()` — lines 182-197 (had the scale-mismatch bug — patched during the confidence fix)
- `candidateEvidenceFromRows()` — lines 155-179
- `candidateSourceLabel()` — lines 227-244 (uses `extractHostFromUrl`)

**Dead import:**
- `reviewGridData.js:39` imports `extractHostFromUrl`; the symbol is defined at `reviewGridHelpers.js:217-225` and is only actually called at `reviewGridHelpers.js:238` (inside `candidateSourceLabel`). Once `candidateSourceLabel` goes, `extractHostFromUrl` becomes fully dead.

### B. Legacy `sources_json` fan-out path — PROVABLY UNREACHABLE for live data

**Location:** `src/features/review/domain/candidateFanOut.js:59-105` (~47 lines inside `fanOutCandidates`)

**Evidence of death:**
- `sources_json` column is not present in the current `field_candidates` schema (`src/db/specDbSchema.js`)
- `src/db/stores/fieldCandidateStore.js:29` — explicit comment: *"Callers may still pass sourceCount/sourcesJson — these are ignored (columns dropped in Phase 8)"*
- `src/db/specDbMigrations.js:110-259` — one-shot Phase 8 migration that exploded legacy multi-source rows into source-centric rows (each has `source_id`)
- `candidateFanOut.js:38` — guard `if (c.source_id) { ... continue }` — hit for every post-migration row; legacy branch below is never entered
- Only test fixtures in `candidateFanOut.test.js` still construct rows with `sources_json` populated

### C. Tests that only exist to validate dead code

**Whole files to delete:**
- `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.field-state.audit.md` (static doc about the deleted function's shape)

**Partial deletions:**
- `src/features/review/tests/reviewEcosystem.grid.test.js` — delete tests **GRID-06** (lines 13-25) and **GRID-07** (lines 27-44). Keep GRID-01..05 + ecosystem fixture tests (they use `buildProductReviewPayload`).
- `src/features/review/tests/helpers/reviewEcosystemHarness.js` — delete the `buildFieldState`/`buildFieldStateScenario` re-exports + the `buildFieldStateScenario` definition at line 340.
- `src/features/review/domain/tests/helpers/reviewGridDataHarness.js` — delete `buildFieldState` re-export at lines 7 + 14.
- `src/features/review/domain/tests/candidateFanOut.test.js` — delete the legacy `sources_json` fan-out tests; keep the source-centric tests and the new integer-normalization test.

### D. Needs verification before touching

- **`src/features/review/contracts/reviewFieldContract.js`** — consumed only by the codegen script `tools/gui-react/scripts/generateReviewTypes.js` (produces `tools/gui-react/src/types/review.generated.ts`) and by two contract tests. Per the audit, `buildProductReviewPayload` emits the same shape the contract describes, so the contract stays accurate. **Keep as-is in Stage 1**; revisit in a follow-up if we want to retire the contract + codegen pattern entirely.
- **`tools/gui-react/src/types/review.ts`** — generated file; no action needed unless the contract changes.

---

## Roadmap — two shippable stages

### Stage 1: Delete `buildFieldState` and its private helpers (bundled)

These are coupled — you cannot delete `buildFieldState` without also deleting the helpers that become unreferenced, and all three helpers are dead the moment `buildFieldState` goes. Also removes the `extractHostFromUrl` import that becomes dangling.

**Files modified/deleted:**

- `src/features/review/domain/reviewGridData.js`
  - Delete `buildFieldState()` function + its nested helpers (lines 216-382)
  - Remove the `extractHostFromUrl` entry from the import list at line 39
  - Remove any other imports that only `buildFieldState` uses
- `src/features/review/domain/reviewGridHelpers.js`
  - Delete `candidateScore()`, `candidateEvidenceFromRows()`, `candidateSourceLabel()`, `extractHostFromUrl()`
  - Leave shared helpers (`dbSourceLabel`, `dbSourceMethod`, `toInt`, `hasKnownValue`, etc.) — non-`buildFieldState` callers exist
- `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js` — delete entire file
- `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js` — delete entire file
- `src/features/review/domain/tests/reviewGridData.field-state.audit.md` — delete entire file
- `src/features/review/domain/tests/helpers/reviewGridDataHarness.js` — drop `buildFieldState` re-export
- `src/features/review/tests/helpers/reviewEcosystemHarness.js` — drop `buildFieldState` + `buildFieldStateScenario` re-exports + `buildFieldStateScenario` definition
- `src/features/review/tests/reviewEcosystem.grid.test.js` — delete tests GRID-06 + GRID-07; drop dead imports
- `src/utils/candidateIdentifier.js` — check `buildFallbackFieldCandidateId`; delete if orphaned

**Before-after line count:** ~300 lines of source + ~150 lines of tests removed.

**Verification:**
1. `node --test src/features/review/**/*.test.js` — all remaining tests pass
2. `node --test src/features/review/contracts/tests/**/*.test.js` — contract/codegen tests unaffected
3. `cd tools/gui-react && node scripts/generateReviewTypes.js` then `git diff tools/gui-react/src/types/review.generated.ts` — expect **no diff**
4. GUI smoke — open a product drawer, confirm candidates render, confirm payload API returns the same shape
5. `grep -r "buildFieldState\|candidateScore\|candidateEvidenceFromRows\|candidateSourceLabel\|extractHostFromUrl" src/ tools/gui-react/src/ scripts/` → expect zero hits

### Stage 2: Delete legacy `sources_json` fan-out branch

Independent of Stage 1 — shippable before, after, or alongside. Recommended: after Stage 1 so the simplification is obvious.

**Files modified/deleted:**

- `src/features/review/domain/candidateFanOut.js`
  - Delete the `sources` array fan-out branch
  - Simplify the function: `if (c.source_id) { push card; } else { push minimal fallback for malformed rows; }`
  - Keep `clampScore` + `extractMeta` helpers + the final sort
  - Tighten header comment — remove "legacy rows" paragraph; explain source-centric-only
- `src/features/review/domain/tests/candidateFanOut.test.js`
  - Delete tests that construct rows with `sources_json` populated
  - Keep source-centric tests + the integer-normalization test

**Before-after line count:** ~50 lines of source + ~120 lines of tests removed.

**Verification:**
1. `node --test src/features/review/domain/tests/candidateFanOut.test.js` — remaining tests pass
2. Smoke: open the review drawer for a product with CEF candidates, confirm real scores
3. `grep -r "sources_json\|sourcesJson" src/features/review/ src/db/stores/` → expect only the migration file + the `upsert()` "ignored parameter" comment

---

## TDD sequence (per CLAUDE.md)

Subtractive — no new behavior. But the discipline still applies:

1. **`[STATE: CONTRACT]`** — boundary = payload shapes emitted by `buildProductReviewPayload` and `fanOutCandidates` are **unchanged** post-deletion. Pure dead-code excision.
2. **`[STATE: CHARACTERIZATION]`** — baseline: run the full suite, confirm 100% green. Any failure before starting signals the deletion would affect live behavior (would contradict the audit — STOP and re-audit).
3. **`[STATE: MACRO-GREEN]`** — deletions only; surviving tests are the safety net. Zero delta expected.
4. **`[STATE: REFACTOR]`** — no additional cleanup.

---

## Out of scope (explicit)

- **Consolidating the two surviving projection paths** into a single `projectCandidateForUI(row)` helper. Tempting per the O(1) scaling mandate, but the two paths serve different endpoints with different enrichment needs. Revisit after deletions ship.
- **Retiring `reviewFieldContract.js` + the `generateReviewTypes.js` codegen** in favor of inferring frontend types from `buildProductReviewPayload`'s output. Separate architectural decision.
- **Deleting the one-shot `sources_json` DB migration** at `specDbMigrations.js:110-259`. Migrations are historical; must remain for anyone on an older DB snapshot.
- **Frontend cleanup** — React drawer already converged on `candidate.score` from the backend; no changes needed beyond what already landed.

---

## Completed (2026-04-19)

Both stages shipped in a single session.

### Deletions (source)

| File | Change |
|---|---|
| `src/features/review/domain/reviewGridData.js` | Removed `buildFieldState()` (~165 lines) + dead imports (`buildFallbackFieldCandidateId`, `slotValueComparableToken`, `candidateEvidenceFromRows`, `candidateScore`, `extractHostFromUrl`, `candidateSourceLabel`) |
| `src/features/review/domain/reviewGridHelpers.js` | Removed `candidateEvidenceFromRows`, `candidateScore`, `dbSourceMethod`, `extractHostFromUrl`, `candidateSourceLabel`; pruned now-unused imports (`nowIso`, `toArray`, `toNumber`, `normalizeConfidence`, `normalizeHost`) |
| `src/features/review/domain/candidateFanOut.js` | Collapsed from ~125 lines to ~75; deleted the legacy `sources_json` fan-out branch; simplified to single source-centric projection + defensive fallback for malformed rows |
| `src/utils/candidateIdentifier.js` | Removed `buildFallbackFieldCandidateId()` (now-orphaned) |
| `src/features/review/api/fieldReviewHandlers.js` | Updated stale `Fan out sources_json` comment to describe the source-centric projection |

### Deletions (tests)

| File | Change |
|---|---|
| `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js` | Deleted (100% buildFieldState coverage) |
| `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js` | Deleted (100% buildFieldState coverage) |
| `src/features/review/domain/tests/reviewGridData.field-state.audit.md` | Deleted (shape doc for the removed function) |
| `src/features/review/domain/tests/candidateFanOut.test.js` | Rewrote to source-centric-only fixtures; removed every legacy `sources_json`-path test; kept integer-normalization + score-clamp + sort-order + metadata tests |
| `src/features/review/tests/reviewEcosystem.grid.test.js` | Deleted GRID-06 + GRID-07 (`buildFieldState` tests); pruned dead imports |
| `src/features/review/tests/helpers/reviewEcosystemHarness.js` | Removed `buildFieldState` + `buildFieldStateScenario` re-exports and definition |
| `src/features/review/domain/tests/helpers/reviewGridDataHarness.js` | Removed `buildFieldState` re-export |

### Touched (doc/stale-reference cleanup)

| File | Change |
|---|---|
| `src/features/review/contracts/reviewFieldContract.js` | Stale comment now references `buildProductReviewPayload` instead of the deleted `buildFieldState` |
| `src/features/review/contracts/tests/reviewFieldContract.test.js` | Same comment update |

### Contract guarantees — verified

- **API payload shapes unchanged.** `buildProductReviewPayload` and `fanOutCandidates` emit the same shapes they did before. `reviewFieldContract.FIELD_STATE_SHAPE` remains accurate.
- **Codegen unchanged.** Re-ran `node tools/gui-react/scripts/generateReviewTypes.js`; `git diff tools/gui-react/src/types/review.generated.ts` — zero diff.
- **Tests.** Full regression across review + color-edition + release-date + publisher + core finder + field_candidates = **1807 passing, 0 failing** (baseline was 1791; removed 5 dead tests + added 1 integer-normalization test in the confidence fix pass + fan-out test suite was rewritten; the net reflects real code + surviving coverage).
- **Zero surviving references** to `buildFieldState`, `buildFieldStateScenario`, `buildFallbackFieldCandidateId`, `dbSourceMethod`, `candidateEvidenceFromRows` across `src/` and `tools/gui-react/src/` (grep-verified).

### Out-of-scope residue (intentional, documented)

- `src/features/review/tests/helpers/reviewEcosystemHarness.js:609, 628` — test harness still populates `sourcesJson` when seeding `insertFieldCandidate`. The store (`fieldCandidateStore.js:29`) explicitly ignores that parameter. Benign noise; cleanup deferred to avoid scope creep.
- `src/features/review/domain/tests/helpers/reviewOverrideHarness.js:145` — same situation, `sources_json: []`. Benign.

### Follow-up candidates (not done here)

1. **Consolidate the two surviving projection paths.** Now there are only two instead of three; a single `projectCandidateForUI(row)` helper would enforce the scale contract in one place.
2. **Remove the legacy `sourcesJson` test-harness fixtures** above.
3. **Evaluate retiring `reviewFieldContract.js` + `generateReviewTypes.js`** once `buildProductReviewPayload` becomes the sole canonical source.
