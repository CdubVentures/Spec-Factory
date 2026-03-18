# Parsing Quality And Outputs

Validated: 2026-03-17. This file is the late-stage companion to `parsing/PARSING-PIPELINE-OVERVIEW.md`, `planning/PREFETCH-PIPELINE-OVERVIEW.md`, and the stage 12/13 contract JSON files in this folder.

## Identity Scoring (Stage 10)

Per-source identity evaluation uses a five-band score:

1. Brand: +0.35
2. Model: +0.35
3. Variant: +0.15
4. Hard ids: +0.15
5. Penalties: negative tokens and critical conflicts can force rejection

Hard id matches can force `CONFIRMED`. Hard id mismatches, negative tokens, or critical conflicts force `REJECTED`. Sources are later labeled:

- `matched`: identity match passed
- `possible`: score >= 0.4 without critical conflicts
- `different`: conflicts or low score
- `unknown`: missing identity evidence

Only `matched` and `possible` sources without major anchor conflicts may enter consensus.

## Consensus Scoring (Stage 11)

Consensus works on canonicalized candidate clusters per field.

Tier weights:
- `1`: `1.0`
- `2`: `0.8`
- `3`: `0.45`

Representative method weights:
- `network_json`: `1.0`
- `adapter_api`: `0.95`
- `pdf_table`: `0.95`
- `html_table` and `json_ld`: `0.9`
- `embedded_state`: `0.85`
- `dom`: `0.4`
- `llm_extract`: tier-dependent, lowest by default

Acceptance modes:
- Strict: enough approved domains and weighted majority
- Relaxed: manufacturer plus another credible source for eligible fields
- Instrumented: strict plus instrumented-domain threshold

Pass targets:
- Seed/identity-exempt fields: `0`
- Normal fields: `2`
- Commonly wrong fields: `4`

## Validation Gate (Stage 12)

The late-stage gate checks six conditions:

1. `identity_gate_ok`
2. `identity_confidence_ok`
3. `anchor_conflicts_ok`
4. `required_completeness_ok`
5. `confidence_ok`
6. `critical_fields_ok`

Failure reasons emitted by `evaluateValidationGate()`:

- `MODEL_AMBIGUITY_ALERT`
- `HAS_ANCHOR_CONFLICTS`
- `BELOW_REQUIRED_COMPLETENESS`
- `BELOW_CONFIDENCE_THRESHOLD`
- `CRITICAL_FIELDS_BELOW_PASS_TARGET`

`publishable` is stricter than `validated`. It also depends on full identity requirements and the publish threshold used by finalization.

## Deterministic Critic And Unknown Reasons

The critic normalizes booleans, numeric units, enums, aliases, and some cross-field constraints. It can:

- accept and normalize a value
- reject a value as out of range or structurally invalid
- mark the field unknown with a reason

Unknown reasons are assigned in priority order:

1. `identity_ambiguous`
2. `budget_exhausted`
3. `conflicting_sources_unresolved`
4. `blocked_by_robots_or_tos`
5. `parse_failure`
6. `not_publicly_disclosed`
7. `not_found_after_search`

## Promotion Rules (Stage 13)

`shouldPromoteFinal()` uses this cascade:

1. Candidate must be publishable
2. If no existing final summary exists, promote
3. If existing final summary is not publishable, a publishable candidate wins
4. Otherwise compare completeness, confidence, contradiction count, then timestamp

## Learning Outputs (Stage 13)

The learning gate only considers non-`unk` fields. Accepted rows write to:

- `urlMemory`
- `domainFieldYield`
- `fieldAnchors`
- `componentLexicon`

Each accepted update carries:

- `field`
- `value`
- `evidenceRefs`
- `acceptanceStats`
- `sourceRunId`

## Export Layers (Stage 13)

Three durable layers are written:

1. `runs/{runId}/`
2. `latest/`
3. `final/{category}/{brand}/{model}[/{variant}]`

Late-stage history and diagnostics are also appended to:

- `history/runs.jsonl`
- `evidence/sources.jsonl`
- `events.jsonl.gz`
- `summary.json`
