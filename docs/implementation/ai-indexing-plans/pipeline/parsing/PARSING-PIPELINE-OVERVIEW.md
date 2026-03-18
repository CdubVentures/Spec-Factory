# Parsing Pipeline Overview (Stages 09-13)

Validated: 2026-03-18. Source of truth: live code under `src/features/indexing/orchestration/execution/**`, `src/features/indexing/orchestration/finalize/**`, and the stage JSON contracts in this folder.

`planning/` remains the authority for stages 01-07. This folder covers the downstream chain from fetched source artifact to exported run payload.

## Naming Note

The runtime still carries a few legacy variable names:

- `phase08FieldContexts`
- `phase08PrimeRows`
- `phase08Extraction`

Those names are implementation details only. In this folder they are documented as part of stages 09-13.

## Topology

```text
Stage 08 fetch entry
  -> [09] Fetch To Extraction
  -> [10] Extraction To Identity Gating
  -> [11] Identity Gating To Consensus
  -> [12] Consensus To Validation
  -> [13] Validation To Output
```

## Stage 09 - Fetch To Extraction

Producer: `runSourceExtractionPhase()`
Schemas: `09-fetch-to-extraction-input.json`, `09-fetch-to-extraction-llm-call.json`, `09-fetch-to-extraction-output.json`

What enters:

- source descriptor, page HTML, title, status, screenshots, JSON-LD, embedded state, network responses, and fetch metadata
- deterministic extractor, adapter manager, optional LLM extraction context, anchors, field rules, and runtime overrides
- planner/runtime state such as host-budget context, `phase08FieldContexts`, `phase08PrimeRows`, `llmSourcesUsed`, and `llmCandidatesAccepted`

What happens:

- planner discovery callbacks inspect fetched manufacturer pages, robots, and sitemaps
- endpoint mining can enqueue additional manufacturer followup URLs
- deterministic extraction runs across DOM, structured metadata, adapters, and optional deterministic-parser/component-resolver passes
- Evidence Pack V2 is built when the source is eligible
- optional LLM extraction fills remaining non-locked, non-anchor target fields
- per-source field candidates are enriched with evidence refs before source identity evaluation runs

What leaves:

- updated `phase08FieldContexts` and `phase08PrimeRows`
- updated `llmSourcesUsed` and `llmCandidatesAccepted`
- per-source artifacts, evidence-pack metadata, temporal signals, endpoint signals, and candidate rows consumed by later execution phases

## Stage 10 - Extraction To Identity Gating

Producer: `runSourceIdentityEvaluationPhase()`
Schemas: `10-extraction-to-identity-gating-input.json`, `10-extraction-to-identity-gating-output.json`

What enters:

- merged identity candidates
- merged field candidates with evidence refs
- anchor set, job identity lock, category config, and endpoint-intel summary

What happens:

- anchor conflicts are derived from the candidate field map
- source identity scoring compares brand, model, variant, and hard IDs to the identity lock
- field candidates are annotated with identity labels/confidence before consensus sees them
- parser health is computed from candidates, identity quality, anchors, and endpoint signals

What leaves:

- `anchorCheck`
- `identity`
- `identityGatedCandidates`
- `anchorStatus`
- `manufacturerBrandMismatch`
- `parserHealth`

## Stage 11 - Identity Gating To Consensus

Producer: `executeConsensusPhase()` / `runConsensusEngine()`
Schemas: `11-identity-gating-to-consensus-input.json`, `11-identity-gating-to-consensus-output.json`

What enters:

- source results with source-level identity labels
- category config, field order, anchors, identity lock, and consensus config

What happens:

- only matched/possible sources without major anchor conflicts survive
- candidate values are canonicalized, clustered, and scored by tier and extraction method
- strict acceptance, relaxed acceptance, and instrumented-field rules determine which values become product truth
- provenance and candidate audit rows are assembled for every field

What leaves:

- `fields`
- `provenance`
- `candidates`
- `fieldsBelowPassTarget`
- `criticalFieldsBelowPassTarget`
- `newValuesProposed`
- `agreementScore`

## Stage 12 - Consensus To Validation

Producer: `runProductFinalizationDerivation()`
Schemas: `12-consensus-to-validation-input.json`, `12-consensus-to-validation-llm-call.json`, `12-consensus-to-validation-output.json`

What enters:

- consensus output plus source results, discovery result, learned availability/yield, and legacy `phase08*` context
- runtime field-rules engine, adapter artifacts, source intel, identity lock, and LLM runtime context

What happens:

- dedicated synthetic/supportive sources are ingested before the final derivation path runs
- identity consensus and identity normalization derive `identity`, `normalized`, `provenance`, and `candidates`
- component prior, deterministic critic, optional LLM validator, inference policy, aggressive extraction, and runtime gate run in sequence
- validation gate, publishability, field reasoning, traffic light, hypothesis queue, refreshed NeedSet, prime-source summary, phase08 extraction summary, and parser metrics are derived

What leaves:

- `normalized`
- `provenance`
- `criticDecisions`
- `llmValidatorDecisions`
- `runtimeGateResult`
- `gate`, `publishable`, `publishBlockers`
- `fieldReasoning`, `trafficLight`, `needSet`
- `phase07PrimeSources`, `phase08Extraction`
- `parserHealthRows`, `parserHealthAverage`, `contribution`

## Stage 13 - Validation To Output

Producer: `runProductCompletionLifecycle()`
Schemas: `13-validation-to-output-input.json`, `13-validation-to-output-output.json`, `13-run-completed-payload.json`, `13-run-result-payload.json`, `13-data-change-events.json`

What enters:

- stage 12 finalization outputs plus learning stores, exporter hooks, artifact roots, summary state, and telemetry context

What happens:

- analysis artifacts are resolved and persisted
- indexing schema packets are built and validated during `runIndexingSchemaArtifactsPhase()`
- finalization telemetry and `run_completed` events are emitted
- summary markdown/TSV and identity report artifacts are built and persisted
- source intel and learning stores are finalized
- terminal export lifecycle writes run artifacts, latest snapshot, and promoted final outputs when eligible

What leaves:

- `exportInfo`
- `finalExport`
- `learning`
- `learningGateResult`
- `categoryBrain`
- the final run-result payload returned to callers
