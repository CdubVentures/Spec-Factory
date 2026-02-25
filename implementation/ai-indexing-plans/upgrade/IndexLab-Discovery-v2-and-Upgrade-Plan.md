# IndexLab — Discovery v2 + Mice Hybrid v3 Upgrade Plan (Consolidated)

Owner: Chris (Spec Factory)

Last updated: 2026-02-25

This document merges and tightens:
- **Domain Hint Resolver + Source Policy + Query Selection QA (v2)**
- **Mice Hybrid v3 Upgrade Plan (Max Results + Max Accuracy, No Google API)**

It is written as an *execution plan* with clear concurrency requirements: what must ship alongside v2 for the upgrade to actually produce better results.

---

## 0) Executive summary

### What v2 fixes
Your current pipeline effectively treats `domain_hints` as “usable only if it contains a dot.” That silently discards valid intent tokens such as `retailer`, `lab`, `database`, `manufacturer`, which then cascades into:
- Domain panel stuck at `0/Y` despite valid intent.
- Weak host coverage + low pass diversity.
- “First query” selection that looks deterministic but is missing key signals.

### What we are building
**Discovery v2** introduces a deterministic compile step that turns “hints + needs + policy + runtime health” into a single truth object:

**EffectiveHostPlan** → drives query generation, scoring, UI explainability, and repair.

### What makes the upgrade “optimal”
The v2 hint resolver only produces optimal results if you *also* implement the few upgrade-plan items that provide:
1) **A structured SourceRegistry/HostPolicy** (so tier tokens expand correctly and safely)
2) **ProviderCapabilities + QueryCompiler** (so operators like `site:` / `filetype:` are compiled correctly per provider)
3) **Correctness gates (Core Facts vs Deep Claims + tier acceptance rules)** (so broader source coverage doesn’t reduce accuracy)
4) **Instrumentation (QueryIndex + URLIndex)** (so v2 improvements compound over time)

Everything else (parsing upgrades, Reddit connector, optional Qwen3) is high ROI, but can be sequenced after the v2 core is stable.

---

## 1) Hard constraints and non-negotiables

### 1.1 No automated Google SERP dependency
- Do **not** build discovery on automated Google SERP querying.
- Google remains **human-in-the-loop rescue** (seed URLs pasted into a run), then stored in **URLIndex** for reuse.

### 1.2 Evidence-locked extraction everywhere
- **Core Facts:** if evidence is missing → `null`.
- **Deep Claims:** if evidence is weak → keep as a claim object with low confidence.
- Every non-null value must include `{source_url, evidence_quote, anchor/span}`.

### 1.3 Two-layer output model (accuracy guardrail)
Split output into:

**A) Core Spec (FACTS)**
- Manufacturer specs, manuals, official support PDFs.
- Stable numeric specs.
- Conservative acceptance rules.

**B) Deep Spec (CLAIMS)**
- Lab measurements, enthusiast teardowns, firmware quirks.
- Stored as claims with methodology/conditions.

Recommended claim schema:
```json
{
  "field": "click_latency",
  "value": 2.3,
  "unit": "ms",
  "claim_text": "…",
  "claim_type": "measured|reviewer|community|subjective",
  "variant_scope": "wired/2.4G/BT, polling rate, firmware if known",
  "source_url": "…",
  "evidence_quote": "…",
  "confidence": 0.0,
  "corroboration_count": 0
}
```

---

## 2) Definitions and the “single truth object”

### 2.1 Hint token classes
All `domain_hints[]` tokens must resolve into exactly one of:

**A) Explicit host hints** (parse as a domain/host)
- `rtings.com`, `techpowerup.com`, `support.logitech.com`

**B) Tier tokens** (expand to hosts via SourceRegistry)
- `manufacturer`, `retailer`, `lab`, `database`, `community`

**C) Content intent tokens** (query modifiers, not domains)
- `support`, `manual`, `pdf`, `datasheet`, `drivers`, `firmware`, `specsheet`

**D) Unresolved tokens**
- Anything else → must appear in UI/logs (never silently ignored).

### 2.2 EffectiveHostPlan
Every run produces one deterministic plan used by query generation + scoring + UI:

**EffectiveHostPlan**
- `manufacturer_hosts[]` (brand-resolved)
- `tier_hosts: { retailer[], lab[], database[], community[] }`
- `explicit_hosts[]` (from dotted `domain_hints`)
- `content_intents[]` (support/manual/pdf etc)
- `unresolved_tokens[]` (UI/log surface)
- `host_groups[]` (for diversity + budgets)
- `host_health: { host -> { budget_score, cooldown_s, blocked_reason } }`
- `provider_caps: { provider -> { supports_site, supports_filetype, supports_since, … } }`
- `policy: { host -> { authority, max_qps, requires_js, preferred_paths, content_types, doc_kinds, connector_only } }`
- `explain[]` (why each host is included)

---

## 3) What I would change (delta vs your current v2 + upgrade drafts)

These are small but high-leverage changes.

### 3.1 Make host parsing *public-suffix aware* and URL-safe
Don’t use “contains a dot” as the domain test.
- Accept full URLs (strip protocol/path/query → host).
- Reject obvious non-host tokens (`v2.0`, `foo.bar` if it fails domain parse rules).
- Normalize to punycode/lowercase; strip ports; dedupe.

**Why:** this prevents v2 from creating a *new* class of silent misclassification.

### 3.2 Add `connector_only` and `blocked_in_search` to SourceRegistry
Some sources are best handled by connectors (or are unreliable for search-index discovery).

Add per-host flags:
- `connector_only: true` (never used for `site:` queries)
- `blocked_in_search: true` (avoid planning search against it)

**Why:** avoids wasting passes on sources that are known to be crawler-index hostile.

### 3.3 Make HostHealth gating a ladder (default = downrank, not hard exclude)
Use a consistent ladder:
- **downrank** hosts in cooldown (default)
- **exclude** only when cooldown is severe or host is blocked
- **relax** constraints automatically if yield drops

**Why:** hard exclusion can starve Pass 1 and reduce coverage.

### 3.4 Move “Core vs Deep” into scoring/acceptance now (not later)
As v2 increases diversity (retailers/labs/community), you must prevent:
- community claims overwriting core facts
- low-tier sources “winning” by volume

Implement acceptance gates *now*:
- core fact fields require Tier1/Tier2 or corroboration
- deep fields stored as claims with clustering

### 3.5 Add a provider-operator compatibility golden test suite
Before expanding operator usage (`site:`, `filetype:`, `since:`), lock behavior with golden tests.

**Why:** prevents “dead operators” and future provider drift.

---

## 4) Workstreams

### Workstream A — Discovery v2: DomainHintResolver + EffectiveHostPlan
**Goal:** No silent drops; deterministic host plan; explainable.

Deliverables:
- `domainHintResolver` producing EffectiveHostPlan
- typed hints (explicit host vs tier vs intent vs unresolved)
- host expansion from SourceRegistry
- host/group budgets for pass diversity
- UI surfacing of unresolved tokens and explain data

### Workstream B — SourceRegistry + HostPolicy (must ship with v2)
**Goal:** Tier tokens expand to real hosts with safety metadata.

Deliverables:
- `config/source_registry.(json|yaml)`
- schema validation in CI
- per-host policy metadata:
  - `tier`, `authority`, `content_types`, `doc_kinds`
  - `preferred_paths`
  - `max_qps` / pacing hints
  - `requires_js`, `known_issues`
  - `field_affinity[]` (which keys it’s good for)
  - `connector_only` / `blocked_in_search`

### Workstream C — ProviderCapabilities + QueryCompiler (must ship with v2)
**Goal:** Compile logical query plans into provider-specific syntax and avoid unsupported operators.

Deliverables:
- `providerCapabilities` (feature flags per provider)
- `queryCompiler` that:
  - uses `site:` only when supported
  - uses `filetype:` only when supported
  - falls back to lexical “soft constraints” when not

### Workstream D — Correctness gates: Core Facts vs Deep Claims + tier acceptance (must ship with v2)
**Goal:** Improve completeness without sacrificing accuracy.

Deliverables:
- field classification: `core_fact` vs `deep_claim`
- tier acceptance rules in extraction/convergence
- claim clustering for numeric deep fields (median/range + outliers)

### Workstream E — Instrumentation: QueryIndex + URLIndex + PromptIndex (should ship with v2)
**Goal:** Make improvements compound and debuggable.

Deliverables:
- **QueryIndex**: query → provider → results → field yield attribution
- **URLIndex**: url → fetch success → doc_kind/tier → fields filled → last seen
- **PromptIndex**: versioned prompts per route + yield/error rate

### Workstream F — Parsing upgrades (high ROI; can be parallel or immediately after)
**Goal:** Better recall + lower tokens + fewer hallucinations.

Deliverables:
- Trafilatura pre-cleaner for HTML
- Unstructured partition backend inside PDF router
- Apache Tika fallback router for odd formats
- evidence quote anchoring (hash + span/selector + context window)

### Workstream G — Community ingestion (parallel; required if you want community coverage to be reliable)
**Goal:** Don’t rely on fragile HTML crawling of community sources.

Deliverables:
- Reddit ingest connector (post + top comments + metadata)
- treat as Tier4 evidence
- store outputs as claims; never overwrite core facts

### Workstream H — Ops / throughput tuning (after v2 stabilizes)
**Goal:** 15–20 products/day with bounded cost.

Deliverables:
- caching + conditional requests
- static-first, headless rendering only when needed
- politeness knobs, per-host pacing, retry policy

---

## 5) What must be done “at the same time” as Discovery v2

These items are **not optional** if the goal is *optimal* results rather than “v2 compiles but doesn’t materially improve yield.”

### Required alongside v2 (ship in the same release train)
1) **SourceRegistry + HostPolicy** (Workstream B)
   - v2 tier expansion depends on it.
   - also where you encode authority/tier/doc_kind/connector-only decisions.

2) **ProviderCapabilities + QueryCompiler** (Workstream C)
   - v2 produces logical intent (“prefer PDF/manual,” “prefer manufacturer host”), but the compiler makes it real per provider.

3) **Correctness gates: Core vs Deep + tier acceptance** (Workstream D)
   - v2 will broaden the source mix; without gates you risk regressions in accuracy.

### Strongly recommended alongside v2 (to measure and compound)
4) **QueryIndex + URLIndex** (Workstream E)
   - lets you prove v2 improved: fewer searches/product, faster citations, better field yield.
   - powers URL reuse and reduces reliance on repeated discovery.

### Optional in-parallel (high ROI, but can follow right after)
5) **Evidence quote anchoring + HTML/PDF parsing upgrades** (Workstream F)
6) **Community connector** (Workstream G)

---

## 6) Implementation order (milestones)

### Prerequisite wave (unblocks everything)
- **CP-0:** Fix deterministic GUI lane contract timeout
- **CP-1:** Wire Phase 04 `repair_query_enqueued` → Phase 06B durable queue + worker execution

These are not logically required for v2 compilation, but they are required for “paid-service grade” reliability and self-healing.

### Milestone 1 — Build the registry + compiler skeleton
- Add SourceRegistry schema + loader
- Add ProviderCapabilities
- Add QueryCompiler with golden tests

### Milestone 2 — DomainHintResolver v2 → EffectiveHostPlan
- Implement typed hint classification + expansion
- Attach policy + host health snapshots
- Surface unresolved tokens + explain in UI panels

### Milestone 3 — QueryBuilder integration + scoring
- Replace dot-only `domain_hints` logic
- Generate logical query plans from host groups + intents
- Compile per provider
- Add deterministic scoring features:
  - NeedSet key coverage
  - source alignment / field affinity
  - diversity penalty
  - host health penalty
  - operator risk penalty

### Milestone 4 — Correctness gates (Core vs Deep) + acceptance rules
- Implement core/deep split in output model and convergence
- Add tier-based acceptance policy
- Add clustering for deep numeric claims

### Milestone 5 — Instrumentation + side-by-side comparison
- Log old vs new plan diffs (behind flags)
- Persist QueryIndex and URLIndex updates
- Add dashboards:
  - time-to-first-citation
  - yield per query
  - searches per product
  - block/challenge rate per host

### Milestone 6 — Parsing upgrades (HTML/PDF) + evidence anchoring
- Trafilatura pre-cleaner
- Unstructured partition PDF backend
- Tika fallback
- quote anchoring

### Milestone 7 — Community connector
- Reddit ingest connector
- mark reddit as `connector_only` in SourceRegistry

### Milestone 8 — Optional: bounded learned reranker / Qwen3 helpers
- Keep deterministic scorer as the floor
- learned rerank only provides bounded deltas
- Qwen3 only outputs schema-constrained tokens and cannot introduce new hosts

---

## 7) Feature flags (safe rollout)

Recommended flags:
- `ENABLE_SOURCE_REGISTRY`
- `ENABLE_DOMAIN_HINT_RESOLVER_V2`
- `ENABLE_QUERY_COMPILER`
- `ENABLE_CORE_DEEP_GATES`
- `ENABLE_QUERY_INDEX`
- `ENABLE_URL_INDEX`
- `ENABLE_LTR_RERANK` (optional/bounded)

Rollout:
1) Side-by-side run old vs new (log diffs)
2) Gate on regression checks (fill rate, wrong-value rate, time-to-first-citation)
3) Default to new once stable

---

## 8) Acceptance criteria (definition of done)

### Discovery v2 correctness
- Tier tokens (`retailer/lab/database/manufacturer/community`) always resolve to hosts **or** appear in `unresolved_tokens`.
- Domain panel never shows `0/Y` when tier intent exists and SourceRegistry has entries.
- Query journey shows why #1 beat #2/#3.
- Pass 1 includes at least N distinct host_groups (diversity enforced).

### Accuracy preservation
- Core facts cannot be overwritten by Tier4/community evidence.
- Deep numeric fields are clustered (median/range + notes).

### Runtime safety
- HostHealth prevents selecting hosts in cooldown (or records explicit override reason).
- Provider operators are compiled correctly (golden tests).

### Compounding
- QueryIndex and URLIndex show decreasing searches/product over time.

---

## 9) Recommended env overrides (Hybrid v3 baseline)

```env
# --- IndexLab Mice Hybrid v3 baseline ---

# Completion & convergence
CONVERGENCE_MAX_TARGET_FIELDS=80
CONVERGENCE_MAX_DISPATCH_QUERIES=40
CONVERGENCE_MAX_ROUNDS=4
CONVERGENCE_NO_PROGRESS_LIMIT=3
CONVERGENCE_MAX_LOW_QUALITY_ROUNDS=2
ALLOW_BELOW_PASS_TARGET_FILL=true

# LLM
LLM_ENABLED=true
LLM_PER_PRODUCT_BUDGET_USD=0.60
LLM_MAX_CALLS_PER_PRODUCT_TOTAL=18
LLM_MAX_BATCHES_PER_PRODUCT=10
LLM_MAX_CALLS_PER_PRODUCT_FAST=4
LLM_MAX_CALLS_PER_ROUND=6
LLM_MAX_EVIDENCE_CHARS=90000
LLM_TIMEOUT_MS=60000
LLM_VERIFY_MODE=true
LLM_VERIFY_SAMPLE_RATE=25
LLM_WRITE_SUMMARY=true
LLM_EXTRACTION_CACHE_ENABLED=true
LLM_EXTRACTION_CACHE_TTL_MS=1209600000

# Retrieval
RETRIEVAL_MAX_HITS_PER_FIELD=35
RETRIEVAL_MAX_PRIME_SOURCES=12
RETRIEVAL_IDENTITY_FILTER_ENABLED=true

# Fetching / politeness
CONCURRENCY=3
PER_HOST_MIN_DELAY_MS=1200
FETCH_SCHEDULER_ENABLED=true
FETCH_SCHEDULER_MAX_RETRIES=2
PREFER_HTTP_FETCHER=true
AUTO_SCROLL_ENABLED=true
AUTO_SCROLL_PASSES=2
AUTO_SCROLL_DELAY_MS=1200
PAGE_GOTO_TIMEOUT_MS=20000
PAGE_NETWORK_IDLE_TIMEOUT_MS=4000
POST_LOAD_WAIT_MS=500

# Parsing
STRUCTURED_METADATA_EXTRUCT_ENABLED=true
STRUCTURED_METADATA_EXTRUCT_TIMEOUT_MS=4000
STRUCTURED_METADATA_EXTRUCT_MAX_ITEMS_PER_SURFACE=400
PDF_BACKEND_ROUTER_ENABLED=true
PDF_BACKEND_ROUTER_TIMEOUT_MS=180000
MAX_PDF_BYTES=12000000
SCANNED_PDF_OCR_MAX_PAGES=6
SCANNED_PDF_OCR_MIN_CONFIDENCE=0.55

# Runtime
MAX_RUN_SECONDS=600
```

---

## Appendix A — Minimal SourceRegistry entry example

```json
{
  "host": "support.example.com",
  "tier": "manufacturer",
  "authority": 0.95,
  "content_types": ["html", "pdf"],
  "doc_kinds": ["support", "manual", "drivers"],
  "preferred_paths": ["/support", "/downloads", "/manuals"],
  "max_qps": 0.2,
  "requires_js": false,
  "known_issues": [],
  "field_affinity": ["drivers", "firmware", "manual_url"],
  "connector_only": false,
  "blocked_in_search": false
}
```
