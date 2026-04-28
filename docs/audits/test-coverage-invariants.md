# Test Coverage of Cross-Screen Invariants Audit

Date: 2026-04-28
Current severity: **HIGH**

## Scope

Rebuild coverage is broader than the original audit stated, but it is uneven and not always expressed as deleted-DB recovery tests. The highest risk remains data-loss or stale-state regressions across durable JSON, SQL projections, WS transport, and generated registries.

## Active Findings

### G1. Full-suite baseline is not clean - HIGH

Focused tests and TypeScript checks can pass while the full `npm test` baseline remains red from unrelated failures such as mouse contract drift and scalar prompt golden drift. Until the baseline is clean, full-suite proof cannot be used as a reliable phase-completion gate.

**Fix shape:** Triage unrelated failures separately, then re-run the full suite before closing major audit stages.

### G2. Deleted-DB rebuild coverage is uneven - HIGH

Multiple rebuild paths have tests, but coverage is not consistently framed as "delete SQLite table/file -> rebuild from durable JSON -> assert rows and representative values."

**Fix shape:** Add targeted deleted-DB tests for projections with weak or indirect coverage, rather than creating broad source-text tests.

### G3. SQL-to-JSON mirror writes need consistent atomicity proof - HIGH

Some dual-write paths are tested, but mutation classes should consistently prove SQL and JSON rebuild mirrors update together.

**Fix shape:** For each high-value mutation class, assert both SQL rows and durable JSON are updated in the same contract test.

### G4. Shared delete/reset paths need atomic helper coverage - HIGH
**Files:** `src/core/finder/finderRoutes.js`, `src/features/publisher/candidate-gate/deleteCandidate.js`

Shared finder delete/reset and candidate-delete paths still have SQL-first then JSON-mirror windows without a shared atomic helper. Failures between the two writes can leave runtime projection and durable mirror out of sync.

**Fix shape:** Add a shared write helper or transaction-style orchestration that proves SQL and JSON mirror writes complete together or roll back/repair predictably.

### G5. Malformed WS messages lack adversarial store-safety tests - HIGH

Runtime channel handlers need fixtures for invalid `operations`, `data-change`, and stream payloads to prove bad messages do not corrupt Zustand or query cache state.

**Fix shape:** Add adversarial UI-boundary tests paired with the WebSocket schema cleanup.

### G6. Query-key scope contract is incomplete - MEDIUM

Event registry mappings have been narrowed in places, but the documented scope contract for each event/domain/query-key chain is still incomplete.

**Fix shape:** Document event scope expectations next to the source registry and add focused tests for high-blast-radius mappings.

### G7. Mutation response shapes do not consistently return changed entities - MEDIUM

Many POST/PUT paths still return `{ ok }` without canonical changed entity payloads. This forces broad invalidation and makes optimistic/surgical UI updates harder to maintain.

**Fix shape:** For high-traffic mutations, return canonical changed entities and update callers to patch precise query keys.

### G8. Catalog sortable finder columns are hardcoded in tests - MEDIUM

Some tests hardcode finder-derived column ids. Adding a finder can silently miss Overview sort/ring coverage.

**Fix shape:** Derive expected lists from `FINDER_MODULES` in tests.

### G9. Finder-specific knob schemas are not tied to rendered controls - MEDIUM

There is no test proving finder settings schema keys match the panel inputs rendered by the GUI.

**Fix shape:** Add a focused schema-to-rendered-control contract test.

### G10. Cross-finder cascade data-state invariants are thin - MEDIUM

Invalidation tests cover query keys, but not full data-state results after CEF variant deletion cascades into PIF/RDF/SKU/publisher projections.

**Fix shape:** Add an integration test with all affected projections populated, then delete a CEF variant and assert cascade cleanup.

### A1. Prompt wording assertions are brittle - MEDIUM

Some prompt tests assert exact wording rather than structural prompt inputs.

**Fix shape:** Replace wording assertions with structural assertions for inputs, attached images, and view-config keys.

### A2. Negative invalidation-scope tests are sparse - LOW-MEDIUM

Tests mostly assert what should invalidate, not what must not invalidate.

**Fix shape:** Add small negative invariants for broad templates with high blast radius.

## Recommended Fix Order

1. **G1** - Clean full-suite baseline.
2. **G2** - Normalize deleted-DB rebuild tests for weak projections.
3. **G4** - Shared atomic delete/reset helper coverage.
4. **G5** - Adversarial WS fixture suite.
5. **G3/G7** - Dual-write and changed-entity response contracts.
6. **G6/G8/G9/A1** - Remove hardcoded/brittle contract assumptions.
7. **G10/A2** - Add cascade data-state and negative-scope tests.
