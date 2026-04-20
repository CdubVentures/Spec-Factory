## Purpose

Per-variant manufacturer-part-number (MPN) discovery. Second `variantFieldProducer` module after RDF: iterates CEF variants, runs one LLM search per variant, routes each result through the shared publisher gate with a `variant_id`-scoped candidate. Dual-writes run history to JSON (durable SSOT) and a projected SQL table for fast UI reads.

**Factory-driven**: the feature file ships only the prompt + LLM caller pair. All structural wiring (Zod schemas, JSON store, orchestrator, satisfaction predicate, extract logic) derives from the scalar-finder factories in `src/core/finder/`:
- `createScalarFinderSchema({ valueKey:'sku', valueType:'string', includeEvidenceKind:true })` → `skuFinderResponseSchema`
- `createScalarFinderEditorialSchemas({ llmResponseSchema, includeEvidenceKind:true })` → candidate/run/getResponse schemas driving `types.generated.ts`
- `createScalarFinderStore({ filePrefix:'sku' })` (latest-wins-per-variant JSON store)
- `registerScalarFinder` (wires everything to `createVariantScalarFieldProducer` with default extract + satisfaction predicates)

The 4 declarative fields on SKF's registry entry (`valueKey`, `valueType`, `candidateSourceType`, `logPrefix`) are the full backend config surface.

**Extended evidence**: SKF opts into `supporting_evidence` + `evidence_kind` via `includeEvidenceKind:true` — matches RDF's post-upgrade shape.

## Public API (The Contract)

Consumers import from the specific file (no barrel):

- `runSkuFinder`, `runSkuFinderLoop` — from `skuFinder.js`
- `readSkus` / `writeSkus` / `mergeSkuDiscovery` / `deleteSkuFinderRun` / `deleteSkuFinderRuns` / `deleteSkuFinderAll` / `rebuildSkuFinderFromJson` — from `skuStore.js`
- `skuFinderResponseSchema` / `skuFinderGetResponseSchema` — from `skuSchema.js`
- `buildSkuFinderPrompt` / `createSkuFinderCallLlm` — from `skuLlmAdapter.js`
- `registerSkuFinderRoutes` — from `api/skuFinderRoutes.js`

Contract details:

- `runSkuFinder({ product, appDb, specDb, config, productRoot?, variantKey?, ... })` — Single-shot per-variant orchestrator. One LLM call per variant, no retry. Wired to `POST /sku-finder/:cat/:pid`.
- `runSkuFinderLoop(...)` — Budget loop orchestrator. Retries per variant up to `perVariantAttemptBudget` (default **3**) until the candidate reaches the publisher gate or LLM returns definitive unknown. Wired to `POST /sku-finder/:cat/:pid/loop`. All runs share `run.response.loop_id`.
- `rebuildSkuFinderFromJson({ specDb, productRoot? })` — Rebuild SQL projection from JSON SSOT.
- `skuFinderResponseSchema` — Zod: `{ sku, confidence (0-100), unknown_reason, evidence_refs[{url, tier, confidence, supporting_evidence, evidence_kind?}], discovery_log }`.
- `skuFinderGetResponseSchema` — Zod for the full GET shape. Drives `types.generated.ts` + `skuFinderQueries.generated.ts` codegen.

Backend routes:

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/sku-finder/:cat/:pid` | `{ variant_key? }` → single run per variant (or single variant). |
| `POST` | `/sku-finder/:cat/:pid/loop` | `{ variant_key? }` → budget loop per variant. `subType: 'loop'`. |
| `GET` | `/sku-finder/:cat/:pid` | Fetch SKF state + runs + publisher candidates per variant. |
| `DELETE` | `/sku-finder/:cat/:pid/runs/:rn` | Delete one run; cascade publisher source cleanup. |
| `DELETE` | `/sku-finder/:cat/:pid` | Delete all runs + source-type cleanup. |

## Dependencies

- **Generic infrastructure**: `src/core/finder/` — all scalar-finder factories + shared fragments (identity, evidence, verification, confidence, discovery).
- **Cross-feature (public API only)**: `src/features/publisher` — `submitCandidate`; `src/features/color-edition` — CEF variant registry (read via `specDb.variants.listActive`).
- **LLM phase**: `skuFinder` in `src/core/config/llmPhaseDefs.js`.
- **Forbidden**: other feature internals; CEF/RDF/PIF internals (public API only).

## Domain Invariants

- **MPN is exact-or-unknown**. No precision ladder, no partial codes. The LLM returns the MPN verbatim or `"unk"` with `unknown_reason`.
- **Variant-specific MPN preferred**. When a manufacturer publishes per-variant MPNs (e.g. `-BLACK`, `-WHITE` suffixes), return the variant MPN. If the manufacturer uses one base MPN for all variants, return it with a discovery-log note.
- **Never guess variant MPN**. If only the base MPN is visible and other variants have distinct MPNs, return `"unk"` — do NOT assume the base MPN applies.
- **Tier1 is near-exclusive authority**. Manufacturer product page is the only reliable MPN source. Retailer listings (tier3) often show retailer SKUs, not MPNs.
- **ASINs are NOT MPNs**. Amazon ASINs (10 chars, start with `B0`) are retailer-assigned. Reject unless the manufacturer page confirms the same code as its MPN.
- **One value per variant**: each variant gets exactly one candidate row (latest-wins across runs). Rows carry a `variant_id` FK to the variants table.
- **Publisher gate gates Loop satisfaction**: loop retries until (a) `submitCandidate` was reached OR (b) LLM returned `unk` with `unknown_reason`.
- **Dual-state CQRS**: JSON (`{productRoot}/{productId}/sku.json`) is durable memory. SQL `sku_finder` + `sku_finder_runs` are projections. Rebuildable via `rebuildSkuFinderFromJson`.
- **Publisher failures never abort the run**: `submitCandidate` errors land on `candidate.publisher_error` — the run persists.
- **Variant deletion cascades into SKF history** via the registry-driven cascade in `color-edition/variantLifecycle.deleteVariant`. No SKF-side cleanup code required.

## Settings (per-category)

| Key | Default | Purpose |
|---|---|---|
| `perVariantAttemptBudget` | **3** | Max LLM calls per variant in loop mode (1–5). Does NOT affect single-shot Run. |
| `discoveryPromptTemplate` | `''` | Optional per-category prompt override (hidden in UI; edited in LLM Config). |
| `urlHistoryEnabled` | `false` | Inject prior run URLs into the prompt (variant-scoped, per attempt in loop mode). |
| `queryHistoryEnabled` | `false` | Inject prior run search queries (variant-scoped). |
