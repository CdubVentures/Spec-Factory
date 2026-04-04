# Field Catalog Seed Retirement Audit — 2026-04-04

Scope: retire the dead `_source` bootstrap seed artifact, preserve compile/runtime behavior driven by `field_studio_map.json`, `schema.json`, `sources.json`, and generated artifacts.

Protected behavior:
- Category scaffolding still creates `schema.json` and `sources.json`.
- Category discovery still finds categories with a control-plane map or compiled rules.
- Expansion hardening bootstrap still scaffolds categories and golden manifests.
- Keyboard and monitor contract coverage still proves generated field-rule behavior and curated control-plane maps.

Out of scope:
- `field_studio_map.json`
- `schema.json`
- `sources.json`
- `_generated/*`
- `_control_plane/*`
- bundled output in `tools/dist/launcher.cjs`

| File | Bucket | Why | Replacement | Proof run | Final disposition |
| --- | --- | --- | --- | --- | --- |
| `category_authority/keyboard/_source/<bootstrap seed>` | RETIRE | Dead bootstrap artifact; not read by production compile/runtime paths. | None needed. Runtime contract remains on `_control_plane/field_studio_map.json` and `_generated/field_rules.json`. | Targeted contracts green; `npm test` green; symbol grep 0; `_source` dir absent. | Deleted |
| `category_authority/monitor/_source/<bootstrap seed>` | RETIRE | Dead bootstrap artifact; not read by production compile/runtime paths. | None needed. Runtime contract remains on `_control_plane/field_studio_map.json` and `_generated/field_rules.json`. | Targeted contracts green; `npm test` green; symbol grep 0; `_source` dir absent. | Deleted |
| `src/field-rules/compilerCategoryInit.js` | REFACTOR | Seed generation and `_source` scaffolding were dead architecture noise. | Keep `schema.json` and `sources.json` scaffolding only. | Targeted compiler tests green; `npm test` green; retired helper grep 0. | Updated |
| `src/field-rules/compiler.js` | REFACTOR | Category discovery should key off real compile inputs/outputs, not dead seed files. | Discovery now uses `_control_plane/field_studio_map.json` or `_generated/field_rules.json`. | Targeted compiler tests green; `npm test` green; retired symbol grep 0. | Updated |
| `src/db/tests/keyboard.contract.test.js` | RETIRE | Seed assertion was static structure coupling, not runtime protection. | Keep generated `field_rules.json` and control-plane map contract assertions. | Keyboard contract tests green; `npm test` green. | Updated |
| `src/db/tests/monitor.contract.test.js` | RETIRE | Seed assertion was static structure coupling, not runtime protection. | Keep generated `field_rules.json` and control-plane map contract assertions. | Monitor contract tests green; `npm test` green. | Updated |
| `src/field-rules/tests/compilerPipeline.test.js` | COLLAPSE | Old expectation treated init-only scaffolding as compilable discovery input. | Replacement contract proves init-only categories are ignored until real map/generated rules exist. | Targeted compiler tests green; `npm test` green. | Updated |
| `src/field-rules/tests/fieldRulesCompiler.test.js` | COLLAPSE | Old expectation preserved dead `_source` scaffolding. | Replacement contract proves initCategory creates only live category-authority scaffolding. | Targeted compiler tests green; `npm test` green. | Updated |
| `docs/data-structure/rebuild-map.html` | REFACTOR | Doc contained stale architectural claims about the retired seed file. | Updated to reflect `field_studio_map.json component_sources` as the component DB input. | Symbol grep 0; `npm test` green. | Updated |
