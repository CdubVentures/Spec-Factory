# contractDriven.test.js Audit

Scope: `src/db/tests/contractDriven.test.js`

Policy:
- Preserve real contract boundaries between authored mouse contract metadata, seeded SpecDb materialization, and review payload consumers.
- Collapse repeated scenario-wide plumbing checks into a smaller set of artifact and review contracts.
- Retire synthetic fixture-shape checks that only pin row counts, magic values, or deliberate test-data variety instead of runtime behavior.

Grouping note:
- Section 2 generated repeated subtests per scenario. Repeated families are classified by family where the original file used the same assertion shape across many scenario names.

## Section 0 — Contract Analysis Smoke

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `CA-01 — field count > 0` | RETIRE | Pure smoke count; later contract tests already consume field definitions directly. | None | Deleted |
| `CA-02 — scenario defs cover key categories` | RETIRE | Category-presence smoke does not protect runtime behavior once scenario contracts are exercised directly. | None | Deleted |
| `CA-03 — component types exist with properties` | RETIRE | Existence-only smoke is subsumed by component property and matrix coverage contracts. | None | Deleted |
| `CA-04 — known value catalogs exist` | RETIRE | Existence-only smoke is subsumed by enum payload and mapping contracts. | None | Deleted |
| `CA-05 — matrices have rows` | RETIRE | Count-only matrix smoke is weaker than direct field assignment coverage checks. | None | Deleted |

## Section 0B — Field Rules Contract

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `FRC-01 — every component property key has a matching field definition` | KEEP | Real authored-contract integrity boundary between component DB mappings and field rules. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Preserved |
| `FRC-02 — every component property mapping has field_key set` | KEEP | Real mapping contract for generated and workbook component sources. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Preserved |
| `FRC-03 — sensor_date has string type (not integer)` | RETIRE | One-off field characterization with no broader contract value in this pass. | None | Deleted |
| `FRC-04 — all component property fields have variance_policy` | COLLAPSE | Same metadata-shape family as constraints-array presence. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Merged into component metadata contract |
| `FRC-05 — all component property fields have constraints array` | COLLAPSE | Same metadata-shape family as variance-policy presence. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Merged into component metadata contract |
| `FRC-06 — seeded component_values variance_policy matches field rules definition` | KEEP | Real seed-to-DB persistence contract for variance evaluation. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `FRC-07 — encoder_steps field has closed enum policy with known values` | RETIRE | One-off catalog characterization; enum review behavior remains covered elsewhere. | None | Deleted |

## Section 1 — Seed & DB Verification

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `SEED-01 — all core + source/key-review tables have non-zero counts` | RETIRE | Broad non-zero table counts are weaker than the preserved one-to-one row contracts. | None | Deleted |
| `SEED-02 — component_identity has >=6 items per type and no exact duplicate name+maker rows` | RETIRE | Minimum row counts are fixture-shape assertions, not runtime contracts. | None | Deleted |
| `SEED-02b — maker-capable component types include A/B/makerless lanes with >=2 linked products each` | RETIRE | Synthetic lane-shape characterization for generated fixtures only. | None | Deleted |
| `SEED-02c — each component type has 1-3 non-discovered items` | RETIRE | Pure generated-fixture count contract with no runtime protection. | None | Deleted |
| `SEED-02d — discovered identity rows have >=1 linked products` | RETIRE | Generated fixture density check, not a runtime boundary. | None | Deleted |
| `SEED-03 — component_aliases findable by canonical name + aliases` | KEEP | Real alias-resolution contract used by downstream review flows. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `SEED-04 — component_values stores variance_policy` | COLLAPSE | Same variance persistence family as the exact field-rules-to-DB match contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into variance persistence contract |
| `SEED-05 — item_field_state needs_ai_review reflects confidence threshold` | KEEP | Real review-lane state contract for low-confidence seeded values. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `SEED-06 — item_component_links created for exact-match products` | RETIRE | Scenario-specific fixture characterization; component review payload contracts preserve the observable outcome. | None | Deleted |
| `SEED-07 — candidates have evidence fields` | COLLAPSE | Same evidence materialization family as `source_evidence_refs` and candidate metadata presence. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into evidence materialization contract |
| `SEED-08 — all scenario products seeded` | RETIRE | Scenario-count bookkeeping is fixture plumbing, not product behavior. | None | Deleted |
| `SEED-09 — shared components: multiple products link to same items` | RETIRE | Weak existence check that does not prove a concrete review contract. | None | Deleted |

## Section 2 — Per-Scenario Behavioral Verification

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `SCENARIO * — has fields` | RETIRE | Repeated smoke family across 21 scenarios with no contract specificity. | None | Deleted |
| `happy_path: >50% fields populated, coverage >50%` | KEEP | Guards the high-signal happy-path artifact contract. | `src/db/tests/contractDrivenScenarioArtifacts.test.js` | Preserved |
| `new_*: alien component name` | RETIRE | Pure synthetic fixture-name characterization. | None | Deleted |
| `similar_*: near-match name present` | RETIRE | Pure synthetic fixture-shape characterization. | None | Deleted |
| `new_enum_values: fabricated values for open_prefer_known` | RETIRE | Open-prefer-known reviewability is preserved at the enum payload layer instead of the raw fixture layer. | None | Deleted |
| `closed_enum_reject: invalid_{catalog}_value present` | RETIRE | Magic-value fixture characterization rather than a runtime boundary. | None | Deleted |
| `range_violations: values exceed max` | RETIRE | Optional scenario branch not present in the live mouse contract. | None | Deleted |
| `cross_validation: crafted rule violations` | RETIRE | Magic-value fixture characterization with no additional runtime signal. | None | Deleted |
| `component_constraints: constraint overrides applied` | RETIRE | Fixture-shape characterization preserved better by matrix assignment contracts. | None | Deleted |
| `variance_policies: uses seeded component refs` | RETIRE | Seeded-reference characterization is weaker than the preserved component review variance contracts. | None | Deleted |
| `min_evidence_refs: exactly 1 source` | KEEP | Real artifact contract that drives the downstream evidence flag. | `src/db/tests/contractDrivenScenarioArtifacts.test.js` | Preserved |
| `tier_preference_override: tier fields resolved` | KEEP | Real artifact contract for tier-override scenario output. | `src/db/tests/contractDrivenScenarioArtifacts.test.js` | Preserved |
| `preserve_all_candidates: different values per source` | RETIRE | Synthetic source-count characterization; downstream conflict flag contract remains covered. | None | Deleted |
| `missing_required: ≤2 sources, many missing fields` | KEEP | Real artifact contract for missing-required review behavior. | `src/db/tests/contractDrivenScenarioArtifacts.test.js` | Preserved |
| `multi_source_consensus: 4 sources with disagreements` | RETIRE | Synthetic source-count characterization rather than a runtime boundary. | None | Deleted |
| `list_fields_dedup: overlapping values across sources` | RETIRE | Synthetic source-shape characterization. | None | Deleted |
| `buildValidationChecks produces checks` | COLLAPSE | Same validation-output family repeated for every scenario. | `src/db/tests/contractDrivenScenarioArtifacts.test.js` | Merged into a single table-driven all-scenarios contract |

## Section 3 — Product Grid Review

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `GRID — happy_path` | RETIRE | Broad grid payload smoke is weaker than preserved flag and metrics contracts. | None | Deleted |
| `GRID — missing_required` | RETIRE | Broad grid payload smoke is weaker than preserved flag and metrics contracts. | None | Deleted |
| `GRID — variance_policies` | RETIRE | Broad grid payload smoke is weaker than preserved component-review contracts. | None | Deleted |
| `GRID — min_evidence_refs` | RETIRE | Broad grid payload smoke is weaker than preserved evidence-flag contracts. | None | Deleted |

## Section 4 — Component Review

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `COMP — ${type}: seeded row count / first row existence / property existence` | RETIRE | Generated row counts and first-row shape are fixture-only characterization. | None | Deleted |
| `COMP — ${type}: property_columns present when propKeys exist` | COLLAPSE | Same component review payload family as discovered-row and variance-violation behavior. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into component review payload contract |
| `COMP — ${type}: candidate_count === candidates.length loops` | RETIRE | Plumbing-only duplication with no additional contract value. | None | Deleted |
| `COMP — ${type}: pipeline-discovered rows surface new_component` | KEEP | Real component review contract for discovered identities. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `COMP — ${type}: variance_violation appears on property slots` | KEEP | Real component review flag contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |

## Section 5 — Enum Review

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `ENUM-01 — returns catalogs from contract` | COLLAPSE | Same enum payload shape family as value structure checks. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into enum payload contract |
| `ENUM-02 — values present with correct structure` | COLLAPSE | Same enum payload shape family as contract catalog presence. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into enum payload contract |
| `ENUM-03 — pipeline-suggested values have needs_review=true` | KEEP | Real enum review contract for pipeline-proposed values. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |

## Section 6 — Coverage Matrix Verification

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `MATRIX-01 — happy_path covers majority of fields` | RETIRE | Duplicate of the preserved happy-path artifact contract. | None | Deleted |
| `MATRIX-02 — every component type has new_* scenario` | RETIRE | Scenario-inventory bookkeeping, not runtime behavior. | None | Deleted |
| `MATRIX-03 — cross-validation rules have test coverage` | RETIRE | Scenario-existence smoke is weaker than direct matrix-field assignment checks. | None | Deleted |
| `MATRIX-04 — variance policies have test coverage` | RETIRE | Scenario-existence smoke is weaker than direct matrix-field assignment checks. | None | Deleted |
| `MATRIX-05 — all scenarios have at least 1 source result` | RETIRE | Count-only fixture health check. | None | Deleted |
| `MATRIX-06 — cross_validation assigned to ALL contract trigger/related fields` | KEEP | Real matrix coverage contract for rule-driven fields. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Preserved |
| `MATRIX-07 — component_constraints assigned to ALL contract constraint fields` | KEEP | Real matrix coverage contract for constrained component properties. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Preserved |
| `MATRIX-08 — variance_policies assigned to ALL non-authoritative contract variance fields` | KEEP | Real matrix coverage contract for variance-governed properties. | `src/db/tests/contractDrivenAnalysisContracts.test.js` | Preserved |
| `MATRIX-09 — multi_source_consensus assigned from field properties, not hardcoded` | RETIRE | Implementation-coupled heuristic count test. | None | Deleted |
| `MATRIX-10 — candidate scores have deterministic variation beyond 3 fixed values` | RETIRE | Pure synthetic-score diversity characterization. | None | Deleted |
| `MATRIX-11 — multi_source_consensus sources arrive in non-tier-sorted order` | RETIRE | Synthetic fixture-order characterization. | None | Deleted |
| `MATRIX-12 — at least one component type has > 6 rows` | RETIRE | Fixture row-count characterization only. | None | Deleted |
| `MATRIX-13 — not all component types have the same row count` | RETIRE | Fixture variety characterization only. | None | Deleted |
| `MATRIX-14 — every field has useCasesCovered = YES` | RETIRE | Broad derived-metadata sweep without direct runtime boundary. | None | Deleted |
| `MATRIX-15 — expandable details have correct I/O for happy_path` | RETIRE | UI-characterization detail test with no standalone contract value in this pass. | None | Deleted |
| `MATRIX-16 — flag scenarios show correct symbols` | RETIRE | Symbol-level matrix characterization is weaker than preserved payload flag contracts. | None | Deleted |
| `MATRIX-17 — seed-changed scenarios show SEED symbol` | RETIRE | Symbol-level matrix characterization for synthetic scenarios only. | None | Deleted |
| `MATRIX-18 — component checkbox coverage complete` | RETIRE | Broad derived-coverage metadata sweep. | None | Deleted |

## Section 7 — Source & Key Review Schema

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `SKR-01 — source_registry has rows` | RETIRE | Non-zero row smoke is weaker than preserved evidence and key-review row-count contracts. | None | Deleted |
| `SKR-02 — source_assertions has rows` | COLLAPSE | Same source materialization family as evidence rows and key-review one-to-one counts. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into materialization contract |
| `SKR-03 — source_evidence_refs has rows for candidates with quotes` | COLLAPSE | Same evidence materialization family as candidate evidence-field checks. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into materialization contract |
| `SKR-04 — grid_key rows exist for each item_field_state row` | KEEP | Real one-to-one key-review backfill contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `SKR-05 — enum_key rows exist for each list_values row` | KEEP | Real one-to-one enum review backfill contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `SKR-06 — component_key rows exist for each component_values row` | KEEP | Real one-to-one component review backfill contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `SKR-07 — key_review_state has correct two-lane status mapping` | KEEP | Real two-lane review state contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `SKR-08 — key_review_audit has backfill entries from candidate_reviews` | RETIRE | Conditional audit-count smoke without a strong observable contract. | None | Deleted |

## Section 8 — Flag Cleanup

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `FLAG-01 — happy_path metrics.flags is 0` | COLLAPSE | Same metrics-count family as `metrics.flags counts only real flags`. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Merged into metrics contract |
| `FLAG-02 — min_evidence_refs product has below_min_evidence flag` | KEEP | Real evidence-gating flag contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `FLAG-03 — preserve_all_candidates product has conflict_policy_hold flag` | KEEP | Real multi-candidate hold contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `FLAG-04 — metrics.flags counts only real flags` | KEEP | Real user-visible metrics contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `FLAG-05 — cross_validation product has constraint_conflict flag` | KEEP | Real cross-validation flag contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |
| `FLAG-06 — cross_validation product has dependency_missing flag` | KEEP | Real dependency-rule flag contract. | `src/db/tests/contractDrivenSeedReviewContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/db/tests/contractDrivenAnalysisContracts.test.js src/db/tests/contractDrivenScenarioArtifacts.test.js src/db/tests/contractDrivenSeedReviewContracts.test.js`
- Surrounding DB tests: `node --test src/db/tests/*.test.js`
- Full suite: `npm test`
