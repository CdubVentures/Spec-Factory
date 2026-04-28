# src/features/category-audit/

## Purpose

Produces per-category audit reports as paired HTML and Markdown artifacts. A reviewer uses the reports to judge every prompt-consumer input for a category: contract shape, enum, aliases, search hints, cross-field constraints, component relations, extraction guidance, and prompt templates.

Cross-cutting by design: category-audit reads field rules, category prompt settings, global fragments, and finder prompt templates, then renders review surfaces without calling an LLM.

## Public API (The Contract)

Exports from `src/features/category-audit/index.js`:

- `generateCategoryAuditReport({ category, consumer, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot, now }) -> Promise<{ htmlPath, mdPath, generatedAt, stats }>` - writes rolling summary files under `<outputRoot>/<category>/summary/`.
- `generatePerKeyDocs({ category, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot, now, templateOverride, fieldKeyOrder }) -> Promise<{ basePath, written, skipped, reservedKeysPath, counts, generatedAt, sorted }>` - writes per-field briefs under `<outputRoot>/<category>/per-key/`; `sorted/NN-<field_key>.md` is emitted when Key Navigator order is provided.
- `generatePromptAuditReports({ category, moduleSettings, globalFragments, outputRoot, now }) -> Promise<{ summary, perPromptReports, generatedAt, stats }>` - writes prompt summaries under `<outputRoot>/<category>/summary/` and prompt briefs under `<outputRoot>/<category>/per-prompt/`.
- `extractReportData({ category, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, now }) -> ReportData` - pure extractor for category/key-finder report data.
- `extractPromptAuditData({ category, moduleSettings, globalFragments, now }) -> PromptAuditData` - pure extractor behind prompt audit reports.
- `expectedFieldStudioPatchFileName({ category, fieldKey, navigatorOrdinal }) -> string` - canonical per-key auditor return filename, e.g. `mouse-07-design.field-studio-patch.v1.json`.
- `validateFieldStudioPatchDocument(doc, { category, fileName })`, `loadFieldStudioPatchDocuments({ category, inputDir })`, and `importFieldStudioPatchDirectory({ category, inputDir, fieldStudioMap, validateFieldStudioMap })` validate and apply strict `field-studio-patch.v1` JSON files from `<outputRoot>/<category>/auditors-responses/`.
- `registerCategoryAuditRoutes(ctx) -> routeHandler` - serves `POST /category-audit/:category/generate-report`, `generate-per-key-docs`, `generate-prompt-audit`, and `generate-all-reports`.

Adapters register per-consumer prompt rendering:

- `adapters/keyFinderAdapter.js` - `renderKeyFinderPreview(fieldRule, fieldKey, { tierBundles, searchHintsEnabled, componentInjectionEnabled })` emits the exact per-key slot text the live keyFinder would emit.

## Dependencies

- **Allowed**: `src/field-rules/loader.js`, `src/core/llm/prompts/fieldRuleRenderers.js`, `src/core/llm/prompts/globalPromptRegistry.js`, live finder prompt builders for read-only preview compilation, `src/features/key/keyFinderPromptContract.js`, `src/features/key/keyLlmAdapter.js`, `node:fs`, `node:path`.
- **Forbidden**: writing to field-rules authoring surfaces, calling the LLM, or persisting state into `specDb` / `appDb`.

## Domain Invariants

- **Rolling output, not timestamped.** Regeneration overwrites the live summary/per-key/per-prompt tree and never wipes `<outputRoot>/<category>/auditors-responses/`.
- **Category-scoped layout.** Generated reports live under `<outputRoot>/<category>/summary/`, `<outputRoot>/<category>/per-key/`, and `<outputRoot>/<category>/per-prompt/`. Auditor returns live under `<outputRoot>/<category>/auditors-responses/`.
- **Archive retention.** Before `per-key/` or `per-prompt/` is rebuilt, the previous tree moves under `<outputRoot>/<category>/archive/<timestamp>/`; archive folders older than 90 days are pruned.
- **Strict JSON patch contract.** Auditor return files are strict `field-studio-patch.v1` JSON. Omit unchanged paths; do not encode prose sentinels in JSON.
- **Pure report generation.** Report generation never writes to `category_authority/` or any rule surface. Patch import is a separate explicit operation.
- **Same content, two skins.** HTML and Markdown outputs describe the same sections in the same order; update the structure builders, not renderer-specific copies.
- **Render-time faithfulness.** Per-key prompt previews call the same renderers the live keyFinder calls, so regenerated reports must reflect prompt-rendering changes.
- **Per-key docs skip reserved keys.** Fields owned by other finder modules get listed in `<outputRoot>/<category>/per-key/_reserved-keys.md` instead of a per-key brief.
- **`sorted/` is opt-in and duplicate.** Sorted per-key docs are byte-for-byte copies or reserved stubs, rebuilt with the rest of `per-key/`.
- **Contract schema catalog is the SSOT for "every possible parameter".** When a rule parameter is added to the compiler, add a row to `contractSchemaCatalog.js`.
