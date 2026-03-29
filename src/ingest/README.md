## Purpose

Category field rule compilation pipeline. Transforms a Field Studio map (spreadsheet schema) into deterministic runtime field rules, UI catalog, known values, and component database artifacts.

## Public API (The Contract)

- `compileCategoryFieldStudio({ category, fieldStudioMap, config, ... })` — async. Full compilation orchestrator. Returns `{ compiled, field_count, compile_report, ... }`.
- `validateFieldStudioMap(map, options)` — validates map structure. Returns `{ valid, errors, normalized }`.
- `loadFieldStudioMap({ category, config, mapPath })` — loads map from disk.
- `saveFieldStudioMap({ category, config, map })` — persists map to disk.

## Dependencies

- Allowed: `src/shared/primitives.js`, `src/utils/fieldKeys.js`, `src/field-rules/consumerGate.js`
- Forbidden: Direct imports from `src/features/*/` internals

## Domain Invariants

- Deterministic output: same inputs → byte-identical `field_rules.json` (canonical identity).
- Runtime/UI key alignment: every key in `field_rules.json` must appear in `ui_field_catalog.json` and vice versa.
- Key migration cycles are rejected (compile fails, no artifacts written).
- Compile timestamp is reused when map hash and source hash are unchanged (prevents false diffs).
