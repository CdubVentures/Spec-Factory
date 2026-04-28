# src/features/category-audit/

## Purpose

Produces per-category audit reports and flat per-key Markdown briefs. A reviewer uses the reports to judge every prompt-consumer input for a category: contract shape, enum, aliases, search hints, cross-field constraints, component relations, extraction guidance, and prompt templates.

Cross-cutting by design: category-audit reads field rules, category prompt settings, global fragments, and finder prompt templates, then renders review surfaces without calling an LLM.

## Public API (The Contract)

Exports from `src/features/category-audit/index.js`:

- `generateCategoryAuditReport({ category, consumer, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot, now }) -> Promise<{ htmlPath, mdPath, generatedAt, stats }>` - writes rolling summary files under `<outputRoot>/<category>/summary/`.
- `generatePerKeyDocs({ category, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot, now, templateOverride, fieldKeyOrder }) -> Promise<{ basePath, written, skipped, reservedKeysPath, counts, generatedAt, sorted }>` - writes flat per-field Markdown briefs directly under `<outputRoot>/<category>/per-key/` as `NN-<field_key>--<group>.md`; reserved finder-owned keys are emitted as `NN-<field_key>--<group>.reserved.md`.
- `generatePromptAuditReports({ category, moduleSettings, globalFragments, outputRoot, now }) -> Promise<{ summary, perPromptReports, generatedAt, stats }>` - writes prompt summaries under `<outputRoot>/<category>/summary/` and prompt briefs under `<outputRoot>/<category>/per-prompt/`.
- `generateKeysOrderAuditReport({ category, loadedRules, fieldGroups, fieldKeyOrder, globalFragments, tierBundles, compileSummary, outputRoot, now }) -> Promise<{ basePath, htmlPath, mdPath, promptPath, generatedAt, stats }>` - writes the key-order audit pack under `<outputRoot>/<category>/keys-order/`.
- `extractReportData({ category, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, now }) -> ReportData` - pure extractor for category/key-finder report data.
- `extractPromptAuditData({ category, moduleSettings, globalFragments, now }) -> PromptAuditData` - pure extractor behind prompt audit reports.
- `expectedFieldStudioPatchFileName({ category, fieldKey, navigatorOrdinal }) -> string` - canonical per-key auditor return filename, e.g. `mouse-07-design.field-studio-patch.v1.json`.
- `validateFieldStudioPatchDocument(doc, { category, fileName })`, `loadFieldStudioPatchDocuments({ category, inputDir })`, and `importFieldStudioPatchDirectory({ category, inputDir, fieldStudioMap, validateFieldStudioMap })` validate and apply strict `field-studio-patch.v1` JSON files from `<outputRoot>/<category>/auditors-responses/`.
- `expectedKeyOrderPatchFileName({ category })`, `validateKeyOrderPatchDocument(doc, { category, fileName, currentOrder, existingFieldKeys })`, `parseKeyOrderPatchPayloadFiles(...)`, and `applyKeyOrderPatchDocument(...)` validate and apply strict category-level `key-order-patch.v1` JSON for `field_key_order.json`.
- `registerCategoryAuditRoutes(ctx) -> routeHandler` - serves `POST /category-audit/:category/generate-report`, `generate-per-key-docs`, `generate-prompt-audit`, `generate-keys-order-audit`, and `generate-all-reports`.

Adapters register per-consumer prompt rendering:

- `adapters/keyFinderAdapter.js` - `renderKeyFinderPreview(fieldRule, fieldKey, { tierBundles, searchHintsEnabled, componentInjectionEnabled })` emits the exact per-key slot text the live keyFinder would emit.

## Dependencies

- **Allowed**: `src/field-rules/loader.js`, `src/core/llm/prompts/fieldRuleRenderers.js`, `src/core/llm/prompts/globalPromptRegistry.js`, live finder prompt builders for read-only preview compilation, `src/features/key/keyFinderPromptContract.js`, `src/features/key/keyLlmAdapter.js`, `node:fs`, `node:path`.
- **Forbidden**: writing to field-rules authoring surfaces, calling the LLM, or persisting state into `specDb` / `appDb`.

## Domain Invariants

- **Rolling output, not timestamped.** Regeneration overwrites the live summary/per-key/per-prompt/keys-order tree and never wipes `<outputRoot>/<category>/auditors-responses/`.
- **Category-scoped layout.** Generated reports live under `<outputRoot>/<category>/summary/`, `<outputRoot>/<category>/per-key/`, `<outputRoot>/<category>/per-prompt/`, and `<outputRoot>/<category>/keys-order/`. Auditor returns live under `<outputRoot>/<category>/auditors-responses/`.
- **Archive retention.** Before `per-key/`, `per-prompt/`, or `keys-order/` is rebuilt, the previous tree moves under `<outputRoot>/<category>/archive/<timestamp>/`; archive folders older than 90 days are pruned.
- **Strict JSON patch contract.** Auditor return files are strict `field-studio-patch.v1` or `key-order-patch.v1` JSON. Omit unchanged paths; do not encode prose sentinels in JSON.
- **Key-order imports are non-destructive.** A `key-order-patch.v1` proposal may reorder groups, add key proposals, and record rename proposals, but every existing/current key must remain exactly once in the resulting order.
- **Pure report generation.** Report generation never writes to `category_authority/` or any rule surface. Patch import is a separate explicit operation.
- **Summary/prompt reports use paired skins.** HTML and Markdown summary/prompt outputs describe the same sections in the same order; update the structure builders, not renderer-specific copies.
- **Render-time faithfulness.** Per-key prompt previews call the same renderers the live keyFinder calls, so regenerated reports must reflect prompt-rendering changes.
- **Per-key docs are flat and sorted.** No group folders and no `sorted/` child folder are emitted; `sorted.basePath` aliases the direct `per-key/` folder for API compatibility.
- **Reserved keys get stubs.** Fields owned by other finder modules get a direct `.reserved.md` stub and are listed in `<outputRoot>/<category>/per-key/_reserved-keys.md`.
- **Field-rule schema is the SSOT for authorable parameters.** Audit schema tables read `FIELD_RULE_SCHEMA` through `contractSchemaCatalog.js`; add new rule parameters in `src/field-rules/fieldRuleSchema.js` and keep audit-only rendering helpers local to category-audit.
