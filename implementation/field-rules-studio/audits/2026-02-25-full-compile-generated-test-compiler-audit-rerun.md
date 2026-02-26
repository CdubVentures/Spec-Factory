# Full Compile / Generated / Test-Compiler Audit (Rerun)

Date: 2026-02-25
Workspace: `C:\Users\Chris\Desktop\Spec Factory`

## 1) Final Verdict

- Compile and generated contract integrity: PASS.
- Mouse Tab3 (Field Contract) parity against generated rules: PASS.
- Pipeline/indexing/seeding/review artifact wiring: PASS.
- Test-compiler contract behavior: PASS.
- Runtime no-legacy-excel contract: PASS.
- Residual excel/workbook naming traces in compile substrate/tests/scripts: PRESENT (non-runtime, cleanup candidate).

## 2) Commands Run and Results

### 2.1 Compile / Validate / Diff (live rerun)

Ran for `mouse`, `keyboard`, `monitor`:

- `node src/cli/spec.js compile-rules --category <cat> --local`
- `node src/cli/spec.js validate-rules --category <cat> --local`
- `node src/cli/spec.js compile-rules --category <cat> --dry-run --local`
- `node src/cli/spec.js rules-diff --category <cat> --local`

Results:

- `mouse`: compiled=true, valid=true, dry-run `would_change=false`, rules-diff safe, fields=80.
- `keyboard`: compiled=true, valid=true, dry-run `would_change=false`, rules-diff safe, fields=29.
- `monitor`: compiled=true, valid=true, dry-run `would_change=false`, rules-diff safe, fields=29.

Compile report summary:

- All 3 categories: `diff.changed=false`, `added=0`, `changed=0`, `removed=0`.
- Compile mode currently reports `field_studio` for all 3 categories.

### 2.2 Test Suites (rerun)

- `node --test test/compileProcessCompletion.test.js test/specDbSyncService.test.js test/dataAuthorityPropagationMatrix.test.js test/runtimeOpsRoutes.test.js test/runtimeOpsDataBuilders.test.js test/runtimeOpsPipelineFlow.test.js test/seedConsumerGateEnforcement.test.js test/workbookProductLoader.test.js test/noLegacyRuntimeTraceGate.test.js`
  - Result: `54/54` passing.
- `node --test test/categoryCompile.test.js test/phase1FieldRulesCompiler.test.js test/phase2CompilerPipeline.test.js test/componentPipeline.test.js test/contractDriven.test.js test/testDataProviderSourceIdentity.test.js test/goldenFiles.test.js`
  - Result: `220/220` passing.
- `node --test test/mouseTab3GeneratedParity.test.js test/fieldStudioHintsCanonicalWiring.test.js test/noLegacyRuntimeTraceGate.test.js test/componentReviewDataLaneState.test.js test/reviewLaneContractApi.test.js test/reviewLaneContractGui.test.js test/reviewGridData.test.js test/reviewOverrideWorkflow.test.js test/phase1FieldRulesLoader.test.js`
  - Result: `79/79` passing.
- `node --test test/reviewRoutesDataChangeContract.test.js test/reviewRouteSharedHelpersDataChange.test.js test/reviewEcosystem.test.js test/catalogSeed.test.js test/catalogProductLoader.test.js test/productCatalog.test.js test/brandRegistry.test.js test/studioRoutesPropagation.test.js test/reviewCli.test.js`
  - Result: `130/130` passing.

Aggregate rerun total: `483/483` passing.

## 3) Mouse Tab3 Contract Parity

Artifacts consulted:

- `implementation/field-rules-studio/audits/2026-02-25-mouse-tab3-coverage-refresh.json`
- `implementation/field-rules-studio/audits/2026-02-25-mouse-key-authority-matrix-summary.json`
- `implementation/field-rules-studio/audits/2026-02-25-mouse-key-authority-matrix.csv`

Coverage status:

- Generated fields: 80
- `selected_keys`: 75 (missing 0)
- `field_overrides`: 76 (missing 0)
- component property keys: 13 (missing 0)
- key migration observed: `switch_link -> switches_link`

Only matrix gaps are non-contract scratch list keys:

- `polling`
- `lift_notes`

These are reported as `data_list_missing_known_values_bucket` and are documented as non-blocking list-only rows.

## 4) Generated Artifact Integrity and Cross-Artifact Key Coverage

Generated `field_studio_hints` check:

- `rg -n "field_studio_hints" helper_files/*/_generated/field_rules.json`
- Result: `field_studio_hints` present in generated outputs.

Cross-artifact key coverage check (scripted):

- For `mouse`, `keyboard`, `monitor`:
  - `field_rules.fields` keys vs `ui_field_catalog.fields[].key`
  - `field_rules.fields` keys vs `parse_templates.templates`
  - enum-like fields vs `known_values.fields`
  - `field_studio_hints` presence per field

Result:

- All categories: missing UI keys = 0
- All categories: missing parse templates = 0
- All categories: enum-like fields missing known-values bucket = 0
- All categories: missing `field_studio_hints` = 0

## 5) What Each Core File Does (and where it is used beyond Mapping Studio)

- `src/ingest/categoryCompile.js`
  - Canonical compile substrate from field-studio map/source into generated artifacts.
  - Owns map validation, key migration application, component DB synthesis, compile warnings/report payload.
- `src/field-rules/compiler.js`
  - Compile orchestration (`compileRules`, `validateRules`, `rulesDiff`, `compileRulesAll`) and schema validation for generated artifacts.
- `src/field-rules/loader.js`
  - Runtime loader/cache/signature invalidation for generated artifacts (`field_rules`, `known_values`, `parse_templates`, `cross_validation_rules`, `ui_field_catalog`, `component_db`).
- `src/ingest/catalogSeed.js`
  - Seeds SpecDb/catalog-facing state from generated rules and field-studio contracts.
- `src/catalog/catalogProductLoader.js`
  - Loads app-native product catalog + overrides used by seed/review/pipeline startup paths.
- `src/review/reviewGridData.js`
  - Builds product review layout/payload/queue; consumes field contract + hints + rule metadata.
- `src/review/componentReviewData.js`
  - Builds component/enum review payloads with lane state, candidate synthesis, variance/constraint propagation.
- `src/api/routes/reviewRoutes.js`
  - Review API contract and lane mutation routing (grid/component/enum + propagation).
- `src/api/routes/studioRoutes.js`
  - Field Studio map read/write and compile trigger routes; known-values/component-db studio surfaces.
- `src/api/routes/testModeRoutes.js`
  - Test-compiler API: create `_test_` category, generate test products, run deterministic test-mode flows, validate.
- `src/testing/testDataProvider.js`
  - Contract-driven synthetic scenario builder and deterministic source-result generation (`buildTestProducts`, `buildDeterministicSourceResults`, `buildValidationChecks`).
- `src/cli/spec.js`
  - CLI entrypoint wiring compile/validate/diff/review/test/golden workflows.
- `src/api/services/compileProcessCompletion.js`
  - Post-compile cache invalidation + optional SpecDb sync + completion event fanout.

## 6) Use Cases Beyond Mapping Studio

Generated artifacts are in play across the full lifecycle:

- Pipeline/runtime/indexing:
  - Category load and engine consumption: `src/categories/loader.js`, `src/field-rules/loader.js`, `src/engine/fieldRulesEngine.js`.
- Seeding/catalog:
  - Seed ingestion and table population: `src/ingest/catalogSeed.js`, `src/db/seed.js`.
  - Catalog/identity enrichment: `src/catalog/catalogProductLoader.js`.
- Review:
  - Grid/component/enum payload builders: `src/review/reviewGridData.js`, `src/review/componentReviewData.js`.
  - API route surfaces: `src/api/routes/reviewRoutes.js`.
- Test compiler:
  - Contract analysis and deterministic synthesis: `src/testing/testDataProvider.js`.
  - Test-mode orchestration routes: `src/api/routes/testModeRoutes.js`.

Conclusion: artifact usage is not limited to Mapping Studio; it is authoritative through compile, runtime, seed, review, and deterministic test-mode.

## 7) Production Compiler vs Test Compiler (Difference Report)

Shared core:

- Both rely on the same generated contract shape and compile outputs (`field_rules`, `known_values`, `parse_templates`, `component_db`, etc.).

Production compiler path:

- Driven by CLI/API compile commands (`compile-rules`, `validate-rules`, `rules-diff`).
- Writes canonical generated artifacts + compile report and versioned control-plane snapshots.
- Integrates with completion invalidation/event fanout and optional SpecDb sync.

Test compiler path:

- Creates isolated `_test_<category>` contract workspace via `test-mode` routes.
- Generates deterministic products/sources/scenario checks from the contract.
- Executes run/validate loops without mutating production category artifacts.

Parity outcome:

- Contract behavior parity validated by green compile + contract-driven + test-data suites.
- Lifecycle topology differs intentionally (production side-effects vs deterministic isolated test harness).

## 8) Legacy Trace Audit

Runtime no-legacy contract status:

- `test/noLegacyRuntimeTraceGate.test.js`: PASS (runtime contract surfaces enforce canonical hint keys; shim modules removed; no shim imports).
- `test/fieldStudioHintsCanonicalWiring.test.js`: PASS (compiler emits `field_studio_hints`; review reads canonical hints only).

Residual traces still present (non-runtime compatibility identifiers):

- Compile substrate/source parsing internals:
  - `src/ingest/categoryCompile.js`
  - `src/ingest/catalogSeed.js`
- Legacy compatibility module names used by targeted trace-gate tests:
  - `src/ingest/excelSeed.js`
  - `src/ingest/excelCategorySync.js`

Assessment:

- No active runtime/review/compile contract drift from legacy hint-token names.
- Remaining references are compatibility identifier names only; cleanup can be done as a naming migration without contract changes.

## 9) Findings

No blocking correctness defects found in compile/generated/test-compiler/review-seed-runtime wiring.

Non-blocking observations:

- Source bootstrap now requires explicit `field_studio_source_path`; no implicit workbook probing is required.
- Two scratch list keys remain intentionally outside generated field contract buckets (`polling`, `lift_notes`).

## 10) Recommended Follow-up (optional cleanup pass)

1. Remove or rename residual compatibility identifiers (`excelSeed` / `excelCategorySync`) where semantically safe.
2. Keep the explicit source-path contract (`field_studio_source_path`) in compiler path checks.
3. Keep `noLegacyRuntimeTraceGate` and `fieldStudioHintsCanonicalWiring` in required CI gates.
