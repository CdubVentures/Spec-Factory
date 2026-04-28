# Billing / Cost / Telemetry Audit

Date: 2026-04-27
Worst severity: **MEDIUM** — `run_summary.telemetry.events[]` is capped at 6 000 entries; long runs lose tail telemetry silently.

## Cost write path (working)

LLM call → `buildBillingOnUsage()` → `appendCostLedgerEntry`:
- JSONL durable memory: `.workspace/global/billing/ledger/{month}.jsonl`
- SQL projection: `appDb.insertBillingEntry()` → `billing_calls` table

Both writes try/catch — billing never crashes the pipeline.

## Per-finder coverage

| Finder | File | Wired? |
|---|---|---|
| Key Finder (4 tiers) | `src/features/key/keyFinder.js:156–160` | ✓ |
| Color & Edition | `src/features/color-edition/colorEditionFinder.js:235–242` | ✓ |
| Product Image Finder | `src/features/product-image/productImageFinder.js:896, 1431` | ✓ |
| Carousel build (view + hero eval) | `src/features/product-image/carouselBuild.js:185, 503` | ✓ |
| RDF / SKU | `src/core/finder/variantScalarFieldProducer.js` | ✓ |
| Pipeline phases (needset, search-planner, brand-resolver, serp-selector) | `src/features/indexing/...` | ✓ via `llmContext.recordUsage` |

Phase registry SSOT: `src/core/config/llmPhaseDefs.js:40–88`.
Frontend mirror generated: `tools/gui-react/src/features/billing/billingCallTypeRegistry.generated.ts`.

## Identified gaps

### G1. Run-summary telemetry capped at 6 000 events — MEDIUM
**File:** `src/indexlab/runSummarySerializer.js:67`
```
events = state.specDb.getBridgeEventsByRunId(state.runId, 6000) || [];
```
Long runs (large catalogs, many fetches) silently truncate tail events. Overview's funnel/extraction/observability cards work off `run_summary.telemetry.events[]` and get an incomplete picture.

**Fix shape:** raise to 10 000 + add an explicit "events truncated" flag in the summary so the UI can surface it. Or stream events into a paginated table instead of a single array.

### G2. Orphaned-event counters not surfaced — LOW
**File:** `src/indexlab/runSummarySerializer.js:85`
`run_summary.observability` carries `llm_orphan_finish` and `llm_missing_telemetry` counters but nothing in the Overview card displays them.

**Fix shape:** add a small "telemetry warnings" line to the observability card when either counter > 0.

### G3. Billing dashboard refresh interval is 30 s — LOW
**File:** `tools/gui-react/src/features/billing/billingQueries.ts:67`
```
refetchInterval: BILLING_REFETCH,  // 30_000
```
Users wait up to 30 s after a finished run to see the new cost. No `data-change` event with `domains: ['billing']` exists.

**Fix shape:** emit a `billing-updated` data-change on run finalize and map to `['billing','dashboard']` + `['billing','entries']`. Pairs with the run-finalize event recommended in the IndexLab/Storage audit.

### G4. `imageEvaluator` calls have no dedicated phase entry — LOW
**File:** `src/core/config/llmPhaseDefs.js`
`carouselBuild.js` calls `image_view_evaluation` and `image_hero_selection` — the billing reasons exist under the `imageFinder` phase, but the evaluator isn't a separate phase. GUI cannot show a distinct "Image Evaluator" toggle and per-evaluator overrides aren't possible.

**Fix shape:** either declare `imageEvaluator` as a new phase with its own billing block + UI toggle, or document that view/hero eval are sub-orchestrators of `imageFinder`.

### G5. Publisher "repair" cost is not orphaned (info, not a gap)
The memory `project_publisher_repair_orphaned.md` says repair has no callers — confirmed: there is no separate LLM repair phase. `validateField` is pure code. Hard rejections don't cost anything to record.

## Confirmed-good patterns

- Unified `onUsage` callback wired through `buildLlmCallDeps` for every finder.
- LLM_PHASE_DEFS is the single source for `reason → label → color` and powers the codegen mirror.
- Dual-write JSONL + SQL is rebuild-safe (delete `billing_calls` → replay from JSONL).
- Per-tier KF reasons (`key_finding_easy/medium/hard/very_hard`) keep cost attribution accurate.
- Meta enrichment (`retry_without_schema`, `effort_level`, `web_search_enabled`, `duration_ms`) gives the GUI billing detail view real signal.

## Recommended fix order

1. **G1** — raise telemetry cap + explicit truncation flag. ~15 min.
2. **G3** — emit `billing-updated` from run finalize, map to billing query keys. ~20 min.
3. **G2** — surface orphaned-event counters in observability card.
4. **G4** — decide on imageEvaluator phase split or document.
