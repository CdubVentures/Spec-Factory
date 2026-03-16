# 06-IDX-AND-SOURCE-PIPELINE.md - How IDX Keys and Category Sources Drive IndexLab

Date: 2026-03-10

**Scope:** This document covers the **Collection Pipeline** — the 13-stage system that searches, fetches, parses, extracts, and stores per-source evidence. The pipeline's job is high-value data collection and storage only. Comparison, consensus, and publishing are handled by a separate Review Phase (implemented later).

**Purpose:** Explain the current runtime truth for IDX field-rule keys, `category_authority/*/sources.json`, native source entries, and the runtime surfaces that consume them.

**Authoring follow-up:** For category setup and maintenance rules, see `docs/category-source-authority-guide.md`.

**Evidence base:**
- Code audit across `src/`, `tools/gui-react/src/`, and relevant tests
- Inline IDX audit captured in this document
- `category_authority/keyboard/sources.json`
- `category_authority/monitor/sources.json`
- `category_authority/mouse/sources.json`
- Fully enabled live run `20260310044939-8f6e22` on 2026-03-10 for `mouse-razer-viper-v3-pro`

---

## Current Truth

- `sources.json` is the active category-level source authority file. There is no active singular `source.json` in this repo.
- Live discovery steering currently runs through `readSourcesFile()` -> `listSourceEntries()` -> `loadEnabledSourceEntries()` -> `resolveEnabledSourceEntries()`.
- Category authority also feeds `loadCategoryConfig()`, which builds `sourceHosts` and `sourceHostMap` for planner and fetch metadata.
- IDX field rules are projected into runtime with `projectFieldRulesForConsumer(..., 'indexlab')` before NeedSet, query building, extraction, validation, and Runtime Ops badge generation.
- `ENABLE_SOURCE_REGISTRY`, `ENABLE_DOMAIN_HINT_RESOLVER_V2`, `ENABLE_QUERY_COMPILER`, and `ENABLE_CORE_DEEP_GATES` default to `true` in code as of 2026-03-09.
- SourceRegistry / DomainHintResolver v2 code exists, loads, and is tested, but the main live discovery path still does not reliably emit a non-null `search_profile.effective_host_plan`. In the latest fully enabled live run (`20260310044939-8f6e22`), `effective_host_plan` was still `null`.
- The latest fully enabled live run emits final output artifacts (`spec.json`, `summary.json`, `traffic_light.json`, `provenance.json`, and evidence). The live gap is not "no artifacts"; it is source volume — identity needs more diverse sources to clear the publish gate.
- **Stage 1 identity gate refactor is COMPLETE (2026-03-10).** Identity is now advisory (labels + consensus weighting) and only blocks publishing, not extraction. The publish gate correctly blocks 15 identity/critical/required fields when `publishable=false`.
- **Feature-first vertical slice reorganization is COMPLETE (2026-03-10).** All backend modules reorganized from flat `src/` layout to 9 feature-scoped domains under `src/features/`. All code paths in this document have been verified against the new structure.
- **LLM dashboard simplification is COMPLETE (2026-03-10).** Dead `input_summary`/`output_summary` fields removed from dashboard call row contract. Shared model helpers support Claude, Gemini, DeepSeek, GPT. `escalation_planner` call type added.

---

## Latest Live Proof (2026-03-10)

Fully enabled live run:
- Run ID: `20260310215243-723af6`
- Product: `mouse-razer-viper-v3-pro` (Razer Viper V3 Pro)
- Settings: `searchProvider=google`, `llmEnabled=true`, `discoveryEnabled=true`
- Exit code: `0`
- Duration: ~5 minutes

Observed live results:
- `3` pages fetched
- Identity: `unlocked` (confidence 0.6, max match score 0.75)
- NeedSet: `80` fields in deficit, `15` blocked by publish gate
- `search_profile.effective_host_plan = null`
- Final `summary.json`: `publishable=false`
- Final `identity_report.status = IDENTITY_FAILED`
- Final `spec.json`: all `81` fields as `unk`
- Publish blockers: `model_ambiguity_alert`, `below_required_completeness`, `missing_manufacturer_confirmation`, `missing_additional_credible_sources`, `certainty_below_publish_threshold`

What this proves:
- Category sources and IDX runtime metadata are live inputs to real runs
- The main pipeline completes and emits final artifacts end to end
- Identity gate correctly applies advisory labels and blocks publishing (not extraction)
- NeedSet correctly computes `publish_gate_block` for 15 identity/critical/required fields
- Both NeedSet panels display the new field-coverage story with no stale identity-gate UI

What this does not prove:
- Publishable status on this product (needs more diverse sources)
- A live non-null v2 host plan
- High field fill rate (blocked by insufficient source diversity, not gate logic)

---

## End-to-End Pipeline

| Stage | Inputs | Main code paths | What happens today |
|---|---|---|---|
| Authoring | Field Studio field rules, `category_authority/<category>/sources.json` | `src/field-rules/consumerGate.js`, `src/features/indexing/sources/sourceFileService.js` | Authoring data is stored as category field rules plus category source authority. |
| Runtime field-rule projection | Full authoring category config | `src/features/indexing/orchestration/shared/indexlabRuntimeFieldRules.js`, `src/pipeline/runProduct.js` | `projectFieldRulesForConsumer(..., 'indexlab')` removes IDX-disabled paths before runtime starts. |
| Search Profile build | Projected category config | `src/features/indexing/search/queryBuilder.js` | Search-profile fields consume projected `search_hints.query_terms`, `search_hints.domain_hints`, `search_hints.preferred_content_types`, `aliases`, and `ui.tooltip_md`. |
| Source strategy load | `sources.json` | `src/features/indexing/orchestration/shared/runProductOrchestrationHelpers.js` | Enabled source entries are loaded directly from `sources.json` with nested `discovery`, `crawl_config`, and `field_coverage` sections intact. |
| Discovery planning | Search profile plus source entries | `src/features/indexing/discovery/searchDiscovery.js` | Current discovery normalizes nested source-entry `discovery` defaults. URL prediction only uses entries whose `discovery.method` is `search_first`; `manual` remains authority-only inventory, and `llm_predict` is retired/not valid. |
| Category authority host map | `approved` plus `sources.*` | `src/categories/loader.js` | Builds `sourceHosts` and `sourceHostMap`, then attaches host metadata such as tier, display name, crawl config, and field coverage. |
| Planning and fetch | `sourceHostMap` queue metadata | `src/planner/sourcePlanner.js`, `src/fetcher/playwrightFetcher.js` | Tier and host metadata affect queue rows. `crawl_config.rate_limit_ms` is actively used as per-host pacing fallback. |
| Runtime Ops and GUI | Search profile artifact plus projected field rules | `src/features/indexing/api/runtimeOpsRoutes.js`, `src/features/indexing/runtime/idxRuntimeMetadata.js`, `tools/gui-react/src/features/runtime-ops/` | Runtime Ops badges honestly report which IDX keys were projected into Search Profile, NeedSet, and Fetch Worker surfaces. |
| V2 registry / host-plan seam | Registry-loaded category config | `src/features/indexing/discovery/sourceRegistry.js`, `src/features/indexing/discovery/domainHintResolver.js`, `src/indexlab/runtimeBridge.js` | Registry loading is real, but the latest fully enabled live run still carried `effective_host_plan: null`, so v2 host-plan steering is not yet the primary live control plane. |

## Upgrade-Derived Target Flow Still Being Pulled Into The Live Path

| Flow seam | Target contract from the upgrade docs | Current status in this audit |
|---|---|---|
| Token normalization | `public-suffix-aware` parsing should classify host, tier, content intent, and unresolved tokens before planning | Covered in targeted proof, but the latest live artifact still did not prove a non-null `EffectiveHostPlan` |
| Plan assembly | `EffectiveHostPlan` should carry host groups, explain rows, unresolved tokens, `connector_only`, `blocked_in_search`, and `HostHealth` state | Code/tests exist, but the latest real run still wrote `effective_host_plan = null` |
| Query scoring | NeedSet coverage, field affinity, diversity, `HostHealth`, and operator risk should score the compiled query set | Partially present in code and test docs, not yet fully proven as the dominant live steering path |
| Compounding telemetry | `QueryIndex`, `URLIndex`, and `PromptIndex` should capture yield and reuse signals across runs | Still a rollout/instrumentation seam, not the primary live control loop in this audit |
| Evidence hardening | `evidence quote anchoring` should carry content hash plus span/selector/context window | Current output requires evidence, but full upgrade-grade anchoring is still a planned hardening step |
| Bounded expansion | `community ingestion` should be connector-first and claims-only; `local helper AI` should stay advisory-only and schema-bounded | Still future/parallel work, not default-on runtime behavior in the audited run |

---

## `sources.json` Key-by-Key Usage

| Key | Current role | Status | Current runtime use |
|---|---|---|---|
| `category` | Metadata | Metadata-only | Identifies the category file; not a steering knob by itself. |
| `version` | Metadata | Metadata-only | Version stamp only. |
| `approved` | Approved host inventory | Active | `loadCategoryConfig()` flattens approved hosts into `sourceHosts` and `sourceHostMap`. |
| `denylist` | Policy metadata | Metadata-only | Present in file shape; not a primary live discovery control in the current path. |
| `sources` | Detailed source registry | Active | Supplies the detailed host entries used by loader, planner, fetcher, and source-strategy flattening. |
| `sources.*.display_name` | UI and queue metadata | Live metadata | Propagates to planner queue rows and runtime surfaces. |
| `sources.*.base_url` | Host identity | Active | Used to derive hostnames and join detailed entries to approved-host policy. |
| `sources.*.tier` | Tier policy | Active | Planner uses tier metadata to classify and prioritize source roles. |
| `sources.*.authority` | Authority labeling | Partial | Loaded and validated, but not clearly used in the main live scoring path. |
| `sources.*.content_types` | Content intent metadata | Partial | Stored and available, but no strong live decision path was found in the current pipeline. |
| `sources.*.doc_kinds` | Document-kind metadata | Partial | Stored and available, but no strong live decision path was found in the current pipeline. |
| `sources.*.field_coverage` | Coverage metadata | Partial | Propagated through host metadata; not clearly consumed in live planning/scoring. |
| `sources.*.crawl_config.method` | Fetch metadata | Live metadata | Available on host metadata and evidence surfaces. |
| `sources.*.crawl_config.rate_limit_ms` | Per-host pacing | Active | `playwrightFetcher` uses this as the per-host delay fallback. |
| `sources.*.crawl_config.timeout_ms` | Fetch metadata | Live metadata | Preserved in host metadata; secondary compared with global fetch config. |
| `sources.*.crawl_config.robots_txt_compliant` | Robots policy override | Active | Fetcher checks this when deciding robots behavior. |
| `sources.*.discovery.enabled` | Discovery inclusion | Active | Disabled rows are dropped before discovery. |
| `sources.*.discovery.method` | Discovery behavior | Active / partial | `search_first` feeds the real-search URL predictor; `manual` stays in authority inventory but is not used by URL predictor; `llm_predict` is retired and must not be documented as a valid option. |
| `sources.*.discovery.source_type` | Source-role hint | Active | Passed into discovery runtime and URL predictor context from nested source entries. |
| `sources.*.discovery.priority` | Row ordering | Active | `listSourceEntries()` sorts by this value before entries enter discovery. |
| `sources.*.discovery.search_pattern` | Search/prediction hint | Active | Carried into discovery runtime and URL predictor input from nested source entries. |
| `sources.*.discovery.notes` | Authoring note | Metadata-only | Informational only. |

---

## Category Source Inventory

| Category | Detailed entries | Enabled entries | `search_first` | `manual` | Current notes |
|---|---|---|---|---|---|
| `keyboard` | 34 | 34 | 30 | 4 | Source set now includes lab depth (`techgearlab.com`), switch databases (`switchesdb.com`, `deskthority.net`), keyboard aggregators (`keeb-finder.com`, `hlplanet.com`, `prosettings.net`), plus manufacturer and retailer baselines. No synthetic drift. |
| `monitor` | 33 | 33 | 32 | 1 | Source set now includes additional labs (`flatpanelshd.com`, `notebookcheck.net`) and databases (`displayhdr.org`, `lcdtech.info`, `prosettings.net`). No synthetic drift. |
| `mouse` | 31 | 31 | 30 | 1 | Source set is depth-first: `rtings.com`, `eloshapes.com`, `techpowerup.com`, `mousespecs.org`, `sensor.fyi`, `lttlabs.com` lead, now with `igorslab.de` (LDAT latency), `techgearlab.com` (click force), `thegamingsetup.com` (dimensions+sensors). No synthetic drift. |

### Mouse Depth-First Source Mix

The mouse category now follows the actual field-hint demand in `category_authority/mouse/_control_plane/field_rules.full.json` and `category_authority/mouse/_generated/field_rules.json`:

- Baseline specs: manufacturer hosts (`razer.com`, `logitechg.com`, `steelseries.com`, `corsair.com`, `gloriousgaming.com`, `pulsar.gg`, `endgamegear.com`, `zowie.benq.com`, `vaxee.co`)
- Deep measurements and review evidence: `rtings.com`, `techpowerup.com`, `lttlabs.com`, `tomshardware.com`
- Shape / component / specialist spec databases: `eloshapes.com`, `mousespecs.org`, `sensor.fyi`, `prosettings.net`, `mousecompare.com`
- Commerce fallback for price / SKU / colors / availability: `bestbuy.com`, `amazon.com`, `newegg.com`, `bhphotovideo.com`, `microcenter.com`

### Mouse High-Value Sources

| Source ID | Host | Tier | Authority | Discovery priority | Why it is kept high |
|---|---|---|---|---|---|
| `rtings_com` | `rtings.com` | `tier2_lab` | `instrumented` | `98` | Primary source for `click_latency`, `sensor_latency`, and ergonomics-heavy evidence. |
| `eloshapes_com` | `eloshapes.com` | `tier5_aggregator` | `aggregator` | `96` | Primary shape and dimension database for `shape`, `lngth`, `width`, `height`, `weight`, `hump`. |
| `techpowerup_com` | `techpowerup.com` | `tier2_lab` | `instrumented` | `94` | Strong source for sensor implementation, lift-off behavior, switches, encoder, MCU-adjacent teardown detail. |
| `mousespecs_org` | `mousespecs.org` | `tier5_aggregator` | `aggregator` | `93` | Broad structured mouse-spec coverage across connectivity, dimensions, shape, encoder, and switch metadata. |
| `lttlabs_com` | `lttlabs.com` | `tier2_lab` | `instrumented` | `92` | Additional measurement-grade lab coverage for latency, polling, and device dimensions. |
| `sensor_fyi` | `sensor.fyi` | `tier5_aggregator` | `aggregator` | `91` | Specialist sensor reference for `sensor`, `sensor_brand`, `sensor_link`, `ips`, `acceleration`, `smoothing`. |

### Mouse Lower-Priority Fallbacks

| Class | Hosts | Why lower priority |
|---|---|---|
| Manufacturer baseline | `razer.com`, `logitechg.com`, `steelseries.com`, `corsair.com`, `gloriousgaming.com`, `pulsar.gg`, `endgamegear.com`, `zowie.benq.com`, `vaxee.co` | Reliable for canonical specs, but not measurement-heavy. |
| Retailer fallback | `bestbuy.com`, `amazon.com`, `newegg.com`, `bhphotovideo.com`, `microcenter.com` | Useful for SKU, colorway, and commerce metadata; should not outrank deep-field evidence. |
| Community | `reddit.com` | Kept manual-only for corroboration and edge-case commentary, not proactive URL prediction. |

---

## IDX Audit Summary

IDX audit snapshot captured inline below.

| Verdict | Count |
|---|---|
| `Live` | 28 |
| `Live (publish-only)` | 1 |
| `No IDX consumer` | 4 |
| `Removed IDX knob` | 5 |

### IDX Key Matrix

| IDX key | Status | Primary pipeline stage | Current effect |
|---|---|---|---|
| `contract.type` | Live | Fetch Worker / extraction | Shapes extraction, normalization, and validation for typed fields |
| `contract.shape` | Live | Fetch Worker / extraction | Shapes extraction and validation for expected value shape |
| `contract.unit` | Live | Fetch Worker / extraction | Shapes extraction and normalization for unit-aware fields |
| `contract.unknown_token` | Live | Fetch Worker / extraction | Controls unknown-token handling in extraction/validation surfaces |
| `contract.rounding.decimals` | No IDX consumer | None | Authorable only; no verified IndexLab consumer |
| `contract.rounding.mode` | No IDX consumer | None | Authorable only; no verified IndexLab consumer |
| `priority.required_level` | Live | NeedSet + extraction | Changes field priority and downstream evidence/validation behavior |
| `priority.availability` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `priority.difficulty` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `priority.effort` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `priority.publish_gate` | No IDX consumer | None | Authorable only; no verified IndexLab consumer |
| `priority.block_publish_when_unk` | Live (publish-only) | Publish finalization | Checked during publish finalization, not on worker/prefetch surfaces |
| `ai_assist.mode` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `ai_assist.model_strategy` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `ai_assist.max_calls` | Removed IDX knob | None | Underlying parameter remains authorable, but the IDX-specific map entry was removed |
| `ai_assist.max_tokens` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `ai_assist.reasoning_note` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `parse.template` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `parse.unit` | No IDX consumer | None | Authorable only; no verified IndexLab consumer |
| `parse.unit_accepts` | Removed IDX knob | None | Underlying parameter remains authorable, but the IDX-specific map entry was removed |
| `parse.allow_unitless` | Removed IDX knob | None | Underlying parameter remains authorable, but the IDX-specific map entry was removed |
| `parse.allow_ranges` | Removed IDX knob | None | Underlying parameter remains authorable, but the IDX-specific map entry was removed |
| `parse.strict_unit_required` | Removed IDX knob | None | Underlying parameter remains authorable, but the IDX-specific map entry was removed |
| `enum.policy` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `enum.source` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `evidence.required` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `evidence.min_evidence_refs` | Live | NeedSet + extraction | NeedSet consumes minimum reference requirements before prioritization |
| `evidence.conflict_policy` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `evidence.tier_preference` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `search_hints.domain_hints` | Live | Search Profile / queryBuilder | Drives host hints and Search Profile badge counts |
| `search_hints.preferred_content_types` | Live | Search Profile / queryBuilder | Drives content-type hints and Search Profile badge counts |
| `search_hints.query_terms` | Live | Search Profile / queryBuilder | Drives query construction and Search Profile badge counts |
| `constraints` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `component.type` | Live | Fetch Worker / extraction | Flows through projected runtime field rules during extraction/validation |
| `aliases` | Live | Search Profile / queryBuilder | Expands deterministic query terms and Search Profile surfaces |
| `ui.tooltip_md` | Live | Search Profile / queryBuilder | Tooltip-derived search/helper terms are now properly gated |
| `contract.range` | Live | Fetch Worker / extraction | Canonical IDX-mapped extraction constraint with Runtime Ops badge |
| `contract.list_rules` | Live | Fetch Worker / extraction | Canonical IDX-mapped extraction constraint with Runtime Ops badge |

---

## Runtime Surfaces That Prove Consumption

| Surface | What it proves |
|---|---|
| Search Profile panel | Shows badge counts and effective counts for `query_terms`, `domain_hints`, and `preferred_content_types` |
| NeedSet worker IDX Runtime badges | Shows projected use of `priority.required_level` and `evidence.min_evidence_refs` |
| Fetch Worker IDX Runtime badges | Shows projected use of extraction/validation keys like `contract.*`, `enum.*`, `constraints`, `component.type`, `ai_assist.*`, and evidence policy keys |
| Publish finalization | `priority.block_publish_when_unk` remains live, but only in publish-time behavior |
| Runtime bridge search profile artifact | Can carry `effective_host_plan`, but the latest fully enabled live run still wrote `null` |

---

## Current Gaps To Keep In Mind

1. The docs previously treated several v2 flags as disabled by default. The code now defaults them to `true`.
2. The live discovery path still depends on source-strategy rows more than the v2 `effective_host_plan` path.
3. `validatedRegistry` is attached by `loadCategoryConfig()` when source registry is enabled, but it is not broadly consumed downstream by the main runtime.
4. Mouse field rules still contain a small number of token-only hint cases (for example `switches_link`) even though the high-value mouse hosts are now approved and detailed.
5. `authority`, `content_types`, `doc_kinds`, and most of `field_coverage` are present in category source data, but they are not yet strong live steering inputs in the main runtime path.
6. The latest fully enabled live run completed and emitted artifacts, but identity ended as `unlocked` with insufficient source diversity. The publish gate correctly blocked 15 fields. The source pipeline is live but has not yet achieved publishable status on this product.
7. The upgrade-plan SourceRegistry policy fields like `connector_only` / `blocked_in_search`, plus the `HostHealth` ladder, are not yet reflected back as a proven non-null live host-plan artifact.
8. The upgrade-plan compounding layer (`QueryIndex`, `URLIndex`, `PromptIndex`) and bounded expansion paths (`community ingestion`, `local helper AI`) remain documented seams rather than proven default runtime behavior in this pass.

---

## Primary Code References

- `src/field-rules/consumerGate.js`
- `src/features/indexing/orchestration/shared/indexlabRuntimeFieldRules.js`
- `src/pipeline/runProduct.js`
- `src/features/indexing/search/queryBuilder.js`
- `src/features/indexing/sources/sourceFileService.js`
- `src/features/indexing/orchestration/shared/runProductOrchestrationHelpers.js`
- `src/features/indexing/discovery/searchDiscovery.js`
- `src/categories/loader.js`
- `src/planner/sourcePlanner.js`
- `src/fetcher/playwrightFetcher.js`
- `src/features/indexing/api/runtimeOpsRoutes.js`
- `src/features/indexing/runtime/idxRuntimeMetadata.js`
- `src/indexlab/runtimeBridge.js`
