# Unit Normalization Roadmap Audit

Audit target: `docs/implementation/field-rules-studio/unit-normalization-roadmap.md`

## Summary

The roadmap direction is coherent, but the current file-touch estimate is incomplete.

- Phase 1 is missing compiler artifact, validator-doc, contract-test, Studio-test, and generated category artifact fallout.
- Phase 2 is materially under-scoped. It needs DB schema/migration/store work, candidate/write-path work, reseed/rebuild work, review-grid/component-review payload work, publisher GUI work, and contract/type regeneration.
- Phase 3 is also broader than listed because the new registry replaces per-field unit config across compiler, consumer metadata, tests, prompting, and generated category outputs.

There is also a filename typo in the request path: the file in-repo is `unit-normalization-roadmap.md`, not `nit-normalization-roadmap.md`.

## Phase 1: Remove Dead Unit Knobs

### Direct implementation files

- `tools/gui-react/src/features/studio/components/key-sections/KeyParseRulesSection.tsx`
- `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
- `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
- `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
- `tools/gui-react/src/utils/studioConstants.ts`
- `src/field-rules/consumerGate.js`
- `src/field-rules/consumerBadgeRegistry.js`
- `src/field-rules/compilerArtifactBuilders.js`
- `src/field-rules/capabilities.json`
- `src/ingest/compileFieldRuleBuilder.js`
- `src/ingest/compileValidation.js`
- `src/features/publisher/validation/checks/checkUnit.js`
- `src/features/publisher/validation/validateField.js`
- `src/features/publisher/validation/phaseRegistry.js`
- `src/features/publisher/validation/README.md`
- `src/tests/fieldContractTestRunner.js`
- `src/tests/deriveFailureValues.js`

### Tests that will break or need replacement

- `tools/gui-react/src/features/studio/workbench/__tests__/systemMappingCoverage.test.js`
- `tools/gui-react/src/features/studio/state/__tests__/studioRemovedKnobStoreSanitization.test.js`
- `src/field-rules/tests/noDeadConfig.test.js`
- `src/field-rules/tests/consumerBadgeRegistry.test.js`
- `src/ingest/tests/mouse.compile.field-overrides.test.js`
- `src/features/publisher/validation/tests/checkUnit.test.js`
- `src/features/publisher/validation/tests/phaseRegistry.test.js`
- `src/features/publisher/validation/tests/validateField.test.js`
- `src/features/publisher/validation/tests/validateRecord.test.js`
- `src/features/publisher/repair-adapter/tests/promptBuilder.test.js`

### Generated / recompiled artifacts

- `category_authority/mouse/_control_plane/field_studio_map.json`
- `category_authority/keyboard/_control_plane/field_studio_map.json`
- `category_authority/monitor/_control_plane/field_studio_map.json`
- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/mouse/_generated/field_rules.runtime.json`
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/monitor/_generated/field_rules.json`

## Phase 2: `{ value, unit }` Storage Contract

### Core DB / persistence layer

- `src/db/specDbSchema.js`
- `src/db/specDbMigrations.js`
- `src/db/specDbStatements.js`
- `src/db/specDb.js`
- `src/db/stores/itemStateStore.js`
- `src/db/stores/fieldCandidateStore.js`
- `src/db/stores/componentStore.js`
- `src/db/stores/provenanceStore.js`
- `src/db/seed.js`
- `src/db/seedRegistry.js`

### Publisher write paths and validator contract

- `src/features/publisher/candidate-gate/submitCandidate.js`
- `src/features/publisher/candidateReseed.js`
- `src/features/publisher/validation/checks/checkUnit.js`
- `src/features/publisher/validation/validateField.js`
- `src/features/publisher/validation/validateRecord.js`
- `src/features/publisher/repair-adapter/promptBuilder.js`
- `src/features/publisher/repair-adapter/repairField.js`
- `src/features/publisher/api/publisherRoutes.js`

### Review / UI readers that currently assume value-only state

- `src/features/review/domain/reviewGridData.js`
- `src/features/review/domain/reviewGridHelpers.js`
- `src/features/review/domain/candidateInfrastructure.js`
- `src/features/review/domain/reviewGridStateRuntime.js`
- `src/features/review/domain/componentReviewSpecDb.js`
- `src/features/review/api/fieldReviewHandlers.js`
- `src/features/review/api/componentReviewHandlers.js`
- `src/features/review/services/itemMutationService.js`
- `src/features/review/contracts/reviewFieldContract.js`
- `src/features/review/contracts/componentReviewShapes.js`
- `tools/gui-react/src/features/review/components/ReviewPage.tsx`
- `tools/gui-react/src/features/review/components/ReviewMatrix.tsx`
- `tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx`
- `tools/gui-react/src/pages/component-review/ComponentSubTab.tsx`
- `tools/gui-react/src/pages/publisher/PublisherPage.tsx`
- `tools/gui-react/src/pages/publisher/types.ts`
- `tools/gui-react/src/types/review.ts`
- `tools/gui-react/src/types/review.generated.ts`
- `tools/gui-react/src/types/componentReview.ts`
- `tools/gui-react/src/types/componentReview.generated.ts`
- `tools/gui-react/scripts/generateReviewTypes.js`

### Tests and contract regeneration

- `src/db/tests/fieldCandidateStore.test.js`
- `src/db/tests/provenanceStore.test.js`
- `src/db/tests/seedRegistry.test.js`
- `src/features/publisher/candidate-gate/tests/submitCandidate.test.js`
- `src/features/publisher/tests/candidateReseed.test.js`
- `src/features/publisher/repair-adapter/tests/promptBuilder.test.js`
- `src/features/publisher/repair-adapter/tests/repairField.test.js`
- `src/features/publisher/validation/tests/checkUnit.test.js`
- `src/features/publisher/validation/tests/validateField.test.js`
- `src/features/publisher/validation/tests/validateRecord.test.js`
- `src/features/review/contracts/tests/reviewFieldContract.test.js`
- `src/features/review/contracts/tests/reviewShapeDescriptors.test.js`
- `src/features/review/api/tests/reviewRoutesDataChangeContract.test.js`

## Phase 3: System-Wide Unit Registry

### New / changed implementation files

- `src/field-rules/unitRegistry.js` (new)
- `src/features/publisher/validation/checks/checkUnit.js`
- `src/features/publisher/validation/validateField.js`
- `src/features/publisher/validation/phaseRegistry.js`
- `src/features/publisher/validation/README.md`
- `src/features/publisher/repair-adapter/promptBuilder.js`
- `src/field-rules/consumerGate.js`
- `src/field-rules/consumerBadgeRegistry.js`
- `src/field-rules/capabilities.json`
- `src/ingest/compileFieldRuleBuilder.js`
- `src/ingest/compileValidation.js`
- `src/tests/fieldContractTestRunner.js`
- `src/tests/deriveFailureValues.js`
- `tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx`
- `tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx`

### Tests / generated fallout

- `src/features/publisher/validation/tests/checkUnit.test.js`
- `src/features/publisher/validation/tests/phaseRegistry.test.js`
- `src/features/publisher/validation/tests/validateField.test.js`
- `src/features/publisher/repair-adapter/tests/promptBuilder.test.js`
- `src/field-rules/tests/noDeadConfig.test.js`
- `src/ingest/tests/mouse.compile.field-overrides.test.js`
- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/mouse/_generated/field_rules.runtime.json`
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/monitor/_generated/field_rules.json`

## Files the roadmap already caught, but only partially

- `src/features/publisher/validation/checks/checkUnit.js`
  Phase 1 removes dead knobs, Phase 2 changes return shape, Phase 3 rewrites semantics around the registry.
- `src/features/publisher/validation/validateField.js`
  Phase 1 stops reading dead keys, Phase 2 returns normalized unit, Phase 3 attaches and converts units instead of stripping.
- `src/ingest/compileFieldRuleBuilder.js`
  Phase 1 removes dead emit, Phase 3 stops emitting per-field accepts/conversions entirely.
- `tools/gui-react/src/features/studio/components/key-sections/KeyParseRulesSection.tsx`
  Phase 1 removes it or collapses it; if any unit UI survives, it moves to the contract section only.

## Recommended roadmap correction

If the roadmap is updated, the file-touch list should be split by phase and explicitly include:

- DB schema + statement + store wrappers
- reseed / deleted-DB rebuild files
- review-grid payload contracts and generated TS types
- component-review payload contracts and generated TS types
- publisher GUI routes and page types
- contract-test / repair-test harness files
- generated category artifacts that must be recompiled after compiler changes
