# 05-OPERATIONS-AND-DEFAULTS.md

**Scope:** These defaults configure the **Collection Pipeline** — the system that searches, fetches, parses, extracts, and stores per-source evidence. The convergence loop and its 7 knobs have been fully eliminated (2026-03-15). Non-convergence knobs in the convergence settings section (consensus, SERP triage, retrieval, lane concurrency) remain active. The Review Phase (comparison, conflict resolution, publishing) will be implemented as a separate system after the collection pipeline.

Purpose: curated production defaults summary for the live rollout. This file is intentionally not the exhaustive knob inventory.

Use these sources of truth together:
- Exhaustive knob inventory: `docs/implementation/ai-indexing-plans/spec_factory_knobs_maintenance.md`
- Shared runtime defaults: `src/shared/settingsDefaults.js`
- Resolved env/config defaults: `src/config.js`
- Tuned changes promoted from live evidence: `docs/implementation/ai-indexing-plans/TUNING-LOG.md`

Current values below were re-checked on 2026-03-10 against the app, not against legacy rollout notes.

## curated production defaults summary

```env
SEARCH_PROVIDER=google
ENABLE_SOURCE_REGISTRY=true
ENABLE_DOMAIN_HINT_RESOLVER_V2=true
ENABLE_QUERY_COMPILER=true
ENABLE_CORE_DEEP_GATES=true

LANE_CONCURRENCY_SEARCH=2
LANE_CONCURRENCY_FETCH=4
LANE_CONCURRENCY_PARSE=4
LANE_CONCURRENCY_LLM=2

PREFER_HTTP_FETCHER=true
FETCH_SCHEDULER_ENABLED=true
FETCH_SCHEDULER_MAX_RETRIES=1
PER_HOST_MIN_DELAY_MS=1500

SERP_TRIAGE_ENABLED=true
SERP_TRIAGE_MIN_SCORE=3
DISCOVERY_ENABLED=true
DISCOVERY_MAX_QUERIES=10
DISCOVERY_RESULTS_PER_QUERY=10
MAX_URLS_PER_PRODUCT=50
MAX_CANDIDATE_URLS=80
MAX_PAGES_PER_DOMAIN=5
MAX_RUN_SECONDS=480

LLM_ENABLED=true
LLM_PER_PRODUCT_BUDGET_USD=0.35
LLM_MAX_CALLS_PER_PRODUCT_TOTAL=14
LLM_MAX_EVIDENCE_CHARS=60000

FRONTIER_COOLDOWN_403_BASE=1800
FRONTIER_COOLDOWN_429_BASE=600
FRONTIER_REPAIR_SEARCH_ENABLED=true

AGGRESSIVE_MODE_ENABLED=true
UBER_AGGRESSIVE_ENABLED=true
```

## Known Default Invariants And Current Policy

- `serpTriageEnabled` and `llmSerpRerankEnabled` are invariant-on runtime behavior. They should not be treated as operator-facing disable switches.
- `bingSearchEndpoint` has been removed from runtime defaults/config and is no longer part of the live search path.
- Canonical runtime defaults now align between `src/shared/settingsDefaults.js` and `loadConfig()` for `fetchConcurrency=4`, `pageGotoTimeoutMs=12000`, `postLoadWaitMs=200`, `discoveryQueryConcurrency=1`, `fetchPerHostConcurrencyCap=1`, and the realistic Chrome user agent.
- `preferHttpFetcher=true` is the correct default. Broader fetch-policy behavior still depends on source-registry/domain policy and should not be inferred from this flag alone.
- Frontier first-offense cooldowns are `1800` seconds for `403` and `600` seconds for `429`.
- `discoveryResultsPerQuery=10` matches current provider reality and is the live default.
- Variant-sensitive conflicts such as `size_class_conflict` and `sensor_family_conflict` remain Track 2 identity-audit follow-up work and should not be documented as permanent identity-gate blockers.
- NeedSet identity caps (`needsetCapIdentity*`) have been fully deleted from code, config, defaults, and settings manifest. Stage 1 identity gate refactor is COMPLETE (2026-03-10).
- Identity gate is now **advisory for extraction, blocking only for publish**. Only two active knobs remain: `identityGateBaseMatchThreshold=0.80` and `identityGatePublishThreshold=0.75`. The 12 old dynamic-threshold knobs have been retired and removed from code, defaults, settings manifest, and runtime artifact.

## Aggressive Verification And Gap-Fill

The app no longer uses legacy preset families. Aggressive and uber-aggressive behavior are always on, with these remaining live knobs controlling bounded escalation:

| Knob | Default | Meaning |
|---|---|---|
| `AGGRESSIVE_CONFIDENCE_THRESHOLD` | `0.85` | Minimum confidence before accepting aggressive fill candidates |
| `AGGRESSIVE_MAX_SEARCH_QUERIES` | `3` | Extra search queries reserved for aggressive passes |
| `AGGRESSIVE_EVIDENCE_AUDIT_ENABLED` | `true` | Keep post-extraction evidence audit active |
| `AGGRESSIVE_EVIDENCE_AUDIT_BATCH_SIZE` | `60` | Fields per aggressive evidence-audit batch |
| `AGGRESSIVE_MAX_TIME_PER_PRODUCT_MS` | `600000` | Hard cap for extended extraction time |
| `AGGRESSIVE_THOROUGH_FROM_ROUND` | `2` | Round index that activates deeper extraction |
| `AGGRESSIVE_ROUND1_MAX_URLS` | `45` | Approved URL cap in round one |
| `AGGRESSIVE_ROUND1_MAX_CANDIDATE_URLS` | `120` | Candidate URL cap in round one |
| `AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND` | `8` | Extra LLM calls allowed per aggressive round |
| `AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL` | `16` | Total aggressive LLM calls per product |
| `AGGRESSIVE_LLM_TARGET_MAX_FIELDS` | `75` | Max fields targeted in an aggressive LLM extraction call |
| `AGGRESSIVE_LLM_DISCOVERY_PASSES` | `3` | Additional LLM-driven discovery passes |
| `AGGRESSIVE_LLM_DISCOVERY_QUERY_CAP` | `12` | Query cap across aggressive discovery passes |
| `LLM_VERIFY_AGGRESSIVE_ALWAYS` | `false` | Force verification on every aggressive batch |
| `LLM_VERIFY_AGGRESSIVE_BATCH_COUNT` | `3` | Number of aggressive batches to verify when selective verification is active |

## Runtime Reality Notes

- The v2 registry/compiler/gate flags are default-on.
- The main live discovery path still is not fully proven to emit `effective_host_plan` as the primary steering artifact in every run.
- Phase 05/06 completion still requires real-run proof in addition to green targeted tests.

## Routing And Instrumentation Invariants (Not Curated Knobs)

- `HostHealth`, field-affinity, operator-risk, and NeedSet-coverage scoring inputs remain part of the rollout contract even when they are not repeated in the short env summary above.
- `connector_only` and `blocked_in_search` are source-policy controls carried by SourceRegistry / EffectiveHostPlan, not user-facing runtime toggles.
- `QueryIndex`, `URLIndex`, and `PromptIndex` are required compounding/instrumentation surfaces even though the current app does not expose them as standalone runtime knobs. Phase 4A planning names `ENABLE_QUERY_INDEX` and `ENABLE_URL_INDEX` as future rollout flags; they are not live defaults yet.
- `community ingestion` remains future connector-first work. The `Reddit connector` is not a default-on production path.
- Community consensus dual-write controls such as `consensusDualWriteEnabled`, `consensusTier4OverrideThreshold`, `consensusEligibleFields`, and `consensusMinConfidence` remain Phase 6 design-only names, not current runtime knobs.
- Full `evidence quote anchoring` is a parsing contract requirement, not a promoted env default in the current app.
- `local helper AI` remains future-only and disabled by default until separately implemented and proven.

## Default-Sync Rules

1. Change upstream env/config first.
2. Update `src/shared/settingsDefaults.js`.
3. Verify the runtime settings API and GUI reflect the new value.
4. Record any promoted tuning decision in `docs/implementation/ai-indexing-plans/TUNING-LOG.md`.

If a value is not covered here, use the maintenance inventory instead of assuming it is retired.
