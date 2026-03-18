# Parsing Pipeline Overview (Stages 09-13)

Validated: 2026-03-17. Source of truth: live source code, `../FULL-PIPELINE-START-TO-FINISH.mmd`, and the stage JSON contracts in this folder plus the late-stage orchestration seams under `src/features/indexing/orchestration`.

`planning/` remains the authority for stages 01-05. This folder covers the downstream parsing and completion chain from fetched source artifact to exported run payload.

## Naming Note

The runtime still carries some older variable names such as `phase08FieldContexts`, `phase08PrimeRows`, and `phase08Extraction`. Those names are legacy implementation details. In this folder they are documented as part of stages 09-13.

## Topology

```text
Stage 08 planner/fetch queues
  -> [09] Fetch To Extraction
  -> [10] Extraction To Identity Gating
  -> [11] Identity Gating To Consensus
  -> [12] Consensus To Validation
  -> [13] Validation To Output
```

Stage-specific parsing flow files were consolidated into `../FULL-PIPELINE-START-TO-FINISH.mmd`. Use the per-stage JSON contracts below for boundary-level detail.

## Stage 09 - Fetch To Extraction

Producer: `runSourceExtractionPhase()`
Schemas: `09-fetch-to-extraction-input.json`, `09-fetch-to-extraction-llm-call.json`, `09-fetch-to-extraction-output.json`
What enters:
- Source descriptor, fetch outcome, page HTML, title, screenshot, JSON-LD, embedded state, and network JSON.
- Runtime field rules, deterministic parser, component resolver, optional LLM extraction context, and current aggregate phase state.

What happens:
- Structured payload buckets are flattened and field-mapped.
- DOM tables, article text, manual/PDF content, and structured metadata sidecars are extracted.
- Evidence pack V2 is built with stable snippet hashes and evidence refs.
- Deterministic parser, component resolver, and optional LLM extraction emit field and identity candidates.

What leaves:
- Updated `phase08FieldContexts`, `phase08PrimeRows`, `llmSourcesUsed`, and `llmCandidatesAccepted`.
- Per-source records with `identityCandidates`, `fieldCandidates`, `llmEvidencePack`, `artifact_refs`, `temporalSignals`, and `parserHealth`.

## Stage 10 - Extraction To Identity Gating

Producer: `runSourceIdentityEvaluationPhase()`
Schemas: `10-extraction-to-identity-gating-input.json`, `10-extraction-to-identity-gating-output.json`
What enters:
- Stage 09 candidate rows plus the product identity lock and anchor field set.

What happens:
- Anchor conflicts are evaluated from extracted candidate values.
- Per-source identity scoring checks brand, model, variant, and hard ids.
- Candidates are annotated with `identity_label` and `identity_confidence`.

What leaves:
- `anchorCheck`, `identity`, `identityGatedCandidates`, `anchorStatus`, `manufacturerBrandMismatch`, and `parserHealth`.

## Stage 11 - Identity Gating To Consensus

Producer: `executeConsensusPhase()` / `runConsensusEngine()`
Schemas: `11-identity-gating-to-consensus-input.json`, `11-identity-gating-to-consensus-output.json`
What enters:
- Stage 10 per-source records, field rules, category config, identity lock, and consensus knobs.

What happens:
- Only matched/possible sources without major anchor conflicts enter clustering.
- Candidate values are canonicalized, clustered, and scored by tier/method weights.
- Strict, relaxed, and instrumented acceptance policies determine which field values survive.
- Reducers, pass targets, and list handling refine the result.

What leaves:
- `fields`, `provenance`, `candidates`, `fieldsBelowPassTarget`, `criticalFieldsBelowPassTarget`, `newValuesProposed`, and `agreementScore`.

## Stage 12 - Consensus To Validation

Producer: `runProductFinalizationDerivation()`
Schemas: `12-consensus-to-validation-input.json`, `12-consensus-to-validation-llm-call.json`, `12-consensus-to-validation-output.json`
What enters:
- Stage 11 consensus output, identity gate/report, source results, discovery handoff, learned availability/yield data, and legacy `phase08*` extraction contexts.

What happens:
- Component prior fills known fields from component matches.
- Deterministic critic normalizes, rejects, or marks unknown fields.
- Optional LLM validator reviews uncertain fields.
- Inference, aggressive extraction, runtime gate, and curation operate on remaining weak spots.
- Validation gate, publishability, field reasoning, traffic light, needSet, phase07 prime sources, phase08 extraction summary, and parser metrics are derived.

What leaves:
- Final `normalized`, `provenance`, `summary/gate`-ready metrics, `publishable`, `publishBlockers`, `fieldReasoning`, `trafficLight`, `needSet`, `phase08Extraction`, and `contribution`.

## Stage 13 - Validation To Output

Producer: `runProductCompletionLifecycle()`
Schemas: `13-validation-to-output-input.json`, `13-validation-to-output-output.json`, `13-run-completed-payload.json`, `13-run-result-payload.json`, `13-data-change-events.json`
What enters:
- Stage 12 finalization outputs, learning stores, exporter hooks, resume state, follow-up counts, and run metadata.

What happens:
- Finalization telemetry is emitted.
- `run_completed` payload is built and published.
- Summary artifacts, identity report, source intel, learning gate results, and learning stores are persisted.
- Run artifacts are exported to `runs/` and `latest/`.
- Final artifacts are promoted under `final/` when `shouldPromoteFinal()` allows it.

What leaves:
- `exportInfo`, `finalExport`, `learning`, `learningGateResult`, `categoryBrain`, and the final run result payload returned to callers.
