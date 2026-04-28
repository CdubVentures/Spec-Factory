# Test Coverage of Cross-Screen Invariants Audit

Date: 2026-04-27
Worst severity: **CRITICAL** — only 1 SQL projection has a "delete table → rebuild from JSON" test (PIF variant progress); 8+ projections claim "rebuild yes" without proof.

## Invariants WITH coverage

| Invariant | Test file | Strength |
|---|---|---|
| Every emitted event is in `EVENT_REGISTRY` | `src/core/events/tests/eventRegistryCoverage.test.js:67–103` | ✓ Hard guard |
| Backend ↔ frontend domain map parity | `src/core/events/tests/dataChangeDomainParity.test.js:15–30` | ✓ Byte-identical |
| `data-change` payload shape | `src/core/events/tests/dataChangeContract.test.js:10–81` | ✓ Round-trip |
| 40+ event → domain → query-key chains | `tools/gui-react/src/features/data-change/__tests__/dataChangeInvalidationMap.test.js` | ✓ Comprehensive |
| Studio map save → correct domains | `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js:50–82` | ✓ |
| `useDataChangeMutation` order + invalidation | `tools/gui-react/src/features/data-change/__tests__/useDataChangeMutation.test.js:40–120` | ✓ |
| PIF variant progress rebuild from JSON | `src/features/product-image/tests/pifVariantProgressRebuild.test.js` | ✓ Only rebuild test in repo |
| Settings registry derived maps stay aligned | `src/shared/tests/registryDerivedSettingsMaps.test.js:12–64` | ✓ |
| Finder module path derivation (deterministic) | `src/core/finder/tests/finderModuleRegistry.test.js:17–110` | ✓ Includes future-finder cases |
| WS bridge wiring + heartbeat | `src/app/api/tests/apiRealtimeBridgeWiring.test.js:54–120`, `apiRealtimeBridgeHeartbeat.test.js` | Happy path only |

## Invariants WITHOUT coverage (regression risk)

### G1. Rebuild contract for SQL projections — **CRITICAL**
Per CLAUDE.md "Rebuild Contract", every "rebuild yes" projection should have a test. Only **1 / 9+** projections does.

Missing tests:
- `field_candidates` — delete table → rebuild from JSON
- `color_edition_finder_runs`, `release_date_finder_runs`, `sku_finder_runs`, `key_finder_runs`
- `run_meta` (rebuild from `run_artifacts.run_summary`)
- `variants` (rebuild from `product_images.json`)
- `component_override`, `enum_override`
- `field_studio_map` SQL projection (rebuild from `field_studio_map.json`)
- `crawl_sources` (run.json + filesystem) — see also run-artifact-read-paths audit

**Fix shape:** one test per projection: seed JSON → delete table → call rebuilder → assert row counts + sample values.

### G2. SQL → JSON mirror writes — HIGH
No test asserts that mutations on SQL also mirror to the JSON memory layer (e.g., `submitCandidate` writes `field_candidates` row AND updates `product.json.candidates[]`).

**Fix shape:** for each dual-writer (`submitCandidate`, `manualOverride`, `clearPublished`, finder run completion), add a test that asserts BOTH SQL row and JSON file are updated atomically.

### G3. Catalog last-run / sort columns derived from `FINDER_MODULES` — MEDIUM
`tools/gui-react/src/pages/overview/__tests__/overviewSort.test.ts:326–346` hardcodes the column list. Adding a finder doesn't fail any test until the user notices a missing ring or `lastRunAt` field.

**Fix shape:** assert `OVERVIEW_SORTABLE_COLUMN_IDS` is derived from `FINDER_MODULES` plus a static prefix (e.g., `brand`, `base_model`). Negative test: a synthetic new finder appears automatically.

### G4. Malformed WS messages don't corrupt the store — HIGH
No test sends an invalid `data-change`, `operations`, or `llm-stream` payload and asserts the queryClient cache / Zustand store stays clean. Pairs with the WebSocket schema audit's G1 + G2.

**Fix shape:** add adversarial test fixtures: missing fields, type-confused values, oversize payloads. Assert handlers reject + log without mutation.

### G5. Finder-specific knob schemas drive panels — MEDIUM
No test asserts that `finderSettingsRegistry`'s schema is what the UI panels render — UI could hardcode field lists and silently drift.

**Fix shape:** snapshot test comparing `finderSettingsRegistry[finderId].settingsSchema` keys against the rendered panel's input names.

### G6. Cross-finder cascade invariants — MEDIUM
CEF `variant-deleted` cascades to PIF/RDF/SKU/publisher. Coverage exists in invalidation tests, but not for the actual data state — i.e., there's no test that running CEF delete-all leaves `field_candidates` for PIF/RDF/SKU empty.

**Fix shape:** integration test that arranges all four finders' state, deletes a CEF variant, and asserts cascade deletion across SQL projections.

## Anti-patterns in existing tests

### A1. Prompt wording locked
**File:** `src/features/key/tests/keyFinderPreviewPrompt.test.js:7–12`
```
assert.match(prompt.system, /PIF_PRIORITY_IMAGES/);
assert.match(prompt.system, /default\/base variant images are attached/i);
assert.match(prompt.system, /Priority views from PIF viewConfig: top/);
```
Violates `feedback_prompt_test_looseness.md`. Replace with structural assertions: PIF images array present, viewConfig keys included.

### A2. Hardcoded field lists in tests
`overviewSort.test.ts:326–346` and `apiCatalogHelpersWiring.test.js` hardcode 5× `LastRunAt` field names — re-runs the registry-scaling violation (`registry-scaling` audit G2).

**Fix shape:** derive expected lists from `FINDER_MODULES` in the test setup.

### A3. No negative tests for cascade scope
Tests assert "this event invalidates these keys" but not "this event MUST NOT invalidate other unrelated keys". A bug that adds a snapshot append to 50 unrelated domains wouldn't fail any current test.

**Fix shape:** add invariants like "data-authority snapshot template appears in exactly N domains, never more".

## Recommended fix order

1. **G1** — add one rebuild test per SQL projection (8+ files). Highest data-loss prevention value.
2. **G4** — adversarial WS fixture suite. Pairs with WS-schema audit.
3. **G2** — dual-write SQL+JSON tests for the four mutation classes.
4. **A1** — replace prompt-wording assertions with structural ones.
5. **G3, G5, A2** — derive test fixtures from FINDER_MODULES instead of hardcoding.
6. **G6** — cross-finder cascade integration test on a fixture product.
7. **A3** — negative invariants for invalidation cascade scope.
