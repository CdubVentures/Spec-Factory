## Purpose

Per-product color & edition discovery log. Stores cumulative LLM finder results in per-product JSON files (durable SSOT) and a queryable SQL summary table in specDb (derived, rebuildable).

## Public API (The Contract)

Exported from `index.js`:

- `readColorEdition({ productId, productRoot? })` — Read color_edition.json, returns parsed object or null
- `writeColorEdition({ productId, productRoot?, data })` — Write color_edition.json (creates dir if needed)
- `mergeColorEditionDiscovery({ productId, productRoot?, newDiscovery })` — Merge new finder results into existing file (first-discovery-wins). Returns merged doc.
- `rebuildColorEditionFinderFromJson({ specDb, productRoot? })` — Scan all product dirs, re-populate SQL table from JSON files. Returns `{ found, seeded, skipped }`.
- `colorEditionFinderResponseSchema` — Zod schema for LLM response validation
- `buildColorEditionFinderPrompt({ colorNames, product })` — Dynamic system prompt builder
- `createColorEditionFinderCallLlm(deps)` — Factory: creates bound LLM caller for the finder
- `runColorEditionFinder({ product, appDb, specDb, config, ... })` — Full orchestrator: LLM call → validate → register new colors → merge → persist

SQL store (wired through specDb, not imported directly):

- `specDb.upsertColorEditionFinder(row)` — Upsert summary row
- `specDb.getColorEditionFinder(productId)` — Get by product (hydrated arrays)
- `specDb.listColorEditionFinderByCategory(category)` — List all for category
- `specDb.getColorEditionFinderIfOnCooldown(productId)` — Returns row if cooldown active, null otherwise

## Dependencies

- **Allowed**: `src/core/config/runtimeArtifactRoots.js` (path resolution), `src/core/llm/` (LLM client + routing)
- **Cross-feature (via public API)**: `src/features/studio` (`getEgPresetForKey`), `src/features/indexing` (`createPhaseCallLlm`), `src/features/color-registry` (`writeBackColorRegistry`)
- **SQL store**: `src/db/stores/colorEditionFinderStore.js` (wired via specDb)
- **LLM phase**: Registered as `colorFinder` in `src/core/config/llmPhaseDefs.js`
- **Forbidden**: Other feature internals (only public API imports)

## Domain Invariants

- **JSON is rebuild SSOT**: SQL table is derived and rebuildable from JSON files
- **First-discovery-wins**: Existing color/edition attributions are never overwritten by later runs
- **Modifier-first naming**: `light-blue` not `blue-light`, matches CSS `--color-{name}`
- **Multi-color**: `+` separator, dominant-first order (`black+red` = mostly black)
- **Editions**: kebab-case slugs, open enum (`cyberpunk-2077-edition`)
- **O(1) scaling**: Adding a color/edition requires zero code changes — merge iterates over whatever keys the LLM returns
- **Soft enum at prompt level**: LLM prefers registered colors; unknown atoms returned in `new_colors` with hex for auto-registration
- **Auto-registration**: New colors discovered by the finder are auto-registered in `appDb.color_registry` + written back to JSON. They become available to all future LLM calls immediately.
