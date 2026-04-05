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
- `colorEditionFinderResponseSchema` — Zod schema: `{ colors: string[], editions: Record<slug, { colors: string[] }>, default_color: string }`
- `buildColorEditionFinderPrompt({ colorNames, colors, product, previousRuns? })` — Dynamic system prompt with historical context
- `createColorEditionFinderCallLlm(deps)` — Factory: creates bound LLM caller
- `runColorEditionFinder({ product, appDb, specDb, config, ... })` — Full orchestrator: LLM call → capture prompt/response → merge → persist

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

- **Allowed**: `src/core/config/runtimeArtifactRoots.js` (path resolution), `src/core/llm/` (LLM client + routing)
- **Cross-feature (via public API)**: `src/features/studio` (`getEgPresetForKey`), `src/features/indexing` (`createPhaseCallLlm`)
- **SQL store**: `src/db/stores/colorEditionFinderStore.js` (wired via specDb)
- **LLM phase**: Registered as `colorFinder` in `src/core/config/llmPhaseDefs.js`
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
