# Parsing Quality And Outputs

Validated: 2026-03-18. This file summarizes the live quality gates and terminal outputs for stages 10-13.

## Identity Scoring (Stage 10)

Per-source identity evaluation in `src/features/indexing/validation/identityGate.js` still uses the same core weights, but the live gate now layers more explicit conflict handling around them.

Base weights:

1. brand match: +0.35
2. model match: +0.35
3. variant match: +0.15
4. hard-ID match: +0.15

Important live rules:

- hard-ID matches force the source into the strongest confirmation band when there is no hard-ID mismatch
- hard-ID mismatch, negative-token hits, or critical conflicts force rejection behavior
- model numeric-range failures and missing required digit groups can lower score and add critical conflicts
- only `matched` and `possible` sources without major anchor conflicts enter consensus

## Consensus Scoring (Stage 11)

Consensus still works on canonicalized candidate clusters per field.

Current default tier weights:

- tier 1: `1.0`
- tier 2: `0.8`
- tier 3: `0.45`
- other: `0.4`

Representative method weights from `src/scoring/consensusEngine.js`:

- `network_json`: `1.0`
- `adapter_api`: `0.95`
- `pdf_table`: `0.95`
- `pdf_kv`: `0.93`
- `html_table`: `0.9`
- `json_ld`: `0.9`
- `embedded_state`: `0.85`
- `pdf`: `0.82`
- `dom`: `0.4`
- `llm_extract`: tier-aware, lowest by default unless config raises it

Acceptance modes:

- strict acceptance: enough approved domains plus weighted-majority dominance
- relaxed acceptance: allowed for non-instrumented fields when manufacturer plus one additional credible domain corroborate the winner
- instrumented-field acceptance: strict acceptance plus an instrumented-domain threshold

Pass targets:

- identity/pass-exempt fields: `0`
- normal fields: `2`
- commonly wrong fields: `4` by default, configurable through consensus pass-target settings

## Validation Gate (Stage 12)

`evaluateValidationGate()` still checks these six conditions:

1. `identity_gate_ok`
2. `identity_confidence_ok`
3. `anchor_conflicts_ok`
4. `required_completeness_ok`
5. `confidence_ok`
6. `critical_fields_ok`

Failure reasons emitted by the live gate:

- `MODEL_AMBIGUITY_ALERT`
- `HAS_ANCHOR_CONFLICTS`
- `BELOW_REQUIRED_COMPLETENESS`
- `BELOW_CONFIDENCE_THRESHOLD`
- `CRITICAL_FIELDS_BELOW_PASS_TARGET`

`publishable` remains stricter than `validated`. Finalization also requires:

- full identity satisfaction (`identityFull`)
- identity confidence above the publish threshold
- no identity-gate review requirement

## Deterministic Critic, Runtime Gate, And Unknown Reasons

The finalization stack is now:

1. component prior
2. deterministic critic
3. optional LLM validator
4. inference policy
5. aggressive extraction
6. runtime gate and curation

The unknown-reason priority is derived in `src/features/indexing/orchestration/shared/reasoningHelpers.js` and currently resolves in this order:

1. `identity_ambiguous`
2. `budget_exhausted`
3. `conflicting_sources_unresolved`
4. `blocked_by_robots_or_tos`
5. `parse_failure`
6. `not_publicly_disclosed`
7. `not_found_after_search`

## Promotion Rules (Stage 13)

`shouldPromoteFinal()` in `src/exporter/finalExporter.js` uses this cascade:

1. candidate must be publishable
2. if no existing final summary exists, promote
3. if the existing final summary is not publishable, a publishable candidate wins
4. otherwise compare completeness, then confidence, then contradiction count, then timestamp

## Completion Telemetry (Stage 13)

`buildRunCompletedPayload()` now reports more than raw export status. The live payload includes:

- validation and coverage summary
- LLM cost/usage counters
- helper/component-prior fill counts
- phase08 extraction quality rates
- traffic-light counts
- resume persistence counts
- hypothesis followup counts
- aggressive-extraction status
- contradiction count and total duration

## Export Layers (Stage 13)

The completion lifecycle currently writes four durable layers:

1. run artifacts via `exportRunArtifacts()` under `runs/{runId}/...`
2. latest snapshot via `exportRunArtifacts()` under `latest/...`
3. promoted final artifacts via `writeFinalOutputs()` under `final/{category}/{brand}/{model}[/{variant}]`
4. final history rows via `history/runs.jsonl` and `evidence/sources.jsonl`

Related terminal outputs:

- `logs/events.jsonl.gz`
- `logs/summary.json`
- summary markdown and TSV artifacts
- identity report artifacts
- indexing schema packets plus AJV validation summary
