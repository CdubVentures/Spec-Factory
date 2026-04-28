## Purpose

Per-product color & edition discovery with full run history. Runtime reads use SQL finder summary/run rows first, while per-product JSON remains the durable rebuild/audit mirror. Each run captures full prompt + response for auditability.

## Public API (The Contract)

Exported from `index.js`:

- `readColorEdition({ productId, productRoot? })` — Read color_edition.json, returns parsed object or null
- `writeColorEdition({ productId, productRoot?, data })` — Write color_edition.json (creates dir if needed)
- `mergeColorEditionDiscovery({ productId, productRoot?, newDiscovery, run })` — Append run + set selected (latest-wins). Returns merged doc.
- `recalculateCumulativeFromRuns(runs, productId, category)` — Pure: derive all state from runs array
- `deleteColorEditionFinderRun({ productId, productRoot?, runNumber })` — Delete single run, recalculate. Returns null if no runs remain.
- `deleteColorEditionFinderAll({ productId, productRoot? })` — Delete JSON file entirely
- `rebuildColorEditionFinderFromJson({ specDb, productRoot? })` — Scan all product dirs, re-populate SQL from `selected` shape in JSON.
- `colorEditionFinderResponseSchema` — Zod schema: `{ colors: [{ name, confidence (0-100), evidence_refs }], color_names: Record, editions: Record<slug, { display_name, confidence (0-100), colors, evidence_refs }>, default_color: string, siblings_excluded: string[], discovery_log: { confirmed_from_known, added_new, rejected_from_known, urls_checked, queries_run } }`. Per-item `confidence` is the LLM's overall value-level rating (distinct from per-source `evidence_refs.confidence`).
- `buildColorEditionFinderPrompt({ colorNames, colors, product, previousRuns? })` — Dynamic system prompt with historical context
- `createColorEditionFinderCallLlm(deps)` — Factory: creates bound LLM caller
- `runColorEditionFinder({ product, appDb, specDb, config, ... })` — Full orchestrator: LLM call → capture prompt/response → SQL-first persist → JSON mirror
- `generateVariantId(productId, variantKey)` — Deterministic hash: `v_` + 8 hex chars from SHA-256. Product-scoped, never changes once assigned.
- `buildVariantRegistry({ productId, colors, colorNames, editions })` — Builds full variant registry array from CEF selected data. Each entry has stable `variant_id`, current `variant_key`/`variant_label`/`color_atoms`.
- `backfillVariantRegistry({ specDb, productRoot? })` — One-time backfill: scans all products, generates registry for those missing one, writes the JSON SSOT (`color_edition.json`). Idempotent.
- `deriveColorNamesFromVariants(variants, publishedColors, publishedEditions)` — Pure function: derives `{ colorNames, editionDetails }` display maps from variant rows. Used at GET time so response never depends on run-snapshot `selected`.
- `derivePublishedFromVariants({ specDb, productId, productRoot? })` — Re-derives published colors/editions from the `variants` SQL table (SSOT). Writes to product.json fields[] + CEF summary columns. Called after every CEF run and after variant deletion.
- `computePublishedArraysFromVariants(variants)` — Pure: project variant rows into `{ colors, editions, defaultColor }`. Single derivation site reused by `derivePublishedFromVariants` (write path) AND `publisherRoutes` (read path). Edition combos cascade into colors natively.
- `aggregateCefFieldConfidence(specDb, productId, fieldKey, activeVariants)` — Reads CEF-source rows from `field_candidates` and aggregates field-level confidence with `min()` across active variants (weakest-link = most honest aggregate). Returns 0 when no CEF candidates exist. Single derivation site reused by `derivePublishedFromVariants` (write) AND `publisherRoutes` (read). Never stamp `1.0` for CEF-derived fields — use this helper.
- `deleteVariant({ specDb, productId, variantId, productRoot? })` — Full cascade: removes variant from SQL table + JSON, strips values from candidates, re-derives published, cascades to PIF (images/evals/carousel/disk), and iterates every `variantFieldProducer` module from the registry to strip per-variant history (RDF + future SKU/price/etc.).
- `deleteAllVariants({ specDb, productId, productRoot? })` — Loops `deleteVariant` per active variant.
- `VARIANT_BACKED_FIELDS` / `isVariantBackedField(fieldKey)` — Constant set + predicate: `['colors', 'editions']`. Backend cascade consumers (e.g. `review/domain/deleteCandidate`) check this to skip republish on variant-backed fields. Mirrored in `tools/gui-react/src/features/color-edition-finder/index.ts`.
- `variantIdentityCheckResponseSchema` — Zod schema: `{ mappings: [{new_key, match, action, reason, verified?, preferred_label?, preferred_color_atoms?, confidence (0-100), evidence_refs}], remove: string[], orphan_remaps: [...] }`. Per-mapping `confidence` is the identity judge's overall confidence in that specific mapping decision.
- `buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors, newColorNames, newEditions, familyModelCount?, ambiguityLevel?, runCount? })` — System prompt for Run 2+ identity judge. Verifies discoveries via web, compares quality against existing registry, picks better labels. Receives ambiguity context.
- `createVariantIdentityCheckCallLlm(deps)` — Factory: creates bound LLM caller for identity judge (same `colorFinder` phase, `variant_identity_check` reason).
- `applyIdentityMappings({ existingRegistry, mappings, remove, productId, ... })` — Applies identity judge results to registry: updates matched entries (preserving hashes, applying `preferred_label` / `preferred_color_atoms` when present), creates new entries, hard-deletes wrong-product variants. Returns `{ registry, removed }`.

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

Variants table (standalone entity, wired as `specDb.variants`):

- `specDb.variants.upsert(opts)` — Insert or update a variant row
- `specDb.variants.get(productId, variantId)` — Single lookup (hydrated)
- `specDb.variants.listByProduct(productId)` — All variants for product (sorted by type, key)
- `specDb.variants.listActive(productId)` — Alias for listByProduct (no retired filter)
- `specDb.variants.remove(productId, variantId)` — Hard delete
- `specDb.variants.removeByProduct(productId)` — Delete all for product
- `specDb.variants.syncFromRegistry(productId, registryArray, { onAfterSync }?)` — Bulk upsert from variant_registry JSON array. Optional `onAfterSync({ productId })` callback fires after sync completes (used to trigger `derivePublishedFromVariants`).

## Dependencies

- **Generic infrastructure**: `src/core/finder/` — JSON store (`finderJsonStore`), route handler (`finderRoutes`), SQL store (`finderSqlStore`), module registry (`finderModuleRegistry`)
- **Allowed**: `src/core/config/runtimeArtifactRoots.js` (path resolution), `src/core/llm/` (LLM client + routing)
- **Cross-feature (via public API)**: `src/features/indexing` (`createPhaseCallLlm`), `src/features/publisher` (`submitCandidate` — candidate gate), `src/features/product-image` (`propagateVariantDelete`, `propagateVariantRenames`)
- **SQL store**: Generic `finderSqlStore` wired via `specDb.getFinderStore('colorEditionFinder')`. Backward-compat methods (`specDb.upsertColorEditionFinder`, etc.) delegate to generic store.
- **Variants store**: Standalone `variantStore` wired as `specDb.variants`. Created in `src/db/stores/variantStore.js`, DDL in `specDbSchema.js`.
- **LLM phase**: Registered as `colorFinder` in `src/core/config/llmPhaseDefs.js`
- **Module manifest**: Registered in `src/core/finder/finderModuleRegistry.js` — drives DDL, reseed, operations tracker labels, field studio gate
- **Forbidden**: Other feature internals (only public API imports)

## Domain Invariants

- **Dual-state CQRS**: SQL finder summary/run rows are the runtime/frontend projection and are written before `color_edition.json` on live runs. JSON is the durable rebuild/audit mirror. Both tables (`color_edition_finder`, `color_edition_finder_runs`) rebuildable from JSON
- **Latest-wins**: top-level `selected` always reflects the latest run's output
- **colors[0] IS the default**: first color in array = default variant. `default_color` must equal `colors[0]`
- **Edition-color pairing**: editions are keyed by slug, each has its own `colors` subset
- **Modifier-first naming**: `light-blue` not `blue-light`, matches CSS `--color-{name}`
- **Multi-color**: `+` separator, dominant-first order (`black+red` = mostly black)
- **Closed enum at prompt level**: LLM must map all discovered colors to registered atoms
- **Run history as source log**: each LLM call is stored in SQL `color_edition_finder_runs` and mirrored to the JSON `runs` array with full prompt + response
- **Cooldown derived from latest run**: deleting the latest run recalculates cooldown from the new latest
- **Candidate gate (all-or-nothing)**: Before CEF writes anything, `submitCandidate()` validates `colors` against Field Studio rules. If validation fails, the entire run is rejected — no CEF writes, no candidates, no cooldown. Failure stored in `color_edition_finder_runs` with `response.status = 'rejected'`. On success, repaired values (not raw LLM output) flow to CEF tables and `field_candidates`. Gate skipped gracefully if compiled rules not available (test environments).
- **Variants table is the SSOT**: The `variants` SQL table is the runtime authority for variant data. Published colors/editions are derived from variants via `derivePublishedFromVariants()`, not from candidate set_union. JSON `variant_registry` in `color_edition.json` is the durable backup (rebuild/seed only — never read at runtime). Wrong-product variants are hard-deleted (no soft-delete/retired flag).
- **Variant registry**: Each variant gets a permanent `v_<8-hex>` hash (`variant_id`) assigned on first CEF publish. Hash never changes even if variant name, color atoms, or edition details are updated. Dual-written to both JSON (`color_edition.json variant_registry[]`) and SQL (`variants` table).
- **Variant deletion cascade**: Deleting a variant (1) removes it from the `variants` table, (2) strips its contributed values from CEF-source `field_candidates` arrays + JSON, (3) FK-cascades feature-source candidates anchored by `variant_id` (which CASCADE-deletes their `field_candidate_evidence` rows), (4) removes from JSON SSOT (`variant_registry` + `selected.*`), (5) re-derives published, (6) cascades to PIF (images/evals/carousel/disk), and (7) iterates `FINDER_MODULES` where `moduleClass === 'variantFieldProducer'` and calls `stripVariantFromFieldProducerHistory` (`src/core/finder/variantCleanup.js`) for each — strips per-variant entries from each module's JSON + SQL run blobs, deletes whole runs whose only target was the deleted variant (matched by candidates OR by `run.response.variant_id` for empty-result runs), and recomputes the aggregate as latest-wins-per-variant. New variantFieldProducer modules inherit the cleanup automatically via the registry.
- **Candidates are evidence, not authority**: For variant-scoped fields (colors, editions), `field_candidates` are historical evidence of what each CEF run discovered. They do not drive published state. Published colors/editions come from the variants table. Candidates with `source: 'variant_registry'` in product.json fields[] indicate variant-derived publishing.
- **`selected` is audit-only**: `selected` in JSON is LLM feed-forward / audit trail only. Published truth for `color_names` and `edition_details` is derived from the variants table at GET time via `deriveColorNamesFromVariants`. Never read `selected` as published state.
- **Identity judge (Run 2+)**: Every CEF run after the first fires a second LLM call (`variant_identity_check` reason, same `colorFinder` phase) that acts as a judge/validator. It receives ambiguity context (`familyModelCount`, `ambiguityLevel`, `runCount`), uses **web access** to verify discoveries against official sources, compares label quality, picks the most accurate name (`preferred_label`), and may correct accepted variant atoms via `preferred_color_atoms` when visual evidence or official wording proves the discovery atom is wrong. Decisions: same variant (update metadata, keep hash), genuinely new (web-verified, create new hash), reject (hallucinated/unverifiable), or remove (wrong-product contamination — hard-deleted from registry + PIF cascade). Discontinued real products are NEVER removed. Identity check failure is **fatal** — rejects the entire run (no silent fallback). Run prompt/response nested: `{ discovery: {...}, identity_check: {...} }` on Run 2+, flat `{ system, user }` on Run 1.
- **Per-variant evidence projection (Run 2+)**: Identity-check `mappings[].evidence_refs` are keyed by `new_key` (`color:<combo>` / `edition:<slug>`). On successful runs, the finder projects those into `metadata.evidence_by_variant = { [variant_key]: [{url, tier, confidence}] }` on both the `colors` and `editions` candidates. The review drawer reads that map via `collectPublishedSourcesForVariant` so per-variant source lists differ by combo/slug. On Run 1 (no identity check) the map is empty and the drawer falls back to the discovery-level `metadata.evidence_refs`.
- **Candidate confidence is LLM-rated, not derived**: Both discovery and identity LLM calls return a per-item `confidence` (0-100), calibrated at prompt time by the shared `valueConfidencePromptFragment` rubric. The `confidence` passed to `submitCandidate` per variant follows precedence **identity > discovery > 0**: on Run 2+ the identity judge's per-mapping confidence wins (more context); on Run 1 or when no identity mapping exists, discovery's per-item confidence is used. The publisher's `publishConfidenceThreshold` gate sees the LLM's honest rating against cited evidence instead of the previous hardcoded `100` or derived `max(per-source)`.
- **Field-level confidence is aggregated, not stamped**: `product.json.fields.colors.confidence` and `.editions.confidence` are computed via `aggregateCefFieldConfidence()` — `min()` across active variants' per-candidate confidence — not hardcoded to `1.0`. Same helper is used by the publisher's GET read path so write and read agree.
- **Post-sync backfill**: After every `syncFromRegistry`, `backfillPifVariantIdsForProduct()` auto-heals stale PIF variant IDs (same key, drifted ID) and stamps missing IDs. Idempotent — no-op if nothing to fix.
- **Sync-triggers-derive**: The orchestrator does NOT write published state (colors, editions, default_color) to the summary table. `syncFromRegistry` fires `onAfterSync → derivePublishedFromVariants()`, which is the sole publisher. Summary `upsert` only writes bookkeeping columns (`run_count`, `latest_ran_at`).
