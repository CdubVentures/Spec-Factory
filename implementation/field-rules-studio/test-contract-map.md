# Field Rules Studio Test ↔ Contract Map

This map is for future developers to quickly locate the contract source of truth and the tests that enforce it.

## Contract Surfaces and Coverage

| Contract surface | Source modules | Primary tests |
|---|---|---|
| Field Studio compile contract | `src/ingest/categoryCompile.js`, `src/field-rules/compiler.js` | `test/categoryCompile.test.js`, `test/phase1FieldRulesCompiler.test.js`, `test/phase2CompilerPipeline.test.js` |
| Compiler/runtime handoff | `src/field-rules/compiler.js`, `src/cli/spec.js` | `test/phase1FieldRulesCompiler.test.js`, `test/componentPipeline.test.js` |
| Canonical hint contract (`field_studio_hints`) | `src/ingest/categoryCompile.js`, `src/review/reviewGridData.js` | `test/fieldStudioHintsCanonicalWiring.test.js`, `test/noLegacyRuntimeTraceGate.test.js` |
| Review grid source/method tokens | `src/review/reviewGridData.js`, `src/review/componentReviewData.js` | `test/reviewGridData.test.js`, `test/reviewLaneContractApi.test.js`, `test/reviewLaneContractGui.test.js`, `test/reviewCli.test.js` |
| Studio map contract (`field_studio_map.json`) | `src/api/routes/studioRoutes.js`, `src/ingest/categoryCompile.js` | `test/studioRoutesPropagation.test.js`, `test/mouseTab3GeneratedParity.test.js` |
| Catalog-seed sync contract | `src/ingest/catalogSeed.js`, `src/catalog/catalogProductLoader.js` | `test/catalogSeed.test.js` |
| Product catalog loader contract | `src/catalog/catalogProductLoader.js`, `src/catalog/productCatalog.js` | `test/catalogProductLoader.test.js`, `test/productCatalog.test.js`, `test/brandRegistry.test.js` |
| No-legacy-trace contract | `src/ingest/categoryCompile.js`, `src/review/reviewGridData.js`, `src/ingest/catalogSeed.js`, `src/ingest/categorySchemaSync.js`, `src/catalog/catalogProductLoader.js` | `test/noLegacyRuntimeTraceGate.test.js` |
| GUI persistence + autosave contract | `tools/gui-react/src/stores/uiStore.ts`, `tools/gui-react/src/stores/uiSettingsAuthority.ts`, `tools/gui-react/src/pages/studio/StudioPage.tsx` | `test/uiAutosaveAuthorityWiring.test.js`, `test/uiSettingsRoutes.test.js`, `test/settingsAutosaveDebounceContractWiring.test.js`, `test/studioSettingsGuiPersistencePropagation.test.js` |
| End-to-end review ecosystem contract | `src/review/reviewGridData.js`, `src/review/componentReviewData.js`, `src/db/seed.js` | `test/reviewEcosystem.test.js` |

## Audit artifacts

- `implementation/field-rules-studio/audits/2026-02-25-app-native-compile-audit.md`
- `implementation/field-rules-studio/audits/2026-02-25-compile-generated-audit.md`
- `implementation/field-rules-studio/audits/2026-02-25-full-audit-refresh.md`
- `implementation/field-rules-studio/audits/2026-02-25-full-compile-generated-test-compiler-audit.md`
- `implementation/field-rules-studio/audits/2026-02-25-mouse-key-authority-matrix.csv`
- `implementation/field-rules-studio/audits/2026-02-25-mouse-key-authority-matrix-summary.json`
- `implementation/field-rules-studio/audits/2026-02-25-mouse-tab3-coverage-refresh.json`
