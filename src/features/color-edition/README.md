## Purpose

Per-product color & edition discovery with full run history. Stores LLM finder results in per-product JSON files (durable SSOT) and a queryable SQL summary table in specDb (derived, rebuildable). Each run captures full prompt + response for auditability.

## Public API (The Contract)

Exported from `index.js`:

- `readColorEdition({ productId, productRoot? })` — Read color_edition.json, returns parsed object or null
- `writeColorEdition({ productId, productRoot?, data })` — Write color_edition.json (creates dir if needed)
- `mergeColorEditionDiscovery({ productId, productRoot?, newDiscovery, run })` — Append run + set selected (latest-wins). Returns merged doc.
- `recalculateCumulativeFromRuns(runs, productId, category)` — Pure: derive all state from runs array
- `deleteColorEditionFinderRun({ productId, productRoot?, runNumber })` — Delete single run, recalculate. Returns null if no runs remain.
- `deleteColorEditionFinderAll({ productId, productRoot? })` — Delete JSON file entirely
- `rebuildColorEditionFinderFromJson({ specDb, productRoot? })` — Scan all product dirs, re-populate SQL. Handles legacy + new format.
- `colorEditionFinderResponseSchema` — Zod schema: `{ colors: string[], color_names: Record, editions: Record<slug, { display_name, colors }>, default_color: string, siblings_excluded: string[], discovery_log: { confirmed_from_known, added_new, rejected_from_known, urls_checked, queries_run } }`
- `buildColorEditionFinderPrompt({ colorNames, colors, product, previousRuns? })` — Dynamic system prompt with historical context
- `createColorEditionFinderCallLlm(deps)` — Factory: creates bound LLM caller
- `runColorEditionFinder({ product, appDb, specDb, config, ... })` — Full orchestrator: LLM call → capture prompt/response → merge → persist
- `generateVariantId(productId, variantKey)` — Deterministic hash: `v_` + 8 hex chars from SHA-256. Product-scoped, never changes once assigned.
- `buildVariantRegistry({ productId, colors, colorNames, editions })` — Builds full variant registry array from CEF selected data. Each entry has stable `variant_id`, current `variant_key`/`variant_label`/`color_atoms`.
- `backfillVariantRegistry({ specDb, productRoot? })` — One-time backfill: scans all products, generates registry for those missing one, writes JSON + SQL. Idempotent.
- `variantIdentityCheckResponseSchema` — Zod schema: `{ mappings: [{new_key, match, action, reason}], retired: string[] }`
- `buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors, newColorNames, newEditions })` — System prompt for Run 2+ identity check. Compares new discoveries against existing variant registry.
- `createVariantIdentityCheckCallLlm(deps)` — Factory: creates bound LLM caller for identity check (same `colorFinder` phase, `variant_identity_check` reason).
- `applyIdentityMappings({ existingRegistry, mappings, retired, productId, ... })` — Applies LLM identity check results to registry: updates matched entries (preserving hashes), creates new entries, marks retired entries.

SQL store (wired through specDb, not imported directly):

- `specDb.upsertColorEditionFinder(row)` — Upsert summary row
- `specDb.getColorEditionFinder(productId)` — Get by product (hydrated arrays)
- `specDb.listColorEditionFinderByCategory(category)` — List all for category
- `specDb.getColorEditionFinderIfOnCooldown(productId)` — Returns row if cooldown active, null otherwise
- `specDb.deleteColorEditionFinder(productId)` — Delete summary row
- `specDb.insertColorEditionFinderRun(row)` — Insert/upsert a single run row (SQL projection)
- `specDb.listColorEditionFinderRuns(productId)` — All runs for product (ASC order, hydrated)
- `specDb.getLatestColorEditionFinderRun(productId)` — Latest run only
- `specDb.deleteColorEditionFinderRunByNumber(productId, runNumber)` — Delete one run
- `specDb.deleteAllColorEditionFinderRuns(productId)` — Delete all runs for product

## Dependencies

- **Generic infrastructure**: `src/core/finder/` — JSON store (`finderJsonStore`), route handler (`finderRoutes`), SQL store (`finderSqlStore`), module registry (`finderModuleRegistry`)
- **Allowed**: `src/core/config/runtimeArtifactRoots.js` (path resolution), `src/core/llm/` (LLM client + routing)
- **Cross-feature (via public API)**: `src/features/indexing` (`createPhaseCallLlm`), `src/features/publisher` (`submitCandidate` — candidate gate)
- **SQL store**: Generic `finderSqlStore` wired via `specDb.getFinderStore('colorEditionFinder')`. Backward-compat methods (`specDb.upsertColorEditionFinder`, etc.) delegate to generic store.
- **LLM phase**: Registered as `colorFinder` in `src/core/config/llmPhaseDefs.js`
- **Module manifest**: Registered in `src/core/finder/finderModuleRegistry.js` — drives DDL, reseed, operations tracker labels, field studio gate
- **Forbidden**: Other feature internals (only public API imports)

## Domain Invariants

- **Dual-state CQRS**: JSON is durable memory (write-first, audit/recovery SSOT). SQL is frontend projection (UI reads only from DB). Both tables (`color_edition_finder`, `color_edition_finder_runs`) rebuildable from JSON
- **Latest-wins**: top-level `selected` always reflects the latest run's output
- **colors[0] IS the default**: first color in array = default variant. `default_color` must equal `colors[0]`
- **Edition-color pairing**: editions are keyed by slug, each has its own `colors` subset
- **Modifier-first naming**: `light-blue` not `blue-light`, matches CSS `--color-{name}`
- **Multi-color**: `+` separator, dominant-first order (`black+red` = mostly black)
- **Closed enum at prompt level**: LLM must map all discovered colors to registered atoms
- **Run history as source log**: each LLM call stored in `runs` array with full prompt + response
- **Cooldown derived from latest run**: deleting the latest run recalculates cooldown from the new latest
- **Candidate gate (all-or-nothing)**: Before CEF writes anything, `submitCandidate()` validates `colors` against Field Studio rules. If validation fails, the entire run is rejected — no CEF writes, no candidates, no cooldown. Failure stored in `color_edition_finder_runs` with `response.status = 'rejected'`. On success, repaired values (not raw LLM output) flow to CEF tables and `field_candidates`. Gate skipped gracefully if compiled rules not available (test environments).
- **Variant registry**: Each variant gets a permanent `v_<8-hex>` hash (`variant_id`) assigned on first CEF publish. Hash never changes even if variant name, color atoms, or edition details are updated. Stored as `variant_registry` array on `color_edition.json` (top-level, not inside `selected`). Projected to SQL `color_edition_finder.variant_registry` column.
- **Identity check (Run 2+)**: Every CEF run after the first fires a second LLM call (`variant_identity_check` reason, same `colorFinder` phase) that compares new discoveries against the existing registry. The LLM decides: same variant (update metadata, keep hash) or genuinely new (create new hash). Retired variants are marked `retired: true` but never removed. If the identity check call fails, falls back to write-once behavior (no registry modification). Run prompt/response is nested: `{ discovery: {...}, identity_check: {...} }` on Run 2+, flat `{ system, user }` on Run 1.
