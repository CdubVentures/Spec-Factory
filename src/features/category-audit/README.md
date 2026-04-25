# src/features/category-audit/

## Purpose

Produces per-category audit reports as paired HTML + Markdown artifacts. A reviewer uses the report to judge every input a prompt consumer (keyFinder today, indexing pipeline tomorrow) sees for every field in a category — contract shape, enum, aliases, search hints, cross-field constraints, component relations, extraction guidance — and iteratively tighten the contract + guidance each cycle.

Cross-cutting by design: the report describes the category's field-rules + the generic prompt surface shared across prompt consumers. Per-consumer prompt previews are rendered via pluggable adapters (`adapters/*`).

## Public API (The Contract)

Exports from `src/features/category-audit/index.js`:

- `generateCategoryAuditReport({ category, consumer, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot, now }) → Promise<{ htmlPath, mdPath, generatedAt, stats }>` — orchestrator. Synchronous file I/O + rendering, no LLM / no network. Rolling filenames (`<category>-<consumer>-audit.html` / `.md`) overwritten per run.
- `generatePerKeyDocs({ category, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot, now, templateOverride, fieldKeyOrder }) → Promise<{ basePath, written, skipped, reservedKeysPath, counts, generatedAt, sorted }>` — emits a paired HTML + Markdown brief per non-reserved field under `<outputRoot>/per-key/<category>/<group>/<field_key>.{html,md}`, plus a single `_reserved-keys.md` summary at the category root for fields owned by other finder modules. Each brief shows purpose, the full contract schema (every possible parameter + current value), current enum + pattern, component relation, siblings in the group, and the full compiled keyFinder preview prompt with placeholder product identity. When `fieldKeyOrder` (the Key Navigator order array from `category_authority/<category>/_control_plane/field_key_order.json`) is provided, also writes `<outputRoot>/per-key/<category>/sorted/NN-<field_key>.md` — one entry per non-separator field in navigator order, zero-padded to ≥2 digits. Reserved keys get a small `NN-<field_key>.reserved.md` stub linking back to `_reserved-keys.md`; navigator entries not present in the compiled rules are silently skipped.
- `extractReportData({ category, loadedRules, fieldGroups, globalFragments, tierBundles, compileSummary, now }) → ReportData` — pure extractor, safe for tests and alternate renderers.
- `registerCategoryAuditRoutes(ctx) → routeHandler` — HTTP surface. Serves `POST /category-audit/:category/generate-report` (body: `{ consumer: 'key_finder' }`), `POST /category-audit/:category/generate-per-key-docs` (body: `{ templateOverride: string }`), and `POST /category-audit/:category/generate-all-reports` (body: `{ consumer: 'key_finder', templateOverride: string }`). The all-reports route returns `{ categoryReport, perKeyDocs }`; `{ error }` on 400.

Adapters register per-consumer prompt rendering:

- `adapters/keyFinderAdapter.js` — `renderKeyFinderPreview(fieldRule, fieldKey, { tierBundles, searchHintsEnabled, componentInjectionEnabled })` uses the shared field-rule renderers to emit the exact per-key slot text the live keyFinder would emit.

Adapter notes:
- `adapters/keyFinderAdapter.js` accepts `knownValues` and resolves sourced enum contracts the same way live keyFinder prompt rendering does.

## Dependencies

- **Allowed**: `src/field-rules/loader.js`, `src/core/llm/prompts/fieldRuleRenderers.js`, `src/core/llm/prompts/globalPromptRegistry.js`, `src/features/key/keyFinderPromptContract.js` (read-only import of `KEY_FINDER_VARIABLES`), `src/features/key/keyLlmAdapter.js` (read-only import of `KEY_FINDER_DEFAULT_TEMPLATE`), `node:fs`, `node:path`.
- **Forbidden**: writing to field-rules authoring surfaces, calling the LLM, persisting state into `specDb` / `appDb`. Category-audit is READ-ONLY on the rule surface; it never mutates rules or triggers compilation.

## Domain Invariants

- **Rolling output, not timestamped.** Successive runs overwrite the prior pair. Historical diffs live in git, not in the filename. Applies to category reports AND per-key docs (entire `per-key/<category>/` subtree rewritten on each run).
- **Pure read-only.** The generator never writes to `category_authority/` or any rule surface.
- **Same content, two skins.** HTML and Markdown outputs describe the SAME sections in the SAME order. When adding a new section, update `reportStructure.js` (category report) or `perKeyDocStructure.js` (per-key brief) — both renderers (`reportHtml.js` + `reportMarkdown.js`, via `renderHtmlFromStructure` / `renderMarkdownFromStructure`) pick it up automatically.
- **No suggestions, no flags, no verdicts.** The report surfaces current state + gap counters. Judgment is the auditor's job.
- **Consumer adapter isolation.** Each consumer's per-key preview lives in `adapters/<consumer>Adapter.js` and depends only on `src/core/llm/prompts/` primitives. Adding a new consumer (e.g. `indexing`) means adding one adapter file + one entry in `SUPPORTED_CONSUMERS` in `reportBuilder.js` — no changes to extraction, rendering, or the route.
- **Render-time faithfulness.** The per-key prompt preview (both in the category report and the per-key docs) calls the SAME renderers the live keyFinder calls, so the preview is byte-authentic to production. If production prompt rendering changes, regenerated reports must reflect the new rendered slots instead of preserving stale audit warnings.
- **Per-key docs skip reserved keys.** Fields owned by other finder modules (CEF/RDF/SKF, plus compile-locked EG preset keys) get listed in `per-key/<category>/_reserved-keys.md` instead of a per-key brief — keyFinder does not build a prompt for them.
- **`sorted/` is opt-in and a duplicate.** It only exists when the route hands in `fieldKeyOrder`. Each entry is a byte-for-byte copy of the canonical group-folder `.md` (or a reserved-stub for non-keyFinder keys). The folder is fully wiped and rebuilt on every run alongside the rest of the per-key subtree.
- **Contract schema catalog is the SSOT for "every possible parameter".** `contractSchemaCatalog.js` is hand-authored so each parameter carries its teaching string. When a new rule parameter is added to the compiler, add a row here too.
