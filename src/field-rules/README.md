## Purpose
Field rule compilation, loading, session caching, and consumer gating. Compiles raw field rule definitions from category authority into validated, versioned artifacts consumed by the engine, extraction, and review systems.

## Public API (The Contract)
- `compiler.js`: `compileRules(category, options)`, `validateRules(category)`, `compileRulesAll()` — compile field rules from source YAML/JSON into validated artifacts.
- `loader.js`: `loadFieldRules(category, options)`, `getFieldRule(rules, field)`, `getKnownValues(rules, field)`, `lookupComponent(rules, type)`, `getParseTemplate(rules, field)`, `getCrossValidationRules(rules)` — load and query compiled field rules.
- `consumerGate.js`: `projectFieldRulesForConsumer(rules, consumer, options)`, `resolveConsumerGate(rule, consumer)`, `isConsumerEnabled(rule, consumer)` — filter field rules by consumer context (extraction, review, publish).
- `sessionCache.js`: `createSessionCache()`, `invalidateFieldRulesCache()`, `clearFieldRulesCache()` — LRU session cache for compiled rules.
- `migrations.js`: `applyKeyMigrations(rules, plan)`, `buildMigrationPlan(rules)`, `migrationDocToKeyMap(doc)` — field key migration and renaming.
- `compilerArtifactBuilders.js`: `buildParseTemplates()`, `extractRangeRule()`, `buildCrossValidationRules()`, `buildFieldGroups()` — artifact construction helpers.
- `compilerSchemaValidation.js`: `normalizeFieldRulesForPhase1()`, `deriveCoreFields()`, `deriveEvidenceTierMinimum()` — schema normalization for pipeline phase 1.
- `compilerCategoryInit.js`: `initCategory()`, `discoverCompileCategories()`, `listFields()`, `fieldReport()` — category discovery and initialization.
- `compilerFileOps.js`: `stableStringify()`, `writeJsonStable()`, `hashFileWithMeta()`, `sha256Buffer()` — deterministic file I/O and hashing.
- `compilerPrimitives.js`: `normalizePatterns()`, `auditFieldMetadata()` — low-level compilation primitives.
- `consumerBadgeRegistry.js`: `CONSUMER_BADGE_REGISTRY`, `FIELD_PARENT_MAP`, `FIELD_CONSUMER_MAP`, `IDX_FIELD_PATHS`, `BADGE_FIELD_PATHS`, `PARENT_GROUPS`, `NAVIGATION_MAP`, `buildExtractor(entry)` — unified SSOT for all consumer badge definitions. One entry per field rule path, declaring which runtime sub-consumers (e.g. `idx.needset`, `eng.validate`, `rev.flag`) read it. GUI badges, tooltips, and system maps all derive from this single registry. Adding a badge = one entry here, zero other files.
- `fieldRuleSchema.js`: `FIELD_RULE_SCHEMA`, `FIELD_RULE_KINDS` — central registry of authorable field-rule knobs, labels, kinds, options, applicability, and author-facing documentation.

## Dependencies
- Allowed: `src/ingest/` (categoryCompile for authority path resolution), `src/shared/`.
- External: `ajv` (schema validation), `semver` (version comparison).
- Forbidden: `src/features/`, `src/app/api/`, `src/engine/` (engine depends on field-rules, not the reverse).

## Domain Invariants
- Compiled rules are versioned with content hashes. Re-compilation is idempotent for the same input.
- Consumer gating is strictly subtractive: a consumer can never see rules not in the base set.
- Field keys are canonical after migration. No aliases survive past the migration step.
- Session cache invalidation clears all cached rules for a category. Partial invalidation is not supported.
- Cross-validation rules reference field keys that must exist in the same rule set.
