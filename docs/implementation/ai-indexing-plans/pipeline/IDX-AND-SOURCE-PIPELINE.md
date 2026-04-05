# 06-IDX-AND-SOURCE-PIPELINE.md - IDX And Source Pipeline Reference

Date: 2026-03-17

> **Purpose:** Preserve the rollout-era IDX/source audit while separating historical observations from the current code-proven seams.
> **Current authority:** [../../../04-features/indexing-lab.md](../../../04-features/indexing-lab.md), [../../../04-features/category-authority.md](../../../04-features/category-authority.md), [../../../04-features/pipeline-and-runtime-settings.md](../../../04-features/pipeline-and-runtime-settings.md)

This file remains in the preserved `docs/implementation/ai-indexing-plans/` subtree. It should not be treated as the live runtime source of truth.

## 2026-03-17 Audit Corrections

- The old follow-up link `docs/category-source-authority-guide.md` was broken. The current maintained category/source authority doc is [../../../04-features/category-authority.md](../../../04-features/category-authority.md).
- The earlier source inventory counts in this file were stale. Current `sources.json` counts are `keyboard=23`, `monitor=23`, `mouse=22`.
- The host plan concept (`effectiveHostPlan`, `hostPlanQueryRows`, `buildEffectiveHostPlan`, `domainHintResolver`, `queryHostPlanScorer`) has been entirely deleted as of 2026-03-23. All historical references to host plan assembly in this file are obsolete.
- `priority.block_publish_when_unk` remains live in publish-time behavior through `src/publish/publishingPipeline.js`.
- Runtime Ops still derives IDX runtime badges from `src/features/indexing/runtime/idxRuntimeMetadata.js`.
- LLM dashboard rows intentionally omit `input_summary` and `output_summary`, but runtime-ops worker/detail payloads still carry those fields. The old wording should not be read as a repo-wide telemetry removal.

## Current Code-Verified Flow

| Concern | Current code paths | What is verified today |
|---------|--------------------|------------------------|
| field-rule gating | `src/field-rules/consumerGate.js`, `src/features/indexing/orchestration/shared/indexlabRuntimeFieldRules.js`, `src/pipeline/runProduct.js` | field rules are projected for the `indexlab` consumer before runtime execution |
| file-backed source authority | `category_authority/<category>/sources.json`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/orchestration/shared/runProductOrchestrationHelpers.js` | `sources.json` is the live category source-strategy SSOT and source entries are loaded from it |
| category host metadata | `src/categories/loader.js` | `loadCategoryConfig()` still builds `sourceHosts`, `sourceHostMap`, and `validatedRegistry` |
| discovery pipeline | `src/features/indexing/discovery/searchDiscovery.js`, `src/features/indexing/discovery/sourceRegistry.js`, `src/features/indexing/search/queryBuilder.js` | the discovery path builds deterministic search profiles with tier-tagged query rows |
| runtime bridge artifact propagation | `src/indexlab/runtimeBridge.js`, `src/features/indexing/api/builders/runtimeOpsPreFetchBuilders.js` | search-profile artifacts propagated into runtime-ops surfaces |
| runtime badge generation | `src/features/indexing/api/runtimeOpsRoutes.js`, `src/features/indexing/runtime/idxRuntimeMetadata.js` | runtime surfaces still expose IDX usage badges by surface and worker pool |
| publish-time field blockers | `src/publish/publishingPipeline.js` | `priority.block_publish_when_unk` still blocks publication when configured fields remain unknown |

## Current Source Inventory Snapshot

| Category | Detailed rows | Enabled rows | `search_first` | `manual` |
|----------|---------------|--------------|----------------|----------|
| `keyboard` | `23` | `23` | `19` | `4` |
| `monitor` | `23` | `23` | `22` | `1` |
| `mouse` | `22` | `22` | `21` | `1` |

Representative high-value hosts still present in current source authority:

- `keyboard`: `rtings.com`, `techpowerup.com`, `lttlabs.com`, `switchesdb.com`, `keeb-finder.com`, `techgearlab.com`
- `monitor`: `rtings.com`, `tftcentral.co.uk`, `pcmonitors.info`, `displaydb.com`, `displayhdr.org`, `flatpanelshd.com`, `notebookcheck.net`
- `mouse`: `rtings.com`, `techpowerup.com`, `eloshapes.com`, `mousespecs.org`, `sensor.fyi`, `lttlabs.com`, `igorslab.de`, `techgearlab.com`

## Current IDX Consumption Seams

| IDX area | Current verified surfaces |
|----------|---------------------------|
| search-profile hints | `aliases`, `search_hints.query_terms`, `search_hints.domain_hints`, `search_hints.preferred_content_types`, `ui.tooltip_md` |
| need/prioritization | `priority.required_level`, `evidence.min_evidence_refs` |
| extraction/validation | `contract.*`, `priority.availability`, `priority.difficulty`, `priority.effort`, `ai_assist.*`, `parse.template`, `enum.*`, `evidence.*`, `constraints`, `component.type` |
| publish-only gate | `priority.block_publish_when_unk` |

These surfaces are documented directly in `src/features/indexing/runtime/idxRuntimeMetadata.js` and enforced or exercised by the current runtime builders and publish pipeline.

## Historical Material In The Old 2026-03-10 Snapshot

The following should now be read as historical observations only:

- Specific live run IDs and output counts from 2026-03-10
- Claims that `effective_host_plan` was still the wrong current-state default path
- Source inventory totals larger than the current `sources.json` files
- Any wording that described this file as the current runtime truth instead of a preserved reference

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/field-rules/consumerGate.js` | `indexlab` consumer gating still exists |
| source | `src/features/indexing/orchestration/shared/indexlabRuntimeFieldRules.js` | runtime field-rule projection still exists |
| source | `src/features/indexing/sources/sourceFileService.js` | source file I/O and `DISCOVERY_DEFAULTS` |
| source | `src/categories/loader.js` | category config still builds `sourceHostMap` and `validatedRegistry` |
| source | `src/features/indexing/discovery/searchDiscovery.js` | discovery path and deterministic search profile generation |
| source | `src/features/indexing/runtime/idxRuntimeMetadata.js` | current runtime IDX badge surface definitions |
| source | `src/publish/publishingPipeline.js` | `block_publish_when_unk` publish-time behavior |

## Related Documents

- [../../../04-features/indexing-lab.md](../../../04-features/indexing-lab.md) - current end-to-end indexing run flow.
- [../../../04-features/category-authority.md](../../../04-features/category-authority.md) - current authority snapshot and artifact-root ownership.
- [../../../05-operations/spec_factory_knobs_maintenance.md](../../../05-operations/spec_factory_knobs_maintenance.md) - current maintained settings/source-strategy maintenance snapshot.
