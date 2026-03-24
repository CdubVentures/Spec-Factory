# Component Impact Cascade Test Audit

Scope: `src/features/review/domain/tests/componentImpactCascade.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `findProductsReferencingComponent includes linked and unlinked field-state matches` | KEEP | Protects the lookup contract that drives downstream cascades. | `componentImpact.referenceLookup.test.js` | Preserved |
| `cascadeComponentChange authoritative updates all linked items and marks queue stale via SpecDb` | KEEP | Core authoritative propagation contract. | `componentImpact.authoritativeCascade.test.js` | Preserved |
| `cascadeComponentChange authoritative updates linked items only (not unlinked value matches)` | KEEP | Guards against over-propagating to lookalike values. | `componentImpact.authoritativeCascade.test.js` | Preserved |
| `evaluateConstraintsForLinkedProducts uses maker-specific component values for violations` | KEEP | Protects maker-specific constraint evaluation. | `componentImpact.authoritativeCascade.test.js` | Preserved |
| `cascadeEnumChange honors preAffectedProductIds for rename cascades` | KEEP | Protects enum rename propagation to precomputed affected products. | `componentImpact.enumCascade.test.js` | Preserved |
| `item enum field writes stay ID-linked via item_list_links and list deletes clear links` | RETIRE | Weaker helper-level duplicate of the stronger rename/delete-by-id link-preservation contract, with overlapping `syncItemListLinkForFieldValue` coverage also present in enum payload tests. | None | Deleted |
| `cascadeComponentChange override_allowed does not push values and does not evaluate variance` | COLLAPSE | Real contract, but shares setup and outcome with the priority-only case. | `componentImpact.overrideAllowedCascade.test.js` | Preserved with merged assertions |
| `cascadeComponentChange override_allowed uses priority 3 (lowest)` | COLLAPSE | Same behavior family as the broader override-allowed stale-only contract. | `componentImpact.overrideAllowedCascade.test.js` | Merged into broader contract |
| `cascadeComponentChange override_allowed with constraints still evaluates constraints` | KEEP | Distinct constraint-evaluation contract under override-allowed mode. | `componentImpact.overrideAllowedCascade.test.js` | Preserved |
| `enum list value ID helpers rename and delete through slot identifiers` | KEEP | Stronger runtime-facing link-preservation contract than the value-delete helper test. | `componentImpact.enumCascade.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted component-impact tests | `node --test src/features/review/domain/tests/componentImpact.referenceLookup.test.js src/features/review/domain/tests/componentImpact.authoritativeCascade.test.js src/features/review/domain/tests/componentImpact.overrideAllowedCascade.test.js src/features/review/domain/tests/componentImpact.enumCascade.test.js` -> pass |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` -> pass |
| Full suite | `npm test` passed |
