# AI Indexing Plans Reference

Related: [Implementation Reference](../README.md) | [IndexLab](../../features/indexing-lab.md) | [Search And Discovery](../../features/search-and-discovery.md) | [Pipeline And LLM Settings](../../features/pipeline-and-llm-settings.md)

This preserved subtree contains rollout packets, per-phase reports, and planning artifacts for the indexing pipeline.

It is not the authoritative current-state runtime hierarchy. Use the active docs under `docs/architecture`, `docs/data`, `docs/frontend`, `docs/features`, `docs/operations`, and `docs/integrations` for current behavior.

## Two-Phase Architecture

The system operates in two distinct phases:

**Phase A — Collection Pipeline (current focus).** The 13-stage pipeline (stages 1–13) is exclusively about high-value data collection: searching, fetching, parsing, extracting, and storing per-source evidence. Every stage exists to maximize the volume and quality of extracted data stored per product. No stage makes judgment calls about which field value is "correct" — that is not the pipeline's job.

**Phase B — Review Phase (separate, implemented later).** A standalone review process executes independently after collection completes. It compares all collected per-source data against one another, identifies the correct value for each field, resolves conflicts, and decides whether another collection loop is needed. This phase is not part of the 13-stage pipeline and will be implemented after the collection pipeline is complete.

All documentation in this subtree should be read with this boundary in mind. References to "consensus," "comparison matrix," "publish," and "validation" in the Master Rollout Plan describe the review phase, not the collection pipeline.

## Preserved Entry Points

- [Product Goal](./00-PRODUCT-GOAL.md)
- [System Status](./01-SYSTEM-STATUS.md)
- [Master Rollout](./02-MASTER-ROLLOUT.md)
- [Testing Protocol](./03-TESTING-PROTOCOL.md)
- [Runtime And GUI](./04-RUNTIME-AND-GUI.md)
- [Operations And Defaults](./05-OPERATIONS-AND-DEFAULTS.md)
- [IDX And Source Pipeline](./06-IDX-AND-SOURCE-PIPELINE.md)
- [Knobs Maintenance](./spec_factory_knobs_maintenance.md)

## Preserved Phase Packets

- [Phase 4 Combined Rewrite](./Phase 4/Phase 4 Combined Rewrite.md)
- [Phase 4A Index Infrastructure](./Phase 4/Old Phase 4/Phase-4A-Index-Infrastructure.md)
- [Phase 4B Cross-Run Analytics](./Phase 4/Old Phase 4/Phase-4B-Cross-Run-Analytics.md)
- [Phase 4C Compound Dashboard Copy](./Phase 4/Old Phase 4/Phase-4C-Compound-Dashboard - Copy.md)
- [Phase 4D Index Consumption And Compound Wiring](./Phase 4/Old Phase 4/Phase 4D — Index Consumption and Compound Wiring.md)
- [Community Consensus Change Spec](./Phase 6/community-consensus-change-spec.md)
- [Testing Phase 06B Community Consensus](./Phase 6/TESTING-PHASE-06B-community-consensus.md)

## Preserved Pipeline Packets

- [Pipeline Archive Master Report](./pipeline/archive/01-MASTER-REPORT.md)
- Stage 1:
  [NeedSet Flow Correction Prompt](./pipeline/1 - start-to-needset/%23 NeedSet Flow Correction — All-in-One Execution Prompt.md),
  [Start To NeedSet Report](./pipeline/1 - start-to-needset/01-START-TO-NEEDSET-REPORT.md),
  [Start To NeedSet Knobs](./pipeline/1 - start-to-needset/03-START-TO-NEEDSET-KNOBS.md),
  [Start To NeedSet Schema](./pipeline/1 - start-to-needset/04-START-TO-NEEDSET-SCHEMA.md)
- Stage 2:
  [NeedSet Brand To Profile Report](./pipeline/2 - needset-brand-to-profile/01-NEEDSET-BRAND-TO-PROFILE-REPORT.md),
  [NeedSet Brand To Profile Knobs](./pipeline/2 - needset-brand-to-profile/03-NEEDSET-BRAND-TO-PROFILE-KNOBS.md)
- Stage 3:
  [Profile To Planner Report](./pipeline/3 - profile-to-planner/01-PROFILE-TO-PLANNER-REPORT.md),
  [Profile To Planner Knobs](./pipeline/3 - profile-to-planner/03-PROFILE-TO-PLANNER-KNOBS.md)
- Stage 4:
  [Query Journey Report](./pipeline/4 - search-planner-to-query-journey/01-QUERY-JOURNEY-REPORT.md),
  [Query Journey Knobs](./pipeline/4 - search-planner-to-query-journey/03-QUERY-JOURNEY-KNOBS.md)
- Stage 5:
  [Query To Results Report](./pipeline/5 - query-to-results/01-QUERY-TO-RESULTS-REPORT.md),
  [Query To Results Knobs](./pipeline/5 - query-to-results/03-QUERY-TO-RESULTS-KNOBS.md)
- Stage 6:
  [Search Results To SERP Triage Report](./pipeline/6 - search-results-to-serp-triage/01-SEARCH-RESULTS-TO-SERP-TRIAGE-REPORT.md),
  [Search Results To SERP Triage Knobs](./pipeline/6 - search-results-to-serp-triage/03-SEARCH-RESULTS-TO-SERP-TRIAGE-KNOBS.md)
- Stage 7:
  [SERP Triage To Domain Classifier Report](./pipeline/7 - serp-triage-to-domain-classifier/01-SERP-TRIAGE-TO-DOMAIN-CLASSIFIER-REPORT.md),
  [SERP Triage To Domain Classifier Knobs](./pipeline/7 - serp-triage-to-domain-classifier/03-SERP-TRIAGE-TO-DOMAIN-CLASSIFIER-KNOBS.md)
- Stage 8:
  [Domain Classifier To Fetch Parse Report](./pipeline/8 - domain-classifier-to-fetch-parse/01-DOMAIN-CLASSIFIER-TO-FETCH-PARSE-REPORT.md),
  [Domain Classifier To Fetch Parse Knobs](./pipeline/8 - domain-classifier-to-fetch-parse/03-DOMAIN-CLASSIFIER-TO-FETCH-PARSE-KNOBS.md)
- Stage 9:
  [Fetch To Extraction Report](./pipeline/9 - fetch-to-extraction/01-FETCH-TO-EXTRACTION-REPORT.md)
- Stage 10:
  [Extraction To Identity Gating Report](./pipeline/10 - extraction-to-identity-gating/01-EXTRACTION-TO-IDENTITY-GATING-REPORT.md)
- Stage 11:
  [Identity Gating To Consensus Report](./pipeline/11 - identity-gating-to-consensus/01-IDENTITY-GATING-TO-CONSENSUS-REPORT.md)
- Stage 12:
  [Consensus To Validation Report](./pipeline/12 - consensus-to-validation/01-CONSENSUS-TO-VALIDATION-REPORT.md)
- Stage 13:
  [Validation To Output Report](./pipeline/13 - validation-to-output/01-VALIDATION-TO-OUTPUT-REPORT.md)

## Guardrails

- These files can describe planned, partial, or historical states.
- Preserve them as reference only; active docs and live source files win when they disagree.
- Navigation repairs in this subtree are limited to keeping the preserved packet set readable.

## Validated Against

- [`docs/implementation/README.md`](../README.md)
- [`docs/implementation/ai-indexing-plans/00-PRODUCT-GOAL.md`](./00-PRODUCT-GOAL.md)
- [`docs/implementation/ai-indexing-plans/06-IDX-AND-SOURCE-PIPELINE.md`](./06-IDX-AND-SOURCE-PIPELINE.md)
- [`docs/implementation/ai-indexing-plans/pipeline/archive/01-MASTER-REPORT.md`](./pipeline/archive/01-MASTER-REPORT.md)
- [`src/cli/spec.js`](../../../src/cli/spec.js)
- [`src/features/indexing/api/indexlabRoutes.js`](../../../src/features/indexing/api/indexlabRoutes.js)
