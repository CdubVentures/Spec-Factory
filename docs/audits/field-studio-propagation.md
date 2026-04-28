# Field Rules Studio → Consumer Propagation Audit

Date: 2026-04-27
Worst severity: **MEDIUM** (prompt previews for non-KF finders not invalidated; manual enums require recompile).

## Studio source inventory

| Source | Path | SQL projection |
|---|---|---|
| Field Studio Map | `category_authority/<cat>/_control_plane/field_studio_map.json` | `specDb.field_studio_map` |
| Compiled field rules | `_generated/field_rules.json` | `specDb.compiled_rules` |
| Known values | `_generated/known_values.json` | `specDb.compiled_rules` |
| Parse templates | `_generated/parse_templates.json` | `specDb.compiled_rules` |
| UI field catalog | `_generated/ui_field_catalog.json` | `specDb.compiled_rules` |
| Field groups | `_generated/field_groups.json` | `specDb.compiled_rules` |
| Cross-validation rules | `_generated/cross_validation_rules.json` | `specDb.compiled_rules` |

JSON is the durable memory; SQL is the runtime SSOT (compiles at boot via `fieldStudioMapReseed.js`, hash-gated).

## Consumer surfaces and query keys

| Consumer | Query key |
|---|---|
| Studio map editor | `['studio-config', cat]` |
| Studio Known Values tab | `['studio-known-values', cat]` |
| Studio Component DB tab | `['studio-component-db', cat]` |
| Studio Artifacts | `['studio-artifacts', cat]` |
| Review grid layout | `['reviewLayout', cat]` |
| Review field labels | `['fieldLabels', cat]` |
| KeyFinder panel layout | `['reviewLayout', cat]` |
| All finder prompt previews | `['prompt-preview', finder, cat, productId, bodyKey]` |
| FieldRulesEngine (backend) | runtime: `specDb.getCompiledRules()` |
| SessionCache (backend) | runtime: merges studio map + compiled rules |

## Edit-propagation matrix

| Studio edit | SQL written | JSON written | `emitDataChange` domains | Auto-refresh? | Manual refresh needed? |
|---|---|---|---|---|---|
| Toggle eg_toggle / lock | ✓ | ✓ | studio, mapping, review-layout, labels | ✓ | No |
| Edit field rule (`field_overrides`) | ✓ | ✓ | studio, mapping, review-layout, labels | ✓ | No |
| Edit data_lists (manual enums) | ✓ | ✓ | studio, mapping | **No** (no compile triggered) | **Yes** — must recompile |
| Edit search_hints / source_tier | ✓ | ✓ | studio, mapping, review-layout, labels | ✓ for prompt preview | No |
| Reorder field_groups | ✓ | ✓ | studio, mapping, review-layout | ✓ | No |
| Reorder field keys | ✓ | ✓ | studio, mapping, review-layout, labels | ✓ | No |

## Identified gaps

### G1. `prompt-preview` invalidation only covers KF — MEDIUM
**File:** `src/core/events/eventRegistry.js:45`
The `'review-layout'` domain template includes `['prompt-preview', 'key', cat]` but **not** `['prompt-preview', 'sku', cat]`, `'rdf'`, `'cef'`, or `'pif'`. Yet all five finders read `search_hints` and `source_tier` from `field_rules` at preview-render time.

**Effect:** edit a search hint in studio → only KF preview refreshes; SKU/RDF/CEF/PIF previews show stale prompt until you close and reopen them.

**Fix shape:** extend `'review-layout'` domain template:
```
['prompt-preview', 'key', cat],
['prompt-preview', 'sku', cat],
['prompt-preview', 'rdf', cat],
['prompt-preview', 'cef', cat],
['prompt-preview', 'pif', cat],
```

### G2. Manual enum (`data_lists`) edits aren't live — MEDIUM
**File:** `src/features/studio/api/studioRoutes.js:341–350`
Saving `data_lists` invalidates session cache but does **not** trigger a recompile, so `specDb.compiled_rules.known_values` stays old. Prompt previews and validation use stale enum lists until the user clicks "Compile" or the next background compile runs.

**Fix shape:** decide intent.
- Option A (preferred): trigger a lightweight recompile-of-known-values in the same handler.
- Option B: keep as draft-until-compile, but show a "Compile needed" badge in the UI and document the latency.

### G3. `studioPersistenceAuthority` only invalidates `studio-config` — LOW
**File:** `tools/gui-react/src/features/studio/state/studioPersistenceAuthority.ts:21–26`
On map save, only `['studio-config', cat]` is explicitly invalidated. The main `['studio', cat]` payload relies on a side-effect in `StudioPage.tsx:82–91` (IndexLab completion). If the user edits while no run is active, the main studio payload won't refetch until next navigation.

**Fix shape:** add `queryClient.invalidateQueries({ queryKey: ['studio', cat] })` next to the existing call.

### G4. Compiler artifacts not in domain mapping — VERY LOW
**File:** `src/core/events/eventRegistry.js`
`reviewLayoutByCategory.delete(cat)` is an in-memory backend cache invalidation; not reflected in any domain template. Currently caught by `FALLBACK_QUERY_TEMPLATES` so works, but implicit.

**Fix shape:** add an explicit `'compiler-artifacts'` domain template if/when the compile pipeline emits a typed event.

## Confirmed-good patterns

- `fieldStudioMapReseed.js` reads JSON only at boot, hash-gated, then the server runs from SQL. Compliant.
- Studio writes are SQL-first then JSON (fire-and-forget). Compliant.
- `emitDataChange` fans out across 4 declarative domains; `DOMAIN_QUERY_TEMPLATES` already covers most consumers.
- EG-locked field overrides sanitized server-side via `sanitizeEgLockedOverrides`.

## Recommended fix order

1. **G1** — add four prompt-preview keys to `'review-layout'` domain. ~3 min.
2. **G2** — pick a model for manual-enum recompile (auto vs. badge). Decision needed.
3. **G3** — add `['studio', cat]` invalidation in `studioPersistenceAuthority`. ~2 min.
4. Add a contract test ensuring every studio edit type invalidates the right consumers.
