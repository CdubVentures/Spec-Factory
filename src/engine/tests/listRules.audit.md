# listRules.test.js Audit

Scope: `src/engine/tests/listRules.test.js`

Policy:
- Preserve public list-rule behavior at the two real boundaries: candidate normalization dedupe and runtime-gate ordering/limit enforcement.
- Collapse repeated fixture-backed micro-cases into stronger table-driven contracts with one harness boot per file.
- Retire assertions that only restate generic empty-value normalization instead of a distinct list-rule contract.

## Candidate Dedupe Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `list_rules dedupe: removes case-insensitive string duplicates, preserves first casing` | COLLAPSE | Same string-dedupe family as the whitespace-normalized duplicate case. | `src/engine/tests/listRulesDedupeContracts.test.js` | Merged into string dedupe contract |
| `list_rules dedupe: whitespace-normalized comparison` | COLLAPSE | Same string-dedupe family as the case-insensitive duplicate case. | `src/engine/tests/listRulesDedupeContracts.test.js` | Merged into string dedupe contract |
| `list_rules dedupe: number list removes exact duplicates` | KEEP | Distinct numeric dedupe contract because numbers use a different dedupe key path than strings. | `src/engine/tests/listRulesDedupeContracts.test.js` | Preserved |
| `list_rules dedupe: disabled when dedupe=false - preserves duplicates` | KEEP | Distinct opt-out boundary for explicit `dedupe: false`. | `src/engine/tests/listRulesDedupeContracts.test.js` | Preserved |
| `list_rules dedupe: empty list after dedupe stays empty` | RETIRE | It only proves generic `empty_value` rejection in `normalizeCandidate`, not list-rule behavior. | None | Deleted |

## Ordering and Limit Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `list_rules sort: asc sorts strings case-insensitively` | COLLAPSE | Same ordering family as the numeric-desc and no-sort cases. | `src/engine/tests/listRulesOrderingContracts.test.js` | Merged into ordering contract |
| `list_rules sort: desc sorts numbers descending` | COLLAPSE | Same ordering family as the string-asc and no-sort cases. | `src/engine/tests/listRulesOrderingContracts.test.js` | Merged into ordering contract |
| `list_rules sort: none preserves original order` | COLLAPSE | Same ordering family as the asc and desc sort cases. | `src/engine/tests/listRulesOrderingContracts.test.js` | Merged into ordering contract |
| `list_rules max_items: truncates list and records change` | KEEP | Distinct runtime contract for deterministic truncation plus emitted `changes` metadata. | `src/engine/tests/listRulesLimitContracts.test.js` | Preserved |
| `list_rules min_items: violation sets field to unk with failure` | COLLAPSE | Same min-items family as the exact-boundary and post-dedupe failure cases. | `src/engine/tests/listRulesLimitContracts.test.js` | Merged into table-driven min-items contract |
| `list_rules min_items: exactly min_items passes` | COLLAPSE | Same min-items family as the violation and post-dedupe failure cases. | `src/engine/tests/listRulesLimitContracts.test.js` | Merged into table-driven min-items contract |
| `list_rules min_items: after dedupe - duplicates collapse below minimum` | COLLAPSE | Same min-items family as the direct violation and exact-boundary cases. | `src/engine/tests/listRulesLimitContracts.test.js` | Merged into table-driven min-items contract |

## Boundary and Sequencing Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `list_rules combined: dedupe + sort + truncate in full pipeline` | KEEP | Distinct sequencing contract that proves dedupe happens before sort and max-item truncation. | `src/engine/tests/listRulesBoundaryContracts.test.js` | Preserved |
| `list_rules: scalar field is unaffected by list_rules logic` | COLLAPSE | Same opt-in boundary family as the no-list-rules contract. | `src/engine/tests/listRulesBoundaryContracts.test.js` | Merged into opt-in boundary contract |
| `list_rules: no list_rules in contract -> no enforcement applied` | COLLAPSE | Same opt-in boundary family as the scalar bypass contract. | `src/engine/tests/listRulesBoundaryContracts.test.js` | Merged into opt-in boundary contract |

## Proof

- Targeted replacement tests: `node --test src/engine/tests/listRules*.test.js`
- Surrounding engine tests: `node --test src/engine/tests/*.test.js`
- Full suite: `npm test`
