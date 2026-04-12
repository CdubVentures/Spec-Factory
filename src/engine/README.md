## Purpose
Field validation, normalization, and rule enforcement engine. Validates individual field values against type/range/enum/evidence rules, normalizes candidate data for consensus, resolves component references, and audits evidence provenance.

## Public API (The Contract)
- `fieldRulesEngine.js`: `createFieldRulesEngine(fieldRules, options)` — factory returning engine instance with `.normalizeFullRecord()`, `.normalizeCandidate()`, `.validateField()`.
- `ruleAccessors.js`: pure accessors — `ruleRequiredLevel()`, `ruleAvailability()`, `ruleDifficulty()`, `ruleEffort()`, `ruleType()`, `ruleShape()`, `ruleUnit()`.
- `runtimeGate.js`: `applyRuntimeFieldRules()` — runtime validation gate for publish decisions.
- `normalizationFunctions.js`: `parseBoolean()`, `parseDate()`, `parseList()`, `parseNumberAndUnit()`, `convertUnit()`, `canonicalUnitToken()`.
- `engineTextHelpers.js`: `normalizeToken()`, `normalizeFieldKey()`, `isUnknownToken()`, `safeJsonParse()`, `canonicalizeWhitespace()`.
- `engineComponentResolver.js`: `resolveComponentRef()`, `simpleSimilarity()`.
- `engineCrossValidator.js`: `crossValidate()`, `evaluateInCondition()`.
- `engineFieldValidators.js`: `validateRange()`, `validateShapeAndUnits()`, `enforceEnumPolicy()`.
- `engineEvidenceAuditor.js`: `auditEvidence()`.
- `engineEnumIndex.js`: `buildEnumIndex()`, `buildUiGroupIndex()`, `buildRuleEnumSpec()`.
- `compoundBoundary.js`: `computeCompoundRange()`, `evaluateCompoundRange()`.

## Dependencies
- Allowed: `src/field-rules/` (rule loading, consumer gates, migrations), `src/shared/`, `src/utils/` (transitional).
- Forbidden: `src/features/`, `src/app/api/`, `src/db/`, `src/pipeline/`.

## Domain Invariants
- Field rules are loaded once and treated as immutable during a validation session.
- Normalization is deterministic: same input always produces same output.
- Unknown values are flagged, never silently accepted.
- Evidence audit requires `snippet_id`, `source_id`, and `quote` — missing any is a violation.
- Enum policies are `closed` (reject unknown) or `open` (accept with curation flag). No other modes.
- Component resolution uses tiered scoring: auto_accept (0.95), flag_review (0.65). Below flag_review triggers new_component path.
