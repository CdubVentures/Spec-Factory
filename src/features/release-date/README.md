## Purpose

Per-variant first-availability release date discovery. First `variantFieldProducer` module: iterates CEF variants, runs one LLM search per variant, and routes each result through the shared publisher gate with a `variant_id`-scoped candidate. Dual-writes run history to JSON (durable SSOT) and a projected SQL table for fast UI reads.

**Factory-driven (Phase 4)**: the feature file ships only the prompt + LLM caller pair. All structural wiring (Zod schemas, JSON store, orchestrator, satisfaction predicate, extract logic) is derived from the scalar-finder factories in `src/core/finder/`:
- `createScalarFinderSchema` (LLM response shape) → `releaseDateFinderResponseSchema`
- `createScalarFinderEditorialSchemas` (GET shape) → candidate/run/getResponse schemas driving `types.generated.ts`
- `createScalarFinderStore` (latest-wins-per-variant JSON store)
- `registerScalarFinder` (wires everything to `createVariantScalarFieldProducer` with RDF-compatible defaults)

The 4 declarative fields on RDF's registry entry (`valueKey`, `valueType`, `candidateSourceType`, `logPrefix`) are the full backend config surface. Future scalar finders (sku, pricing, msrp, discontinued, upc) copy this shape.

**Frontend panel (Phase 5)**: `tools/gui-react/src/features/release-date-finder/components/ReleaseDateFinderPanel.tsx` is a ~25 LOC thin wrapper around `tools/gui-react/src/shared/ui/finder/GenericScalarFinderPanel.tsx`. The panel reads its display config (`panelTitle`, `panelTip`, `valueKey`, `valueLabelPlural`, `moduleType`, `phase`) from `FINDER_PANELS` (codegen output of `tools/gui-react/scripts/generateLlmPhaseRegistry.js`). Three additional registry fields drive the panel: `panelTitle`, `panelTip`, `valueLabelPlural`. Future scalar finders inherit the full panel via the same wrapper shape.

## Public API (The Contract)

Exported directly from their source modules (no barrel — Phase 6 removed `index.js`; consumers import from the specific file listed below):

- `runReleaseDateFinder`, `runReleaseDateFinderLoop` — from `releaseDateFinder.js`
- `readReleaseDates` / `writeReleaseDates` / `mergeReleaseDateDiscovery` / `deleteReleaseDateFinderRun` / `deleteReleaseDateFinderRuns` / `deleteReleaseDateFinderAll` / `rebuildReleaseDateFinderFromJson` — from `releaseDateStore.js`
- `releaseDateFinderResponseSchema` / `releaseDateFinderGetResponseSchema` — from `releaseDateSchema.js`
- `buildReleaseDateFinderPrompt` / `createReleaseDateFinderCallLlm` — from `releaseDateLlmAdapter.js`

Contract details:

- `runReleaseDateFinder({ product, appDb, specDb, config, productRoot?, variantKey?, ... })` — Single-shot per-variant orchestrator. One LLM call per variant, no retry. Wired to `POST /release-date-finder/:cat/:pid` (the header **Run** button and per-row **Run** button).
- `runReleaseDateFinderLoop({ product, appDb, specDb, config, productRoot?, variantKey?, onLoopProgress?, ... })` — Budget loop orchestrator. Retries per variant up to `perVariantAttemptBudget` (default **3**) until the candidate reaches the publisher gate or LLM returns definitive unknown. Wraps `core/finder/variantFieldLoop.js` with RDF's satisfaction predicate. Wired to `POST /release-date-finder/:cat/:pid/loop` (the header **Loop** button and per-row **Loop** button). All runs emitted inside a single loop call share `run.response.loop_id`.
- `readReleaseDates({ productId, productRoot? })` / `mergeReleaseDateDiscovery(...)` — JSON store readers/writers (latest-wins per `variant_id`).
- `deleteReleaseDateFinderRun(...)` / `deleteReleaseDateFinderRuns(...)` / `deleteReleaseDateFinderAll(...)` — JSON run lifecycle.
- `rebuildReleaseDateFinderFromJson({ specDb, productRoot? })` — Rebuild SQL projection from JSON SSOT.
- `releaseDateFinderResponseSchema` — Zod: `{ release_date, confidence (0-100), unknown_reason, evidence_refs[{url, tier, confidence}], discovery_log }` (LLM response).
- `releaseDateFinderGetResponseSchema` — Zod for the full GET shape. Drives `types.generated.ts` + `releaseDateFinderQueries.generated.ts` codegen (Phase 3). Run `node tools/gui-react/scripts/generateFinderTypes.js releaseDateFinder` + `generateFinderHooks.js releaseDateFinder` to regenerate. The hand-written frontend `types.ts` + `releaseDateFinderQueries.ts` are deleted — do not re-add.
- `buildReleaseDateFinderPrompt(...)` / `createReleaseDateFinderCallLlm(...)` — Prompt builder + LLM caller factory.

Backend routes (registered in `api/releaseDateFinderRoutes.js`):

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/release-date-finder/:cat/:pid` | `{ variant_key? }` → single run per variant (or single variant). |
| `POST` | `/release-date-finder/:cat/:pid/loop` | `{ variant_key? }` → budget loop per variant. Registers op with `subType: 'loop'`. |
| `GET` | `/release-date-finder/:cat/:pid` | Fetch RDF state + runs + publisher candidates per variant. |
| `DELETE` | `/release-date-finder/:cat/:pid/runs/:rn` | Delete one run; cascade publisher source cleanup. |
| `DELETE` | `/release-date-finder/:cat/:pid` | Delete all runs + source-type cleanup. |

## Dependencies

- **Generic infrastructure**: `src/core/finder/` — `runPerVariant`, `runVariantFieldLoop`, `createFinderRouteHandler` (with scalar-finder extension: `parseVariantKey` + `loop: { orchestrator }`), `finderOrchestrationHelpers`, JSON store, SQL store (auto-wired via `specDb.getFinderStore('releaseDateFinder')`).
- **Cross-feature (public API only)**: `src/features/publisher` — `submitCandidate` (candidate gate); `src/features/color-edition` — CEF variant registry (read via `specDb.variants.listActive`).
- **LLM phase**: `releaseDateFinder` in `src/core/config/llmPhaseDefs.js`.
- **Forbidden**: Other feature internals; `src/features/color-edition` internals (only public API imports).

## Domain Invariants

- **One value per variant**: Each variant gets exactly one candidate row (latest-wins across runs). Scalar `field_rule.release_date` is variant-scoped here — rows carry a `variant_id` FK to the variants table.
- **Publisher gate gates Loop satisfaction**: `runReleaseDateFinderLoop` stops retrying when EITHER (a) `submitCandidate` was reached (any status — publisher validation won't improve with a second LLM call on the same evidence) OR (b) LLM returned `unk` **with** `unknown_reason` (definitive "no release date exists"). Retries on: low confidence, missing evidence, LLM error, empty response.
- **Run button is always clickable, Loop button locks while looping**: Mirrors PIF's View/Hero/Loop pattern. `Run` is spammable (each click = fresh run). `Loop` disables itself per variant while its loop is in-flight via `useRunningVariantKeys('rdf', productId, 'loop')`.
- **Single-shot runs snapshot `previousRuns`; loop re-reads fresh per attempt**: Single-run mode reads discovery history once at setup (behavior-preserving). Loop mode re-reads before each attempt so retries see URLs/queries from prior attempts in the same loop.
- **loop_id propagation**: Every run emitted inside a `/loop` call carries the same `loop_id` in `run.response.loop_id`. Single-shot runs have no `loop_id` field. Frontend selectors group by this field when present.
- **Dual-state CQRS**: JSON (`{productRoot}/{productId}/release_date.json`) is durable memory. SQL `release_date_finder` + `release_date_finder_runs` are projections. Rebuildable from JSON via `rebuildReleaseDateFinderFromJson`.
- **Publisher failures never abort the run**: `submitCandidate` errors land on `candidate.publisher_error` — the run still persists. Publisher is advisory, not a hard dependency.
- **Satisfaction predicate = core default (Phase 4)**: RDF's former `rdfLoopSatisfied` is now the default on `registerScalarFinder` because it's the universal contract for every scalar field producer (stop on definitive unknown OR publisher-published). Future scalar finders inherit it without override. Bespoke predicates remain possible via the `satisfactionPredicate` factory opt.
- **Variant deletion cascades into RDF history**: When CEF deletes a variant, `color-edition/variantLifecycle.deleteVariant` (step 7) iterates `FINDER_MODULES` and calls `stripVariantFromFieldProducerHistory` (`src/core/finder/variantCleanup.js`) for every `moduleClass === 'variantFieldProducer'` entry. RDF's contribution: per-variant entries are stripped from `selected.candidates[]` aggregate + `runs[].selected.candidates[]` + `runs[].response.candidates[]`; runs whose only target was the deleted variant (matched by candidates OR by `run.response.variant_id` for empty-result LLM calls) are removed entirely (JSON entry + SQL run row); the aggregate is recomputed as latest-wins-per-variant. `field_candidates` rows anchored by `variant_id` (RDF's `submitCandidate` writes them this way) are FK-cascaded to delete via `cascadeVariantIdFromCandidates`, which also CASCADE-deletes their `field_candidate_evidence` projection. No RDF-side cleanup code required — the registry-driven cascade handles it.

## Settings (per-category, stored in `{category}/release_date_settings.json`)

| Key | Default | Purpose |
|---|---|---|
| `perVariantAttemptBudget` | **3** | Max LLM calls per variant in loop mode (1–5). Does NOT affect single-shot Run. |
| `discoveryPromptTemplate` | `''` | Optional per-category prompt override (hidden in UI; edited in LLM Config). |
| `urlHistoryEnabled` | `false` | Inject prior run URLs into the prompt (variant-scoped, per attempt in loop mode). |
| `queryHistoryEnabled` | `false` | Inject prior run search queries (variant-scoped). |
