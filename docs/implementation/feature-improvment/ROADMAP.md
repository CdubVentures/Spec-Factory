# Finder Feature-Scaling Roadmap

**Goal:** Reduce per-new-scalar-finder cost from **16 files** → **3–4 files + 2 registry/rule edits**. Enable future finders (`sku`, `pricing`, `discontinued`, `msrp`, `upc`, etc.) to be pure-domain additions.

**Approach:** Seven phases, each independently shippable, each gated by live E2E test. Phase 1 is complete; Phases 2–7 remain. Designed so each phase can be loaded into plan mode independently after context compaction.

**Governing rules:** See repo root `CLAUDE.md`. Key constraints:
- Characterization Wall: golden-master tests MUST be green before any extraction
- Decomposition Safety: smallest increments, revert on red
- No new packages
- No silent rule-bending

---

## Overall architecture target

```
Registry entry (declarative)
  ↓ drives
Generic factories (variantScalarFieldProducer, scalar schema, store, routes, hooks)
  ↓ consume
Feature bespoke bits (prompt text, HIW content, optional panel row render)
  ↓ produces
Full-stack scalar finder (backend orchestration + frontend panel + publisher gate)
```

**Separation of concerns (never mix):**
- **Registry entry** — declarative config: finderName, fieldKey, valueKey, valueType, tierPreference, settingsSchema, etc.
- **Prompt** — domain language describing what the value IS and how to find it
- **HIW content** — user-facing explanation of the finder's behavior
- **Panel customization** (optional) — only if default evidence/variant row doesn't fit

---

## Phase 1 — COMPLETE (2026-04-18)

**What shipped:**
- `src/core/finder/variantScalarFieldProducer.js` (490 LOC) — shared orchestrator factory
- `src/features/release-date/releaseDateFinder.js` shrank 540 → 78 LOC (thin wrapper)
- Characterization tests (21 new cases locking byte-identical behavior)
- Factory unit tests (17 cases)
- Dead `fs.readFileSync` code removed (never executed — `fs` was unimported)
- Evidence-URL HEAD-check cache added to `ctx` (run-scoped dedup across variants)

**Factory injection points (locked contract, do not drift):**
```js
createVariantScalarFieldProducer({
  finderName, fieldKey, sourceType, phase,
  responseValueKey, logPrefix,
  createCallLlm, buildPrompt, extractCandidate,
  mergeDiscovery, readRuns, satisfactionPredicate,
  // optional:
  buildPublisherMetadata, buildUserMessage, suppressionScope, defaultStaggerMs,
})
// returns { runOnce, runLoop }
```

**Byte-identical invariants:**
- `candidateEntry` key order: `[variant_id, variant_key, variant_label, variant_type, value, confidence, unknown_reason, sources, ran_at]` + optional `rejected_by_gate, rejection_reasons, publisher_error`
- `run.response` key order: `[started_at, duration_ms, variant_id, variant_key, variant_label, {responseValueKey}, confidence, unknown_reason, evidence_refs, discovery_log, loop_id?]`
- Publisher submit metadata keys (default): `[variant_key, variant_label, variant_type, evidence_refs, llm_access_mode, llm_thinking, llm_web_search, llm_effort_level]`
- Two-phase `onLlmCallComplete` emission (pre-call ping with `response:null`, post-call with full)
- `publishResult.publishResult.status` inner decode (not outer)
- `specDb.getCompiledRules()` called once per run (not per variant)

**Status of siblings:**
- CEF (`src/features/color-edition/`) — untouched, bespoke (variant generator, not scalar producer)
- PIF (`src/features/product-image/`) — untouched, bespoke (multi-asset image collector)
- RDF — now delegated to factory

---

## Phase structure — repeating pattern

Every subsequent phase follows:

1. **Characterization Wall** — write golden-master tests locking current behavior BEFORE any extraction. Must be green against untouched code.
2. **Create shared layer** — new factory / codegen / component, unused initially. Unit tests ≥ 12 cases per new abstraction.
3. **Migrate RDF** — rewire RDF (or the first consumer) to use the new layer. Characterization + existing tests must remain green.
4. **Migrate CEF / PIF** (if applicable) — only if the abstraction applies to them.
5. **Delete dead code** — per CLAUDE.md Subtractive Mandate.
6. **Live E2E test gate** — manual GUI validation on one real product. Phase does NOT progress until passed.
7. **Exit criteria satisfied** — documented at phase bottom. If any criterion fails, revert and diagnose.

**Revert strategy:** each phase touches a small, enumerable set of files. Revert = `git checkout HEAD -- <file list>`. No phase creates cascading rollback dependencies.

**Dependency graph:**
- Phase 2 (routes) — independent, do first
- Phase 3 (codegen) — benefits from Phase 2 but can run parallel
- Phase 4 (scalar template) — independent
- Phase 5 (panel shell) — independent
- Phase 6 (auto-register) — depends on Phase 2
- Phase 7 (types codegen) — independent

Recommended order: **2 → 3 → 4 → 5 → 6 → 7** (each a separate plan-mode session).

---

## Phase 2 — COMPLETE (2026-04-19, RDF-only narrowing)

**What shipped:**
- `createFinderRouteHandler` extended with `parseVariantKey: true` + `loop: { orchestrator, stages? }` opts. Single in-handler dispatch now covers single-shot + /loop.
- `createVariantFieldLoopHandler` DELETED (was only used by RDF).
- `src/features/release-date/api/releaseDateFinderRoutes.js` shrunk 220 → 82 LOC (ONE handler call; bespoke `buildGetResponse` preserved).
- Characterization tests extended from 7 → 19 cases covering POST /run body parsing, op register shape, stages, Field Studio gate, /loop subType, WS event names, DELETE cascades.
- 12 new unit tests in `finderRoutes.test.js` lock the extended handler contract.
- `base_model` forwarding unified across single-shot + loop (matches RDF's pre-extraction behavior; opt-in via parseVariantKey so CEF unaffected).
- Full repo sweep green: **9625/9625** tests pass.
- Docs updated: `src/core/finder/README.md`, `src/features/release-date/README.md`, `docs/features-html/release-date-finder.html` (Phase 1 stale content also cleaned).

**CEF + PIF narrowing rationale (from exploration):**
- CEF (170 LOC route file) already uses the generic handler for GET/POST/DELETE; its custom DELETE `/variants` is variant-lifecycle (not finder-lifecycle) and belongs outside the shared factory.
- PIF (1083 LOC, not 220) has bespoke image serving, RMBG processing, carousel evaluation with sub-operations (evaluate-view/hero), and a `mode` body param. Forcing these into the generic handler is a false abstraction. Deferred indefinitely pending demonstrated need.

**Key invariants preserved (pre + post migration):**
- candidateEntry + run.response key orders (Phase 1 contracts)
- Publisher submit metadata 6-key shape
- Two-phase `onLlmCallComplete` emission
- Op register args: single-shot `{type, variantKey}`; loop `{type, subType:'loop', variantKey}`
- WS event names: `release-date-finder-run | -loop | -deleted | -run-deleted`
- `onLoopProgress → updateLoopProgress` wiring on loop branch
- Field Studio gate returns 403 with identical message

**Note on Phase 4 dependency:** Phase 4's `registerScalarFinder` will pass `parseVariantKey: true` + `loop: { orchestrator }` through to this handler, so all future scalar finders (sku, pricing, msrp, discontinued, upc) inherit the merged RDF path for free.

---

# Phase 2 — Generalize `createFinderRouteHandler` (original plan — kept for reference)

## Context

RDF's route file (`src/features/release-date/api/releaseDateFinderRoutes.js`) is 220 LOC. ~90% is boilerplate already duplicated from CEF/PIF:
- Custom POST handler that reads `{ variant_key }` body
- Operations registration (`registerOperation`, `getOperationSignal`, `updateStage`, `updateModelInfo`, `updateQueueDelay`, `appendLlmCall`)
- StreamBatcher setup for LLM chunking
- `fireAndForget` wiring with `emitDataChange`
- `buildGetResponse` enrichment with `field_candidates` + `publisher_candidates`

`createFinderRouteHandler` (in `src/core/finder/finderRoutes.js`) already owns most of this. What's NOT shared:
- POST with body param `variant_key` (per-variant Run)
- POST `/loop` with loop-specific stages + callback
- `buildGetResponse` with publisher-candidate enrichment

## Target

Extend `createFinderRouteHandler` with new config flags. RDF's route file shrinks to a registration-only shim (~30 LOC) or disappears entirely.

```js
createFinderRouteHandler({
  // existing config ...
  supportsVariantKey: true,     // POST accepts { variant_key }
  supportsLoop: true,           // POST /loop is wired
  loopOrchestrator: runRdfLoop, // fn reference (when supportsLoop)
  loopStages: ['Discovery', 'Validate', 'Publish'],
  buildGetResponse,             // already exists
  enrichCandidatesWithPublisher: true,  // reads getFieldCandidatesByProductAndField
})
```

## Scope

### In-scope
- `src/core/finder/finderRoutes.js` — extend `createFinderRouteHandler`, merge `createVariantFieldLoopHandler` into it
- `src/features/release-date/api/releaseDateFinderRoutes.js` — shrink from 220 → 30 LOC (or delete)
- `src/features/color-edition/api/colorEditionFinderRoutes.js` — migrate to new flags (if applicable)
- `src/features/product-image/api/productImageFinderRoutes.js` — migrate (if applicable)
- Characterization tests for each migrated route file

### Out-of-scope
- Frontend (no changes to API shape)
- Backend finder orchestrators (Phase 4)
- Store / schema / types (Phase 3, 4)

## Characterization (Step 1)

Add or extend:
- `src/features/release-date/tests/releaseDateFinderRoutes.characterization.test.js` (already exists — extend)
  - POST with `{ variant_key }` body → correct op registration + fireAndForget
  - POST `/loop` → correct `createVariantFieldLoopHandler` wiring
  - GET response `candidates[i].publisher_candidates` enrichment preserved
- Create equivalents for CEF + PIF: `colorEditionFinderRoutes.characterization.test.js`, `productImageFinderRoutes.characterization.test.js`
  - Must lock their current POST body handling (CEF product-level, PIF with view/hero/eval modes)

## Migration sequence

1. Add characterization tests for RDF + CEF + PIF routes. Baseline green.
2. Extend `createFinderRouteHandler` with new flags. Keep `createVariantFieldLoopHandler` as deprecated alias for one increment.
3. Migrate RDF route file to use new flags. Characterization green.
4. Migrate CEF route file. Characterization green.
5. Migrate PIF route file. Characterization green.
6. Delete `createVariantFieldLoopHandler` deprecated alias. All callers green.
7. Delete unused code from route files (should now be ~30 LOC each).

## Hidden coupling risks

| Risk | Mitigation |
|---|---|
| WS event names must stay identical (`release-date-finder-run`, `release-date-finder-loop`, `release-date-finder-run-deleted`, etc.) | Derive from `routePrefix` registry field; assert event names in characterization tests |
| Op stage lists differ per finder (RDF: `['Discovery', 'Validate', 'Publish']`; CEF: TBD) | Accept `runStages` and `loopStages` arrays in config; default based on `jsonStrict` check |
| `emitDataChange` `entities` field shape must stay `{ productIds: [...] }` | Lock in characterization test |
| `fireAndForget` ordering (op register before WS emit, failOperation on catch) | Preserve exact ordering in the generic handler |
| Per-variant body parsing — CEF doesn't read `variant_key` | `supportsVariantKey: false` default; CEF opts out |
| PIF has a `mode` body param (`view`/`hero`/`eval`) beyond `variant_key` | Generalize to `bodyParams: ['variant_key', 'mode']`; handler passes all named body fields into `runFinder` |

## Verification

**Unit:**
```
node --test \
  src/features/release-date/tests/releaseDateFinderRoutes.characterization.test.js \
  src/features/color-edition/api/tests/colorEditionFinderRoutes.test.js \
  src/features/product-image/api/tests/productImageFinderRoutes.characterization.test.js \
  src/core/finder/tests/finderRoutes.test.js
```
All green before + after migration.

**Live E2E gate (user drives, Phase does NOT close until all 3 pass):**
1. **RDF** — GUI Run on a mouse product:
   - Per-variant POST with `{ variant_key: 'color:black' }` → op drawer shows lifecycle → candidate appears
   - GUI Loop → multiple runs share `loop_id` in history drawer
   - GET `/release-date-finder/mouse/{pid}` → JSON shape byte-identical (diff the response before + after)
2. **CEF** — GUI Run on same product:
   - Product-level POST → variant axis regenerated identically
   - GUI Delete run → variants cleanup cascade fires
3. **PIF** — GUI Run view/hero/eval modes:
   - Per-variant POST with `{ variant_key, mode: 'hero' }` → correct mode-scoped handling
   - Images render identically

## Exit criteria

- [ ] All 3 finder route files migrated
- [ ] Characterization tests green pre + post for all 3
- [ ] RDF route file ≤ 40 LOC (was 220)
- [ ] CEF route file ≤ 40 LOC
- [ ] PIF route file ≤ 60 LOC (may stay slightly larger due to mode param)
- [ ] `createVariantFieldLoopHandler` deleted
- [ ] Live E2E passed on one product per finder
- [ ] No WS event names changed
- [ ] `git diff` shows only the enumerated files

---

## Phase 3 — COMPLETE (2026-04-19, RDF-only narrowing)

**What shipped:**
- `src/core/finder/editorialSchemas.js` — shared Zod schemas (`publisherCandidateRefSchema`, `rejectionMetadataSchema`, re-exported `evidenceRefSchema`). 8 unit tests locking the shape.
- `src/features/release-date/releaseDateSchema.js` expanded with `releaseDateFinderCandidateSchema`, `releaseDateFinderRunSchema`, `releaseDateFinderGetResponseSchema`. 9 parse tests against realistic payloads.
- `finderModuleRegistry.js` RDF entry declares `getResponseSchemaExport: 'releaseDateFinderGetResponseSchema'` — opt-in codegen flag.
- `tools/gui-react/scripts/generateRdfTypes.js` → **renamed + generalized** to `generateFinderTypes.js`. Reads registry, emits types.generated.ts for any finder that declares the export. 8 unit tests.
- NEW `tools/gui-react/scripts/generateFinderHooks.js` — emits 5 standard React Query hooks (query, run mutation, loop mutation, delete run, delete all). 10 unit tests.
- RDF frontend migrated to generated types + hooks:
  - `types.generated.ts` now covers editorial types (107 LOC, up from 21)
  - `api/releaseDateFinderQueries.generated.ts` emitted (77 LOC)
  - Hand-written `types.ts` (78 LOC) + `releaseDateFinderQueries.ts` (71 LOC) DELETED
  - Panel + selectors + index.ts imports updated to `.generated.ts` paths
- Full repo sweep green: **9681/9681** tests (35 new).
- `tsc --noEmit` clean in `tools/gui-react`.
- Codegen is deterministic (regeneration is byte-identical no-op).
- Docs updated: `src/core/finder/README.md`, `src/features/release-date/README.md`, `docs/features-html/release-date-finder.html`.

**CEF + PIF narrowing rationale (from exploration):**
- CEF frontend: 2076 LOC total (2.6× RDF). Hand-written `Queries.ts` is 134 LOC with variant-cascade invalidation calling `invalidateDownstreamFinderPanels()` (not pure boilerplate). `selectors/colorEditionFinderSelectors.ts` is 364 LOC of bespoke color-pill / edition-block / evidence-merging logic. Forcing into codegen = false abstraction.
- PIF frontend: 3778 LOC total (4.7× RDF). 11 mutations including batch delete, carousel slot patch, eval record delete, image RMBG processing, optimistic image removal. 315 LOC of selector logic for slot resolution + loop grouping + view priority sorting. Deferred indefinitely.
- Shared `finderSelectorPrimitives.ts` — **NOT built**. Roadmap assumed selectors are uniform; exploration proved they're bespoke. Each finder keeps its own selectors.

**Phase 7 SUPERSEDED:** The generalized types codegen script originally planned for Phase 7 shipped as part of Phase 3. No separate Phase 7 work remains.

**Note on Phase 4 dependency:** Phase 4's `registerScalarFinder` will emit both a backend registration AND the frontend codegen invocations (types + hooks), so future scalar finders (sku, pricing, msrp, discontinued, upc) auto-inherit the full RDF shape from a single registry entry.

---

## Phase 5 — COMPLETE (2026-04-19, RDF-only narrowing)

**What shipped:**
- `tools/gui-react/src/shared/ui/finder/GenericScalarFinderPanel.tsx` (~537 LOC) — full panel scaffold for variantFieldProducer (scalar) finders. Owns: CEF variant query, RDF-family query via prop, Run/Loop button orchestration, per-variant Run/Loop buttons, delete modals, KPI grid, variant grid, run history, footer. Reads finder display config from `FINDER_PANELS` lookup. Hook-as-prop convention (use*-prefixed props) established and documented.
- `tools/gui-react/src/shared/ui/finder/scalarFinderSelectors.ts` (~104 LOC) — generic `deriveFinderKpiCards`, `deriveVariantRows`, `sortRunsNewestFirst`. Parameterized by `valueLabelPlural`. 17 unit tests.
- `tools/gui-react/src/shared/ui/finder/FinderEvidenceRow.tsx` (~50 LOC) — extracted pure component + `tierTone()` helper. Uniform across scalar finders.
- `FINDER_MODULE_MAP.releaseDateFinder` declares 3 new declarative fields: `panelTitle: 'Release Date Finder'`, `panelTip: 'Discovers per-variant first-availability release dates...'`, `valueLabelPlural: 'Release Dates'`.
- `tools/gui-react/scripts/generateLlmPhaseRegistry.js` — `generateFinderPanelRegistry()` extended to emit `moduleType` + `phase` (required, all 3 finders) + `valueKey?` + `panelTitle?` + `panelTip?` + `valueLabelPlural?` (optional, RDF only).
- `tools/gui-react/src/features/release-date-finder/components/ReleaseDateFinderPanel.tsx` shrunk **448 → 28 LOC** (94% reduction). Same path, same named export — `finderPanelRegistry.generated.ts` lazy import unchanged.
- **Deleted**: `tools/gui-react/src/features/release-date-finder/selectors/rdfSelectors.ts` + the `selectors/` directory.
- **Deleted**: inline `EvidenceRow` + `tierTone` from RDF panel (moved to shared `FinderEvidenceRow.tsx`).
- Codegen byte-identity: `finderPanelRegistry.generated.ts` is the only Phase 5-attributable diff (5 new fields for RDF, 2 for CEF/PIF). All 8 other `.generated.*` files unchanged by Phase 5 (modulo pre-existing PIF/Phase 3 working-tree drift).
- Full repo sweep green: **9839/9839** tests pass (9822 baseline + 17 new selector tests).
- `tsc --noEmit` clean in `tools/gui-react`.
- Docs updated: `src/core/finder/README.md`, `src/features/release-date/README.md`, `tools/gui-react/src/features/release-date-finder/README.md` (+ stale `generateRdfTypes.js` ref fixed → `generateFinderTypes.js`), `docs/features-html/release-date-finder.html`, `tools/gui-react/src/shared/ui/finder/index.ts` JSDoc (+ canonical-template clarification: scalar vs artifact templates).

**Per-new-scalar-finder cost after Phase 5:**
- Frontend wrapper: ~25 LOC (1 component, 3 hook imports, 1 HIW import, optional formatValue)
- HIW content (`{name}HowItWorksContent.ts`): ~80 LOC (domain content)
- Registry entry: 3 new fields (`panelTitle`, `panelTip`, `valueLabelPlural`)
- **Total frontend: ~108 LOC, 100% domain content**

**Combined with Phase 4 backend:** per-new-scalar-finder cost drops from ~1,998 LOC (pre-Phase-1) to **~340 LOC (after Phase 5) = 83% overall reduction**, almost all prompt + HIW + README domain content.

**CEF + PIF panels untouched:** neither qualifies as a scalar finder panel (CEF is a variant-generator with cascade invalidation; PIF is a multi-asset producer with carousel/RMBG/lightbox bespoke surfaces). Per the user's directive "CEF and PIF are unique," they retain bespoke panel files.

**Architecture decisions surfaced during exploration:**
- Hook-as-prop pattern was new to this codebase. React permits it when prop names are `use*`-prefixed (ESLint rules-of-hooks recognizes them). Documented as the canonical pattern in `tools/gui-react/src/shared/ui/finder/index.ts` JSDoc.
- Frontend TS cannot import `FINDER_MODULE_MAP` directly (Node-only registry, tsconfig isolation). Solution: extend codegen to emit panel display config into `finderPanelRegistry.generated.ts`. Generic panel reads via `FINDER_PANELS.find(p => p.id === finderId)`.
- DOM snapshot tests infeasible (no jsdom in `tools/gui-react/package.json`; CLAUDE.md forbids new packages). Safety net = pure selector tests (17 cases) + `tsc --noEmit` + live E2E. Aligns with CLAUDE.md Test Scope Calibration's "markup reshuffles" exemption.

**Note on Phase 6 dependency:** Phase 6's auto-register / barrel deletion is independent. The thin RDF panel wrapper is already importing only what it needs; no further panel-side coupling for Phase 6 to address.

---

## Phase 4 — COMPLETE (2026-04-19, RDF-only narrowing)

**What shipped:**
- `src/core/finder/createScalarFinderSchema.js` — LLM response Zod factory for scalar finders (`{ valueKey, valueType, valueRegex? }` → full response envelope with evidence + discovery + confidence). 22 unit tests.
- `src/core/finder/createScalarFinderEditorialSchemas.js` — editorial GET schemas factory returning `{ candidateSchema, runSchema, getResponseSchema }` from an injected LLM response schema. 17 unit tests (includes RDF byte-parity).
- `src/core/finder/createScalarFinderStore.js` — thin `createFinderJsonStore` wrapper with the `latestWinsPerVariant` strategy pulled out of RDF. 16 unit tests (includes RDF merge-output parity).
- `src/core/finder/registerScalarFinder.js` — top-level factory wiring `createVariantScalarFieldProducer` with the default `extractCandidate` (trim + case-insensitive `unk` + finite-confidence) and default `satisfactionPredicate` (definitive unknown OR publisher-published). Requires explicit `logPrefix` (no default — avoids `pricing`→`pri` collision). 29 unit tests including RDF-inline parity.
- `FINDER_MODULE_MAP.releaseDateFinder` declares 4 new declarative fields: `valueKey: 'release_date'`, `valueType: 'date'`, `candidateSourceType: 'release_date_finder'`, `logPrefix: 'rdf'`.
- `releaseDateSchema.js` shrunk 116 → 34 LOC (all 4 exports preserved via factory calls).
- `releaseDateStore.js` shrunk 119 → ~95 LOC (store wrapper shrinks to one call + `rebuildReleaseDateFinderFromJson` unchanged; also exports generic `releaseDateFinderStore` for the feature finder to consume).
- `releaseDateFinder.js` shrunk 78 → 37 LOC (single `registerScalarFinder` call reading config from registry).
- `releaseDateFinderRoutes.js` — `candidateSourceType` moved from inline string to `FINDER_MODULE_MAP.releaseDateFinder.candidateSourceType` (SSOT).
- `releaseDateLlmAdapter.js` — **unchanged** (prompt text + LLM caller factory stay bespoke; that's the domain content).
- Codegen determinism verified: `generateFinderTypes.js` + `generateFinderHooks.js` + `generateLlmPhaseRegistry.js` all regenerate byte-identical outputs (0-byte diff).
- Full repo sweep green: **9822/9822** tests pass (9681 baseline + 84 new factory tests + pre-existing growth).
- `tsc --noEmit` clean in `tools/gui-react`.
- Docs updated: `src/core/finder/README.md`, `src/features/release-date/README.md`.

**Per-new-scalar-finder cost after Phase 4:**
- `{name}Schema.js`: ~25 LOC (2 factory calls)
- `{name}Store.js`: ~35 LOC (1 factory call + rebuild boilerplate if needed)
- `{name}Finder.js`: ~20 LOC (1 `registerScalarFinder` call)
- `{name}LlmAdapter.js`: ~80 LOC (prompt text + caller factory — domain content)
- Registry entry: ~80 LOC of declarative config
- **Total: ~240 LOC per finder, ~150 LOC of which is truly bespoke (prompt + HIW + README)**

Pre-Phase-1 baseline was 16 files / 1998 LOC / 755 bespoke. After Phase 4: **~4 files / ~240 LOC / ~150 bespoke = 85% LOC reduction, 80% bespoke reduction**. O(1) scaling target served.

**CEF + PIF untouched:** neither qualifies as a scalar field producer (CEF is a variant generator; PIF is a multi-asset artifact producer). Per the user's directive "CEF and PIF are unique," they retain bespoke schema/store/finder files.

**Note on Phase 5 dependency:** Phase 5's `GenericScalarFinderPanel` will consume Phase 3's generated hooks (`useReleaseDateFinderQuery` + 4 mutations), so RDF's panel can shrink from 448 → ~30 LOC without depending on Phase 4 internals.

---

# Phase 3 — Frontend codegen (hooks, types, selectors) — original plan, kept for reference

## Context

Each finder's frontend has:
- `api/{name}FinderQueries.ts` (~70 LOC) — 5 react-query hooks (get, run mutation, loop mutation, delete run, delete all). 100% boilerplate derived from route prefix.
- `types.ts` (~78 LOC) — hand-written editorial types (candidate + run + result). Partially duplicates `types.generated.ts`.
- `selectors/{name}Selectors.ts` (~80 LOC) — `deriveFinderKpiCards`, `deriveVariantRows`, `sortRunsNewestFirst`. Mostly uniform across finders.

**This is the first phase that touches the frontend.** Frontend changes must preserve rendered UI byte-identical — lock via visual E2E inspection.

## Target

- `tools/gui-react/scripts/generateFinderHooks.js` — codegen script that reads `finderModuleRegistry` and emits per-finder `*Queries.generated.ts`
- `tools/gui-react/src/shared/ui/finder/finderSelectorPrimitives.ts` — shared `deriveFinderKpiCards`, `deriveVariantRows`, `sortRunsNewestFirst`
- Expand Zod schema to carry editorial fields (PublisherCandidateRef, rejection metadata) → `types.generated.ts` becomes complete → delete hand-written `types.ts`
- Per-finder `api/{name}FinderQueries.ts` → replaced by `{name}FinderQueries.generated.ts` (codegen output)

## Scope

### In-scope
- New: `tools/gui-react/scripts/generateFinderHooks.js`
- New: `tools/gui-react/src/shared/ui/finder/finderSelectorPrimitives.ts`
- Modified: `src/features/release-date/releaseDateSchema.js` (Zod expansion)
- Modified: `src/features/color-edition/colorEditionSchema.js`
- Modified: `src/features/product-image/productImageSchema.js`
- Modified: per-finder frontend — replace `Queries.ts` + `types.ts` imports with generated equivalents
- Deleted: `tools/gui-react/src/features/release-date-finder/api/releaseDateFinderQueries.ts`
- Deleted: `tools/gui-react/src/features/release-date-finder/types.ts`
- Deleted: `tools/gui-react/src/features/release-date-finder/selectors/rdfSelectors.ts`
- Deleted: equivalents for CEF, PIF

### Out-of-scope
- Panel components (Phase 5)
- Orchestrator / routes (Phases 2, 4)

## Codegen script design

### `generateFinderHooks.js`

Reads `src/core/finder/finderModuleRegistry.js`, emits per-finder hooks:

```ts
// Generated — do not edit
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@core/api/client';

export function useReleaseDateFinderQuery(category: string, productId: string) {
  return useQuery({
    queryKey: ['release-date-finder', category, productId],
    queryFn: () => api.get(`/release-date-finder/${category}/${productId}`),
  });
}
export function useReleaseDateFinderRunMutation() { /* ... */ }
export function useReleaseDateFinderLoopMutation() { /* ... */ }
export function useDeleteReleaseDateFinderRunMutation() { /* ... */ }
export function useDeleteReleaseDateFinderAllMutation() { /* ... */ }
```

Run via `node tools/gui-react/scripts/generateFinderHooks.js` — outputs to `{feature}/api/{name}FinderQueries.generated.ts`.

### `finderSelectorPrimitives.ts`

```ts
export function deriveFinderKpiCards({ candidates, runs, finderConfig }): KpiCard[] { /* ... */ }
export function deriveVariantRows({ candidates, variantRegistry, finderConfig }): VariantRow[] { /* ... */ }
export function sortRunsNewestFirst(runs: Run[]): Run[] { /* ... */ }
```

Takes registry config so finder-specific labels (e.g., "Dates found" vs "SKUs found") come from the registry.

### Zod schema expansion

Currently `releaseDateSchema.js` only carries the LLM response. Expand to cover:
- `ReleaseDateFinderCandidateSchema` — the editorial candidate shape (with publisher_candidates, rejection_reasons)
- `ReleaseDateFinderRunSchema` — a run entry
- `ReleaseDateFinderResultSchema` — the full GET response

`types.generated.ts` then covers everything `types.ts` did. Delete `types.ts`.

## Characterization

Add visual-parity tests:
- `tools/gui-react/src/features/release-date-finder/tests/ReleaseDateFinderPanel.rendering.test.tsx` — mount the panel with a fixed mock GET response, snapshot the DOM structure. Run before + after hook migration.
- Similar for CEF, PIF.

## Migration sequence

1. Characterization (visual-parity + hooks contract) green against current code.
2. Write `generateFinderHooks.js`; generate RDF hooks to `*.generated.ts` (don't delete hand-written yet).
3. Write `finderSelectorPrimitives.ts`; port RDF's selectors to use it. Characterization green.
4. Expand RDF Zod schema; regenerate `types.generated.ts`; delete hand-written `types.ts`. Update RDF frontend imports. Characterization green.
5. Switch RDF panel to use `*Queries.generated.ts`; delete hand-written `Queries.ts`. Characterization green.
6. Repeat 2–5 for CEF.
7. Repeat 2–5 for PIF.
8. Delete obsoleted hand-written files.

## Hidden coupling risks

| Risk | Mitigation |
|---|---|
| React Query cache keys — GUI caches keyed on `['release-date-finder', category, pid]` | Codegen uses same key shape; snapshot-test it |
| Hook names imported across feature boundaries | Grep all importers before deletion; codegen exports same names |
| `useMutation.mutate` vs `mutateAsync` shape | Codegen preserves both; match hand-written signatures exactly |
| Stale types may be imported by review/other features | Grep `ReleaseDateFinderResult`, `ReleaseDateFinderCandidate` repo-wide; update imports |
| Codegen output should be committed (not .gitignore'd) | Treat `.generated.ts` as source-of-truth — CI verifies regen is no-op |

## Verification

**Unit:**
- Vitest / Node test on `finderSelectorPrimitives.test.ts` (new, ≥ 12 cases)
- Characterization / rendering tests green pre + post on all 3 finders
- `tsc --noEmit` green across `tools/gui-react`
- CI check: `node tools/gui-react/scripts/generateFinderHooks.js && git diff --exit-code` (codegen output committed, regen is no-op)

**Live E2E gate:**
1. Start the dev server (`npm run dev` or project equivalent)
2. Navigate to a product with active RDF/CEF/PIF
3. For each finder panel:
   - Confirm data loads (query hook works)
   - Click Run → mutation fires, op drawer shows lifecycle
   - Click Loop → loop mutation fires, history drawer groups by loop_id
   - Click Delete run → delete mutation fires, row removed
   - Click Delete all → all runs cleared
4. Check browser devtools Network tab: request URLs match old shapes exactly
5. Visual diff: compare screenshots of each panel before/after (manual or tool-assisted)

## Exit criteria

- [ ] `generateFinderHooks.js` written, codegen output committed
- [ ] `finderSelectorPrimitives.ts` written, ≥ 12 unit tests
- [ ] RDF, CEF, PIF all use generated hooks + shared selectors
- [ ] Hand-written `Queries.ts`, `Selectors.ts`, `types.ts` deleted for all 3
- [ ] Zod schemas expanded for all 3; `types.generated.ts` covers editorial types
- [ ] `tsc --noEmit` green
- [ ] Visual parity confirmed on all 3 panels (live E2E)
- [ ] Network requests byte-identical (before/after HAR compare)

---

# Phase 4 — Scalar template factory

## Context

After Phase 1, RDF has these bespoke files:
- `releaseDateSchema.js` (~35 LOC) — Zod shape with `release_date` key
- `releaseDateStore.js` (~50 LOC) — `createFinderJsonStore` wrapper with recalc formula
- `releaseDateFinder.js` (~78 LOC) — extract + satisfy + factory wiring
- `releaseDateLlmAdapter.js` (~190 LOC) — prompt builder + LLM caller factory

Of these, `Schema`, `Store`, `Finder` are formulaic. Only the LLM adapter + prompt carry genuine bespoke value.

## Target

- `createScalarFinderSchema({ valueKey, valueType, valueRegex? })` — returns full Zod LLM schema
- `createScalarFinderStore({ filePrefix, strategy })` — default `latestWinsPerVariant` strategy
- `registerScalarFinder(registryEntry)` — wires factory + schema + store + default `extractCandidate` + default `satisfactionPredicate`, returns `{ runOnce, runLoop }` ready to export

Result: RDF's backend shrinks to:
1. `prompt.js` (the text + builder)
2. `llmAdapter.js` (maybe merged into prompt.js)
3. Registry entry
4. `README.md`

## Scope

### In-scope
- New: `src/core/finder/createScalarFinderSchema.js`
- New: `src/core/finder/createScalarFinderStore.js`
- New: `src/core/finder/registerScalarFinder.js`
- New: unit tests for each (≥ 12 each)
- Modified: `src/features/release-date/releaseDateSchema.js` → shrink to `export const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });` (or delete if registry declares it)
- Modified: `src/features/release-date/releaseDateStore.js` → shrink to 1–5 LOC
- Modified: `src/features/release-date/releaseDateFinder.js` → 10–15 LOC registration
- Modified: `src/core/finder/finderModuleRegistry.js` — add `moduleClass: 'scalarFieldProducer'` + declarative fields (valueKey, valueType, valueRegex, tierPreference)

### Out-of-scope
- CEF, PIF (not scalar field producers)
- Frontend (handled by Phase 3)
- Routes (handled by Phase 2)

## API design

### `createScalarFinderSchema`

```js
export function createScalarFinderSchema({ valueKey, valueType = 'string', valueRegex }) {
  const valueSchema = valueType === 'date' ? z.string().or(z.literal('unk'))
                    : valueType === 'int'  ? z.number().int().nonnegative().or(z.literal('unk'))
                    : /* string */          z.string().or(z.literal('unk'));
  
  return z.object({
    [valueKey]: valueRegex ? valueSchema.refine(v => v === 'unk' || new RegExp(valueRegex).test(v)) : valueSchema,
    confidence: z.number().min(0).max(100),
    unknown_reason: z.string().default(''),
    evidence_refs: z.array(z.object({
      url: z.string(), tier: z.string(), confidence: z.number(),
    })).default([]),
    discovery_log: z.object({
      urls_checked: z.array(z.string()).default([]),
      queries_run: z.array(z.string()).default([]),
      notes: z.array(z.string()).default([]),
    }).default({}),
  });
}
```

### `createScalarFinderStore`

```js
export function createScalarFinderStore({ filePrefix, strategy = 'latestWinsPerVariant' }) {
  const recalcStrategies = {
    latestWinsPerVariant: (runs) => { /* RDF's current formula */ },
    // future: latestPerVariantPerMode, latestAcrossAllVariants, etc.
  };
  return createFinderJsonStore({
    filePrefix,
    emptySelected: () => ({ candidates: [] }),
    recalculateSelected: recalcStrategies[strategy],
  });
}
```

### `registerScalarFinder`

```js
export function registerScalarFinder({
  // From registry entry (declarative):
  finderName, fieldKey, valueKey, valueType, valueRegex,
  sourceType, phase, filePrefix, logPrefix,
  tierPreference, settingsSchema,
  // Still bespoke:
  buildPrompt,
  // Optional overrides:
  satisfactionPredicate,
  extractCandidate,
  buildPublisherMetadata,
}) {
  const schema = createScalarFinderSchema({ valueKey, valueType, valueRegex });
  const store = createScalarFinderStore({ filePrefix });
  const createCallLlm = buildFinderLlmCallerFactory({ schema, phase }); // NEW helper
  
  const defaultExtract = (llm) => ({
    value: String(llm?.[valueKey] || '').trim(),
    confidence: Number.isFinite(llm?.confidence) ? llm.confidence : 0,
    unknownReason: String(llm?.unknown_reason || '').trim(),
    evidenceRefs: Array.isArray(llm?.evidence_refs) ? llm.evidence_refs : [],
    discoveryLog: llm?.discovery_log,
    isUnknown: !llm?.[valueKey] || String(llm[valueKey]).toLowerCase() === 'unk',
  });
  
  const defaultSatisfy = (result) => {
    if (!result) return false;
    if (result.candidate?.unknown_reason && result.candidate?.value === '') return true;
    if (result.publishStatus === 'published') return true;
    return false;
  };
  
  return createVariantScalarFieldProducer({
    finderName, fieldKey, sourceType, phase,
    responseValueKey: valueKey, logPrefix: logPrefix || finderName.slice(0, 3),
    createCallLlm,
    buildPrompt,
    extractCandidate: extractCandidate || defaultExtract,
    mergeDiscovery: store.merge,
    readRuns: store.read,
    satisfactionPredicate: satisfactionPredicate || defaultSatisfy,
    buildPublisherMetadata,
  });
}
```

After this, RDF's `releaseDateFinder.js` becomes:

```js
import { registerScalarFinder } from '../../core/finder/registerScalarFinder.js';
import { buildReleaseDateFinderPrompt } from './releaseDateLlmAdapter.js';

const { runOnce, runLoop } = registerScalarFinder({
  finderName: 'releaseDateFinder',
  fieldKey: 'release_date',
  valueKey: 'release_date',
  valueType: 'date',
  sourceType: 'release_date_finder',
  phase: 'releaseDateFinder',
  filePrefix: 'release_date',
  logPrefix: 'rdf',
  buildPrompt: buildReleaseDateFinderPrompt,
});

export const runReleaseDateFinder = runOnce;
export const runReleaseDateFinderLoop = runLoop;
```

## Characterization

Phase 1's characterization tests (`releaseDateFinder.characterization.test.js`, `releaseDateFinderRoutes.characterization.test.js`) remain the safety net. No new characterization required — they already lock every observable behavior the scalar template must preserve.

Add:
- `src/core/finder/tests/createScalarFinderSchema.test.js` — ≥ 12 cases for different value types / regex combos
- `src/core/finder/tests/createScalarFinderStore.test.js` — ≥ 12 cases for the `latestWinsPerVariant` strategy
- `src/core/finder/tests/registerScalarFinder.test.js` — ≥ 12 cases for the integration

## Migration sequence

1. Write `createScalarFinderSchema.js` + tests. Green.
2. Write `createScalarFinderStore.js` + tests. Green.
3. Write `registerScalarFinder.js` + tests (using a fake `someDate` finder pattern from Phase 1 factory tests). Green.
4. Rewire RDF to use `registerScalarFinder`. All existing RDF characterization + unit tests green.
5. Delete hand-written `releaseDateSchema.js` if schema is fully derived. Otherwise shrink to 1 line.
6. Shrink `releaseDateStore.js` to 1–5 LOC.
7. Shrink `releaseDateFinder.js` to the 10-LOC sketch above.

## Hidden coupling risks

| Risk | Mitigation |
|---|---|
| `releaseDateSchema.js` exported types consumed by frontend | Phase 3 already migrated types to generated; re-export from `createScalarFinderSchema` |
| Default `extractCandidate` must match RDF's exact logic (including `String(...).trim()`, `.toLowerCase() === 'unk'`) | Phase 1 characterization test case 6 + 7 lock this |
| Default `satisfactionPredicate` must match `rdfLoopSatisfied` exactly | Phase 1 loop tests (cases 19–24) lock this |
| `logPrefix` default — shortening `finderName.slice(0, 3)` may produce collisions for `skuFinder` → `'sku'` (ok) but `'pricing'` → `'pri'`. | Require explicit `logPrefix` in registry; no default |
| Zod schema changes break generated types | Run Phase 3 codegen after rewiring; commit diff |

## Verification

**Unit:**
- All new factory tests green
- All RDF Phase 1 characterization tests green (unchanged)
- Full RDF suite green (`node --test src/features/release-date/tests/*.test.js`)

**Live E2E:**
1. GUI Run on one product → candidate appears, identical to before
2. GUI Loop → loop_id grouping preserved
3. `release_date.json` disk shape unchanged
4. Publisher candidates chip unchanged

## Exit criteria

- [ ] All 3 factories (`createScalarFinderSchema`, `createScalarFinderStore`, `registerScalarFinder`) shipped with ≥ 12 tests each
- [ ] RDF backend reduced to: `releaseDateFinder.js` (10 LOC) + `releaseDateLlmAdapter.js` (prompt + caller factory) + `releaseDateStore.js` (0–5 LOC or deleted)
- [ ] All Phase 1 characterization tests still green
- [ ] Live E2E passed on one product

---

# Phase 5 — Generic scalar finder panel

## Context

`ReleaseDateFinderPanel.tsx` is 448 LOC:
- ~250 LOC of shared scaffold (header, KPI grid, section cards, HIW, history, delete modal, footer)
- ~150 LOC of bespoke logic (EvidenceRow, tierTone, variant row enrichment, per-variant Run/Loop buttons)
- ~50 LOC of state glue

CEF and PIF panels have their own variant of this pattern but with genuinely different display needs (color swatches, image galleries). They stay bespoke — Phase 5 only targets RDF-family panels.

**This phase touches the frontend.** Visual parity is the load-bearing acceptance criterion.

## Target

`GenericScalarFinderPanel` component that takes:
- `finderId` (from registry)
- Optional `renderEvidenceRow(candidate)` — defaults to a stock row
- Optional `renderVariantRowTrailing(variant, candidate)` — defaults to confidence chip
- `howItWorksSections` (from registry)

Result: RDF's panel becomes:

```tsx
import { GenericScalarFinderPanel } from '@shared/ui/finder/GenericScalarFinderPanel';
import { rdfHowItWorksSections } from '../rdfHowItWorksContent';
import { renderRdfEvidenceRow } from '../renderRdfEvidenceRow'; // optional

export default function ReleaseDateFinderPanel() {
  return (
    <GenericScalarFinderPanel
      finderId="releaseDateFinder"
      renderEvidenceRow={renderRdfEvidenceRow}
      howItWorksSections={rdfHowItWorksSections}
    />
  );
}
```

## Scope

### In-scope
- New: `tools/gui-react/src/shared/ui/finder/GenericScalarFinderPanel.tsx`
- Modified: `tools/gui-react/src/features/release-date-finder/components/ReleaseDateFinderPanel.tsx` → shrinks to 15–30 LOC
- Extracted: `renderRdfEvidenceRow.tsx` (if evidence row is bespoke enough to keep separate)
- Visual parity tests

### Out-of-scope
- CEF and PIF panels (stay bespoke — they have genuinely different display needs)

## Characterization

- `tools/gui-react/src/features/release-date-finder/tests/ReleaseDateFinderPanel.parity.test.tsx` — snapshot DOM output for a fixed GET response fixture. Baseline green. Assert identical before/after migration.
- Manual screenshot diff before + after.

## Migration sequence

1. Characterization — snapshot DOM of current panel against fixed fixture. Green.
2. Build `GenericScalarFinderPanel` as a new component, unused. Port exact scaffold from `ReleaseDateFinderPanel.tsx` (header, KPI, section cards, HIW, history, delete modal, footer).
3. Parameterize: add `renderEvidenceRow` prop with RDF-compatible default.
4. Swap RDF panel to use generic shell. Characterization DOM snapshot must be byte-identical.
5. Extract `renderRdfEvidenceRow` if it was in the panel body; otherwise keep as prop-passed default.

## Hidden coupling risks

| Risk | Mitigation |
|---|---|
| Persisted UI state (collapse toggles, section expansion) keyed by `storeKey` per-finder | `GenericScalarFinderPanel` derives `storeKey` from `finderId`; assert persisted state identical in characterization |
| Run button loading states, per-variant lock on loops | Lift `useIsModuleRunning`, `useRunningVariantKeys` into the generic panel; assert button states match |
| Keyboard focus order / tab index | Snapshot test asserts DOM order; manual accessibility check in E2E |
| Responsive breakpoints (mobile vs desktop grid) | Test at 2 viewport widths in characterization |
| Query hook integration | Pre-requisite: Phase 3 codegen complete — generic panel uses `useFinderQuery(finderId, category, productId)` which resolves to the right generated hook |

## Verification

**Unit:**
- DOM snapshot test pre + post green
- Vitest for panel behavior (Run button enabled/disabled, loop lock, etc.)

**Live E2E gate (CRITICAL):**
1. Side-by-side screenshot of RDF panel before + after
2. Interact with each button, confirm:
   - Run → op drawer appears, candidate flows in
   - Loop → loop_id grouping in history
   - Delete run → row removed
   - Delete all → cleared
   - Collapse toggles persist across page reloads (same `storeKey`)
3. Browser Network tab: same request shapes
4. Tab navigation: keyboard focus order unchanged
5. Narrow viewport: responsive layout preserved

## Exit criteria

- [ ] `GenericScalarFinderPanel` shipped with DOM snapshot + behavior tests
- [ ] RDF panel reduced to ≤ 30 LOC
- [ ] DOM snapshot test passes identically pre + post
- [ ] Live E2E visual parity confirmed
- [ ] All Phase 1 + 3 tests still green

---

## Phase 6 — COMPLETE (2026-04-19, RDF-only narrowing + registry-derivation simplification)

**What shipped:**
- `src/core/finder/finderModuleRegistry.js` — new `deriveFinderPaths(id)` pure helper returning `{ featurePath, routeFile, registrarExport, panelFeaturePath, panelExport, schemaModule, adapterModule }` (~30 LOC + 3 pure string helpers `pascalCase` / `camelToKebab` / `kebabToCamel` / `stripFinderSuffix`). 8 unit tests locking byte-identity to prior registry values across 3 existing + 2 hypothetical future finders + edge cases + purity invariant.
- `src/core/finder/finderRouteWiring.js` — `wireFinderRoutes()` now calls `deriveFinderPaths(mod.id)` for dynamic route import path + registrar export; 3 existing tests pass unchanged (same resolved strings).
- `tools/gui-react/scripts/generateLlmPhaseRegistry.js` — 2 code paths migrated to `deriveFinderPaths(m.id)`: phase-schema adapter/schema imports (was inline kebab→camel duplication) + panel registry lazy-import (was reading `m.panelFeaturePath` / `m.panelExport`). Dead `const adapterPath = ...` local variable removed.
- `tools/gui-react/scripts/generateFinderTypes.js` — destructure migrated at line 147; `release-date` special case at line 155 eliminated via canonical `schemaModule` derivation; output path at line 308 uses derived `panelFeaturePath`.
- `tools/gui-react/scripts/generateFinderHooks.js` — `outputPathFor(module)` uses `deriveFinderPaths(module.id).panelFeaturePath`.
- 5 fields removed from **each** of the 3 registry entries (15 field-lines total): `featurePath`, `routeFile`, `registrarExport`, `panelFeaturePath`, `panelExport`.
- `src/features/release-date/index.js` (4 LOC) — **deleted** (single external importer `specDbRuntime.js:4` redirected to `releaseDateStore.js`; 4 other re-exports had zero external importers).
- `tools/gui-react/src/features/release-date-finder/index.ts` (15 LOC) — **deleted** (zero external importers; panel lazy-loads via `finderPanelRegistry.generated.ts` direct-path import).
- Test mocks updated: `generateFinderHooks.test.js` (2 fake modules drop `panelFeaturePath`); `generateFinderTypes.test.js:79` (drops `featurePath` from error-path fake module).
- Codegen byte-identity preserved: `git diff tools/gui-react/src/**/*.generated.*` unchanged after Phase 6 codegen re-run. Derivations match previously-authored string values byte-for-byte.
- Full repo sweep green: **9933/9933** tests pass (9839 baseline + 8 new helper tests + pre-existing growth).
- `tsc --noEmit` clean in `tools/gui-react`.
- Docs updated: `src/core/finder/README.md`, `src/features/release-date/README.md`, `docs/features-html/release-date-finder.html` (5 removed fields stripped from example), `docs/features-html/finder-module-guide.html` (7 references updated — callouts, troubleshooting table, registry example, route-wiring description, panel-lazy-import description).

**CEF + PIF barrels preserved (load-bearing public APIs per CLAUDE.md architecture doctrine):**
- `src/features/color-edition/index.js` — 15 exports, cross-feature public API (variantRegistry, variantLifecycle, colorEditionStore, VARIANT_BACKED_FIELDS).
- `src/features/product-image/index.js` — **imported by `color-edition/variantLifecycle.js:15` + `colorEditionFinder.js:26,28`** for `propagateVariantDelete`, `propagateVariantRenames`, `remapOrphanedVariantKeys` (CEF→PIF variant cascade contract). Second-pass path-qualified grep exposed this load-bearing status; first-pass plan would have incorrectly deleted it.
- `tools/gui-react/src/features/color-edition-finder/index.ts` — 5 external importers (review drawer, PIF panel, shared finder scaffolding) for `useColorEditionFinderQuery`, `ColorRegistryEntry`, `VARIANT_BACKED_FIELDS`, `isVariantBackedField`.

**Per-new-scalar-finder cost after Phase 6:**
- Registry entry: 5 mechanical path/export fields gone. Authors declare only the declarative content (`id`, `valueKey`, `valueType`, `logPrefix`, `panelTitle`, `panelTip`, `valueLabelPlural`, `moduleClass`, `phase`, `candidateSourceType`, settings schema, etc.). ~20 LOC less per entry.
- No barrel file authoring required (unless the feature has genuine cross-feature surface like CEF/PIF).
- **Total savings per new finder: ~20 LOC of boilerplate eliminated.**

**Combined with Phases 1–5:** per-new-scalar-finder cost drops from ~1998 LOC (pre-Phase-1) to **~320 LOC (post-Phase-6)** ≈ **84% reduction**, nearly all domain content (prompt + HIW + README). Roadmap closed — the 7-phase program (Phase 7 was SUPERSEDED by Phase 3) is complete.

**Architecture decisions surfaced during second-pass audit:**
- Grep without explicit `path=` parameter returned false negatives for PIF cross-feature importers. Path-qualified grep + cross-reference with each feature's README "Public API (The Contract)" section is now the pattern for barrel-impact audits.
- Helper return signature extended beyond the 5 originally-removed fields to include `schemaModule` + `adapterModule` — folds away the `generateFinderTypes.js:155` `release-date` special case by canonicalizing `kebabToCamel(featurePath) + 'Schema'` / `+ 'LlmAdapter'` across all finders. Removes a real divergence hazard that would have surfaced when a 4th scalar finder was added.
- Decomposition safety rule honored via parallel-path migration: `finderRouteWiring.js` + 3 codegen scripts switched to the helper in Steps 5–6 while registry fields remained populated; Step 8 deleted the fields only after byte-identity was proven. Codegen byte-identity gate IS the characterization (no behavior drift possible without generated-output drift).

**Note on future scalar-finder acceptance test:** The O(1) scaling claim (~340 LOC per new scalar finder, nearly all domain content) is validated only in theory until the first real scalar finder (SKU / pricing / msrp / discontinued / upc) lands. Deferred to a future plan.

---

# Phase 6 — Auto-register from registry (original plan — kept for reference)

## Context

Currently per-finder barrel files exist:
- `src/features/release-date/index.js` (4 LOC re-exports)
- `tools/gui-react/src/features/release-date-finder/index.ts` (14 LOC re-exports)

These are trivial but they're additional copy-paste per new finder. After Phases 2, 3, 4, the registry entry alone declares everything needed to wire the finder. Barrel files become redundant.

Also: `finderRouteWiring.js` iterates `FINDER_MODULES` but still requires the `registrarExport` field pointing to a function. After Phase 4, that export is derivable.

## Target

- Backend: delete per-finder `index.js`. `finderRouteWiring.js` dynamically imports the finder's main file using a derived path (`src/features/{featurePath}/{finderName}.js`).
- Frontend: `finderPanelRegistry.generated.ts` already works this way (dynamic lazy imports). Verify and delete redundant `index.ts` barrels.

## Scope

### In-scope
- Modified: `src/core/finder/finderRouteWiring.js` — derive import path from registry
- Modified: `src/core/finder/finderModuleRegistry.js` — simplify or remove `registrarExport`, `featurePath` if derivable
- Modified: `tools/gui-react/scripts/generateFinderPanelRegistry.js` — verify dynamic import path
- Deleted: per-finder backend `index.js` (after confirming no external imports)
- Deleted: per-finder frontend `index.ts` (after confirming no external imports)

### Out-of-scope
- Any changes to the finder code itself

## Migration sequence

1. Grep repo-wide for importers of each barrel file. Update those imports to point directly to the finder's file.
2. Write a dynamic import helper in `finderRouteWiring.js`.
3. Delete backend `index.js` one finder at a time. Run full test suite after each.
4. Delete frontend `index.ts` one finder at a time.
5. Verify `npm run build` green in `tools/gui-react`.

## Hidden coupling risks

| Risk | Mitigation |
|---|---|
| External importers (tests, docs) may reference `@features/release-date/index.js` | Repo-wide grep before deletion; update imports to direct paths |
| Dynamic import paths on Windows vs Unix | Use `node:path` with forward slashes in registry entries; normalize in route wiring |
| TypeScript module resolution in GUI | Confirm `tsconfig.json` paths still resolve; `tsc --noEmit` green |
| HMR / Vite dev server behavior with deleted barrels | Test in dev mode before committing |

## Verification

**Unit:**
- All finder tests green
- `tsc --noEmit` green in `tools/gui-react`

**Live E2E:**
- Dev server starts
- All 3 finder panels load
- Run / Loop / Delete work on each

## Exit criteria

- [ ] All per-finder `index.js` and `index.ts` barrels deleted for all 3 finders
- [ ] No import-path errors anywhere
- [ ] `tsc --noEmit` green
- [ ] Live E2E passes
- [ ] Repo shrinks by ~35 LOC of barrel files

---

# Phase 7 — SUPERSEDED (folded into Phase 3)

Generalized types codegen (`generateFinderTypes.js`) shipped in Phase 3 alongside the hooks codegen. No separate Phase 7 work remains.

---

# Phase 7 — Generalize types codegen script (original plan — kept for reference)

## Context

`tools/gui-react/scripts/generateRdfTypes.js` is RDF-specific (~73 LOC). It reads `releaseDateSchema.js` Zod and emits `types.generated.ts` for RDF.

For every new finder, you'd copy this file. That's silly.

## Target

`tools/gui-react/scripts/generateFinderTypes.js` parameterized by finder ID. Reads registry to locate schema, emits `{feature}/types.generated.ts`.

Run via: `node tools/gui-react/scripts/generateFinderTypes.js releaseDateFinder` or with no arg to regenerate all.

## Scope

### In-scope
- New: `tools/gui-react/scripts/generateFinderTypes.js`
- Deleted: `tools/gui-react/scripts/generateRdfTypes.js`
- Modified: `package.json` scripts (if `generateRdfTypes` is referenced)
- Modified: CI / build hooks that invoke the old script

### Out-of-scope
- Schema changes (Phase 3)
- Panel changes (Phase 5)

## Migration sequence

1. Write `generateFinderTypes.js`. Test it regenerates RDF's `types.generated.ts` byte-identically (git diff --exit-code).
2. Wire to `package.json` script: `"generate-finder-types": "node tools/gui-react/scripts/generateFinderTypes.js"`.
3. Also add per-finder for CEF and PIF (same Zod-to-TS engine, different schema source).
4. Delete `generateRdfTypes.js`.

## Hidden coupling risks

| Risk | Mitigation |
|---|---|
| Zod-to-TS conversion edge cases (unions, defaults, refinements) | Snapshot test the generated output against current types file |
| Build hook references to old script path | Grep `generateRdfTypes` repo-wide before deletion |

## Verification

**Unit:**
- `node tools/gui-react/scripts/generateFinderTypes.js releaseDateFinder && git diff --exit-code` (no changes)
- Same for CEF, PIF
- `tsc --noEmit` green

**Live E2E:**
- Dev server renders all panels correctly using generated types

## Exit criteria

- [ ] `generateFinderTypes.js` shipped and invoked in build
- [ ] `generateRdfTypes.js` deleted
- [ ] Regeneration is a no-op (`git diff --exit-code` clean)
- [ ] All 3 finders' `types.generated.ts` still accurate

---

# After all 7 phases — the end state

## Per-new-scalar-finder cost

**Files to create:**
1. `src/features/{name}/prompt.js` (~80 LOC) — domain prompt text + builder
2. `src/features/{name}/{name}HowItWorksContent.ts` (~80 LOC) — HIW structured data
3. `src/features/{name}/README.md` (~30 LOC) — contract doc
4. `src/features/{name}/renderEvidenceRow.tsx` (~30 LOC) — OPTIONAL, only if bespoke

**Files to edit:**
- `src/core/finder/finderModuleRegistry.js` — one entry (~80 LOC added)
- `category_authority/{cat}/_generated/field_rules.json` — one field rule (~10 LOC)

**Total: 3–4 new files + 2 edits, ~200–300 LOC, 100% domain content.**

## Comparison to today

| Metric | Pre-Phase-1 | Post-Phase-7 | Reduction |
|---|---|---|---|
| Files per new scalar finder | 16 | 3–4 | −75% |
| LOC per new scalar finder | ~1,998 | ~200–300 | −85% |
| Truly bespoke LOC (prompt + HIW + README + optional render) | ~755 | ~200–300 | −70% |
| Orchestrator / routes / hooks / types / selectors / store / schema | bespoke | shared | 100% shared |

## Build order rationale (recap)

1. **Phase 2 first** — biggest file-count drop per finder (220-LOC routes shim gone), lowest risk.
2. **Phase 3** — unblocks Phases 4 and 5 by making types + hooks registry-driven.
3. **Phase 4** — depends on Phases 1 (factory), partly benefits from Phase 3 (types regen).
4. **Phase 5** — biggest visible frontend change; needs visual parity gate.
5. **Phase 6** — cleanup; low risk.
6. **Phase 7** — cleanup; low risk.

## Rollback strategy

Each phase enumerates ~3–10 files. If live E2E fails, `git checkout HEAD -- <file list>` restores the previous phase's state. Every phase's green test suite becomes the next phase's baseline. No phase bundles multiple finders' migrations in a single unsaveable checkpoint.

## Pre-phase checklist (for the agent loading a phase)

Before entering plan mode for any phase:
1. Read this roadmap's **Phase 1** section (shared context — what the factory does, what's locked)
2. Read the specific phase section
3. Read `CLAUDE.md` at repo root
4. Verify current git status is clean or only contains intended pre-phase work
5. Run baseline tests to confirm green before any extraction
6. Enter plan mode with the phase scope as the plan's frame

## Post-phase checklist

Before moving to the next phase:
1. All exit criteria ticked
2. Live E2E passed (user-verified)
3. No uncommitted dead code, TODOs, or temporary shims
4. `node --test` green across touched directories
5. Frontend: `tsc --noEmit` green, dev build green
6. Roadmap updated with "Phase N — COMPLETE" block (mirror the Phase 1 example)

---

## Appendix A — Cross-phase invariants (never violate)

- RDF `candidateEntry` and `run.response` key orders (Phase 1 characterization test cases 1–3)
- Publisher submit metadata 6-key shape (Phase 1 characterization test case 10)
- Two-phase `onLlmCallComplete` emission (Phase 1 test case 18)
- `publishResult.publishResult.status` inner decode
- `specDb.getCompiledRules()` once-per-run invariant
- CEF + PIF untouched backend (outside Phase 2 routes if applicable)
- No silent rule-bending (exceptions via CLAUDE.md protocol only)

## Appendix B — Files owned by the roadmap

```
src/core/finder/
  variantScalarFieldProducer.js           [Phase 1 — shipped]
  finderRoutes.js                          [Phase 2 — extend]
  createScalarFinderSchema.js              [Phase 4 — new]
  createScalarFinderStore.js               [Phase 4 — new]
  registerScalarFinder.js                  [Phase 4 — new]
  finderRouteWiring.js                     [Phase 6 — modify]
  tests/
    variantScalarFieldProducer.test.js     [Phase 1]
    createScalarFinderSchema.test.js       [Phase 4]
    createScalarFinderStore.test.js        [Phase 4]
    registerScalarFinder.test.js           [Phase 4]

src/features/release-date/
  releaseDateFinder.js                     [Phase 1 — shrunk to 78 LOC; Phase 4 — to 10 LOC]
  releaseDateLlmAdapter.js                 [kept — prompt + caller factory]
  releaseDateSchema.js                     [Phase 4 — shrink or delete]
  releaseDateStore.js                      [Phase 4 — shrink to 1–5 LOC]
  api/releaseDateFinderRoutes.js           [Phase 2 — shrink to 30 LOC]
  index.js                                  [Phase 6 — delete]
  tests/
    releaseDateFinder.characterization.test.js      [Phase 1]
    releaseDateFinderRoutes.characterization.test.js [Phase 1; Phase 2 extend]

tools/gui-react/
  scripts/
    generateFinderHooks.js                 [Phase 3 — new]
    generateFinderTypes.js                 [Phase 7 — new]
    generateRdfTypes.js                    [Phase 7 — delete]
  src/shared/ui/finder/
    finderSelectorPrimitives.ts            [Phase 3 — new]
    GenericScalarFinderPanel.tsx           [Phase 5 — new]
  src/features/release-date-finder/
    index.ts                                [Phase 6 — delete]
    components/ReleaseDateFinderPanel.tsx  [Phase 5 — shrink to 30 LOC]
    api/releaseDateFinderQueries.ts        [Phase 3 — delete, replaced by .generated]
    selectors/rdfSelectors.ts              [Phase 3 — delete]
    types.ts                                [Phase 3 — delete]
    types.generated.ts                     [Phase 3 — expand]
    rdfHowItWorksContent.ts                [kept — domain messaging]
    renderRdfEvidenceRow.tsx               [Phase 5 — possibly extracted]
```

## Appendix C — Estimated timeline (indicative only)

| Phase | Effort | Parallelizable? |
|---|---|---|
| 2: Routes | 2–3 days | No (blocks 6) |
| 3: Codegen | 3–5 days (touches frontend) | Partial (Zod expansion independent of hooks codegen) |
| 4: Scalar template | 2–3 days | No (depends on 3 for types) |
| 5: Panel shell | 3–4 days (visual parity gate) | No |
| 6: Auto-register | 1 day | Requires 2 complete |
| 7: Types codegen | 1 day | Independent |

Total: 12–17 days of focused work, spread across multiple sessions.

---

**Last updated:** 2026-04-19 (Phase 6 shipped — RDF barrel deletion + registry-derivation simplification via `deriveFinderPaths(id)` helper; CEF + PIF barrels preserved as load-bearing cross-feature public APIs; 9933/9933 green; codegen byte-identity preserved)

**Status:** **All 7 phases complete.** Phase 7 was SUPERSEDED by Phase 3 (generalized types codegen shipped there). Per-new-scalar-finder cost: ~1998 LOC → ~320 LOC (~84% reduction). Roadmap closed.

**Next:** First real-world acceptance test — ship a new scalar finder (SKU, pricing, msrp, discontinued, or upc) using only the new primitives to validate the O(1) scaling claim live. Separate plan when ready.
