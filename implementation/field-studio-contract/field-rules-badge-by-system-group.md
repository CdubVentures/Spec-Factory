# Field Rules: IDX/SEED/REV Badge Audit (Full Contract)

Source of truth used: `tools/gui-react/src/pages/studio/workbench/systemMapping.ts` (`FIELD_SYSTEM_MAP`).
Sections are aligned with Studio key-navigator behavior and grouped/ordered to match key section flow.
`Constraint Flag` marks rules where the path is the cross-field constraint container in Studio (`constraints`).

### IDX badge group (36)
- Rules/features that participate in IndexLab (`IDX`). Includes rules with single-badge IDX and shared IDX/SEED/REV combinations.

| Navigator Section | Rule (Field Rule Path) | Controls | Constraint Flag |
| --- | --- | --- | --- |
| Contract | `contract.rounding.decimals` | Controls contract.rounding.decimals | No |
| Contract | `contract.rounding.mode` | Controls contract.rounding.mode | No |
| Contract | `contract.shape` | Controls contract.shape | No |
| Contract | `contract.type` | Controls contract.type | No |
| Contract | `contract.unit` | Controls contract.unit | No |
| Contract | `contract.unknown_token` | Controls contract.unknown_token | No |
| Priority | `ai_assist.max_calls` | Controls ai_assist.max_calls | No |
| Priority | `ai_assist.max_tokens` | Controls ai_assist.max_tokens | No |
| Priority | `ai_assist.mode` | Controls ai_assist.mode | No |
| Priority | `ai_assist.model_strategy` | Controls ai_assist.model_strategy | No |
| Priority | `ai_assist.reasoning_note` | Controls ai_assist.reasoning_note | No |
| Priority | `priority.availability` | Controls priority.availability | No |
| Priority | `priority.block_publish_when_unk` | Controls priority.block_publish_when_unk | No |
| Priority | `priority.difficulty` | Controls priority.difficulty | No |
| Priority | `priority.effort` | Controls priority.effort | No |
| Priority | `priority.publish_gate` | Controls priority.publish_gate | No |
| Priority | `priority.required_level` | Controls priority.required_level | No |
| Parse | `parse.allow_ranges` | Controls parse.allow_ranges | No |
| Parse | `parse.allow_unitless` | Controls parse.allow_unitless | No |
| Parse | `parse.strict_unit_required` | Controls parse.strict_unit_required | No |
| Parse | `parse.template` | Controls parse.template | No |
| Parse | `parse.unit` | Controls parse.unit | No |
| Parse | `parse.unit_accepts` | Controls parse.unit_accepts | No |
| Enum | `enum.policy` | Controls enum.policy | No |
| Enum | `enum.source` | Controls enum.source | No |
| Components | `component.type` | Controls component.type | No |
| Constraints | `constraints` | Controls constraints | Yes |
| Evidence | `evidence.conflict_policy` | Controls evidence.conflict_policy | No |
| Evidence | `evidence.min_evidence_refs` | Controls evidence.min_evidence_refs | No |
| Evidence | `evidence.required` | Controls evidence.required | No |
| Evidence | `evidence.tier_preference` | Controls evidence.tier_preference | No |
| UI Display | `aliases` | Controls aliases | No |
| UI Display | `ui.tooltip_md` | Controls ui.tooltip_md | No |
| Search Hints | `search_hints.domain_hints` | Controls search_hints.domain_hints | No |
| Search Hints | `search_hints.preferred_content_types` | Controls search_hints.preferred_content_types | No |
| Search Hints | `search_hints.query_terms` | Controls search_hints.query_terms | No |

### SEED badge group (13)
- Rules/features that participate in Seed Pipeline (`SEED`). Includes rules shared with IDX/REV only via combined controls.

| Navigator Section | Rule (Field Rule Path) | Controls | Constraint Flag |
| --- | --- | --- | --- |
| Contract | `contract.shape` | Controls contract.shape | No |
| Contract | `contract.type` | Controls contract.type | No |
| Priority | `ai_assist.mode` | Controls ai_assist.mode | No |
| Priority | `priority.availability` | Controls priority.availability | No |
| Priority | `priority.difficulty` | Controls priority.difficulty | No |
| Priority | `priority.effort` | Controls priority.effort | No |
| Priority | `priority.required_level` | Controls priority.required_level | No |
| Enum | `enum.policy` | Controls enum.policy | No |
| Enum | `enum.source` | Controls enum.source | No |
| Components | `component.type` | Controls component.type | No |
| Evidence | `evidence.min_evidence_refs` | Controls evidence.min_evidence_refs | No |
| Evidence | `evidence.required` | Controls evidence.required | No |
| UI Display | `aliases` | Controls aliases | No |

### REV badge group (36)
- Rules/features that participate in LLM Review (`REV`). Includes rules shared with IDX/SEED only via combined controls.

| Navigator Section | Rule (Field Rule Path) | Controls | Constraint Flag |
| --- | --- | --- | --- |
| Contract | `contract.shape` | Controls contract.shape | No |
| Contract | `contract.type` | Controls contract.type | No |
| Contract | `contract.unit` | Controls contract.unit | No |
| Priority | `ai_assist.max_calls` | Controls ai_assist.max_calls | No |
| Priority | `ai_assist.max_tokens` | Controls ai_assist.max_tokens | No |
| Priority | `ai_assist.mode` | Controls ai_assist.mode | No |
| Priority | `ai_assist.model_strategy` | Controls ai_assist.model_strategy | No |
| Priority | `ai_assist.reasoning_note` | Controls ai_assist.reasoning_note | No |
| Priority | `priority.availability` | Controls priority.availability | No |
| Priority | `priority.block_publish_when_unk` | Controls priority.block_publish_when_unk | No |
| Priority | `priority.difficulty` | Controls priority.difficulty | No |
| Priority | `priority.effort` | Controls priority.effort | No |
| Priority | `priority.publish_gate` | Controls priority.publish_gate | No |
| Priority | `priority.required_level` | Controls priority.required_level | No |
| Parse | `parse.template` | Controls parse.template | No |
| Parse | `parse.unit` | Controls parse.unit | No |
| Parse | `parse.unit_accepts` | Controls parse.unit_accepts | No |
| Enum | `enum.additional_values` | Controls enum.additional_values | No |
| Enum | `enum.match.format_hint` | Controls enum.match.format_hint | No |
| Enum | `enum.match.fuzzy_threshold` | Controls enum.match.fuzzy_threshold | No |
| Enum | `enum.match.strategy` | Controls enum.match.strategy | No |
| Enum | `enum.policy` | Controls enum.policy | No |
| Enum | `enum.source` | Controls enum.source | No |
| Components | `component.match.auto_accept_score` | Controls component.match.auto_accept_score | No |
| Components | `component.match.flag_review_score` | Controls component.match.flag_review_score | No |
| Components | `component.match.fuzzy_threshold` | Controls component.match.fuzzy_threshold | No |
| Components | `component.match.name_weight` | Controls component.match.name_weight | No |
| Components | `component.match.property_weight` | Controls component.match.property_weight | No |
| Components | `component.type` | Controls component.type | No |
| Constraints | `constraints` | Controls constraints | Yes |
| Evidence | `evidence.conflict_policy` | Controls evidence.conflict_policy | No |
| Evidence | `evidence.min_evidence_refs` | Controls evidence.min_evidence_refs | No |
| Evidence | `evidence.required` | Controls evidence.required | No |
| Evidence | `evidence.tier_preference` | Controls evidence.tier_preference | No |
| UI Display | `aliases` | Controls aliases | No |
| UI Display | `ui.tooltip_md` | Controls ui.tooltip_md | No |

## Overlap summary
- IDX+SEED+REV: 13
- IDX+SEED only: 0
- IDX+REV only: 14
- SEED+REV only: 0

## Total controls by section (all systems, by navigator section)
- Contract: 6
- Priority: 11
- Parse: 6
- Enum: 6
- Components: 6
- Constraints: 1
- Evidence: 4
- UI Display: 2
- Search Hints: 3
- Other: 0
