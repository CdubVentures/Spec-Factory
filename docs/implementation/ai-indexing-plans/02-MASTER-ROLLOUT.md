# 02-MASTER-ROLLOUT.md - Progressive Rollout Plan

## Two-Phase Boundary

The system operates in two distinct phases. The **Collection Pipeline** (13 stages) handles searching, fetching, parsing, extracting, and storing per-source evidence. Its only job is maximizing the volume and quality of collected data. The **Review Phase** (separate, implemented after collection) compares all collected data, identifies correct field values, resolves conflicts, and decides whether another collection loop is needed.

The 3-pass operating model below describes collection strategy. Comparison, consensus, and publishing are review phase activities, not collection pipeline work.

---

Strategy:
- Get the best results early
- Learn from every run
- Go deeper only when justified
- Never sacrifice accuracy for speed

## Operating Model

Pass 1:
- Get fast, strong, high-authority evidence first
- Manufacturer pages, support docs, PDFs, structured metadata, spec tables

Pass 2:
- Use what was learned to fill gaps smarter
- Better queries, better hosts, better URL selection, better fallback routing

Pass 3:
- Expensive escalation only where the gap justifies the cost
- OCR, screenshots, difficult PDFs, community sources, harder retries

## Non-Negotiables

- No retired direct-provider dependency. Live search routes through self-hosted SearXNG, with `searchProvider=google` as the best-result default and `bing`/`dual` available as fallback modes.
- Evidence-locked output. Every non-null value needs source URL, evidence quote, and anchor.
- Two-layer output. Core facts require strong evidence; deep claims stay annotated.
- The v2 discovery stack only works if these land together:
  - Source registry + host policy
  - Provider capabilities + query compiler
  - Core vs deep acceptance gates
  - Domain hint resolver v2 -> EffectiveHostPlan

## Rollout Phases

### Phase 1: Stabilize

Fix CP-0 (GUI timeout) and CP-1 (repair handoff). CI must be green before anything else.

### Phase 2: Registry + Compiler + Gates

Build the three prerequisites together:
- Source registry with schema validation
- Query compiler with provider-aware operators
- Core/deep gate enforcement

### Phase 3: Domain Hint Resolver v2

Replace dot-only hint logic with typed classification:
- explicit host
- tier token
- content intent
- unresolved token
- public-suffix aware host parsing
- `connector_only` / `blocked_in_search` policy carry-through
- `HostHealth` ladder snapshots in plan + query scoring

### Phase 4: Instrumentation

Make compounding measurable:
- Query index
- URL index
- PromptIndex / cost / yield telemetry

### Phase 5: Production Rollout

Staged flag enablement:
- registry
- compiler
- gates
- resolver

Promote winning defaults back into config and UI.

### Phase 6: Visual + Parsing

Ship:
- visual capture manifest
- quality / target gates
- image OCR worker
- parsing upgrades
- evidence quote anchoring

### Phase 7: Acceleration

Focus:
- community ingestion
- Reddit connector
- throughput tuning
- knob telemetry
- NeedSet lineage

Optional local helper AI is still a future design concept only. It is not a live runtime knob in the current app.

## Discovery v2 Contract That Must Not Drift

- `EffectiveHostPlan` is the truth object once Phase 3 is fully live, and it must carry unresolved tokens, host groups, explain data, `connector_only`, `blocked_in_search`, and `HostHealth` state.
- Query scoring must retain the upgrade-plan signals: NeedSet coverage, field affinity, diversity, `HostHealth`, and operator risk.
- Phase 4 instrumentation means `QueryIndex`, `URLIndex`, and `PromptIndex`, not just generic telemetry.
- Phase 7 community work means connector-first `community ingestion`; the `Reddit connector` must stay bounded to claims-only evidence and never overwrite core facts.
- Any future `local helper AI` stays advisory-only, schema-bounded, and unable to invent hosts or URLs.

## Provider Preference

- Tier 1: `searchProvider=google` -> SearXNG constrained to the Google engine for best result quality
- Tier 2: `searchProvider=bing` -> SearXNG constrained to the Bing engine when Google underperforms
- Tier 3: `searchProvider=dual` or `searchProvider=searxng` -> combined/default SearXNG routing for resilience and recovery

## Planned Future Controls (Not Live Runtime Knobs)

- Query-index consumption for compound learning is still a rollout concept. The current app does not expose a live runtime flag for it.
- URL-index reuse / pre-seeding is still a rollout concept. The current app does not expose a live runtime flag for it.
- Local helper AI remains a future Phase 7 concept. The current app does not expose a live runtime knob for it.

## Acceptance Criteria

| Metric | Target |
|---|---|
| Fill-rate improvement vs v1 | >= 15% |
| Wrong-value delta vs v1 | within 2% |
| Products per day | 15-20 sustained |
| Average run time | < 8 minutes |
| LLM cost per product | < $0.50 |
| Searches per product | should trend down over time |
| Community overwriting core facts | never |

## Current Truth

- Current runtime truth lives in `01-SYSTEM-STATUS.md`, `05-OPERATIONS-AND-DEFAULTS.md`, and `06-IDX-AND-SOURCE-PIPELINE.md`.
- CP-0 and CP-1 are now green in automated proof.
- **Stage 1 identity gate refactor is COMPLETE.** Identity is now advisory for extraction, blocking only for publish. 12 dynamic threshold knobs retired.
- **Feature-first vertical slice reorganization is COMPLETE.** Backend modules organized from flat `src/` dirs to 9 feature-scoped domains under `src/features/`. All 5517 tests preserved.
- **LLM dashboard simplification is COMPLETE.** Dead summary fields removed, shared model helpers (Claude/Gemini/DeepSeek/GPT), `escalation_planner` call type added.
- **Convergence loop elimination is COMPLETE (2026-03-15).** `runConvergenceLoop()` deleted, 7 convergence knobs removed, `runProduct()` is the only pipeline path. ~2,800 LOC removed. 21 non-convergence knobs (consensus, SERP triage, retrieval, lane concurrency) remain functional.
- Phases 05-06 are implemented and artifact-producing. The latest fully enabled live run completed with exit code `0` but ended non-publishable because identity remained `unlocked` with insufficient source diversity.
