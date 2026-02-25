# IndexLab — Mice Hybrid v3.1 (Max Results + Max Accuracy, Discovery v2 Aligned)

Owner: Chris (Spec Factory)

Last updated: 2026-02-25

This is a tightened revision of the Hybrid v3 upgrade plan that explicitly aligns with **Discovery v2** (DomainHintResolver + SourceRegistry + QueryCompiler).

It targets:
- **high completeness (~75 fields)**
- **high accuracy (evidence-locked)**
- **15–20 products/day**
- **no automated Google SERP dependency**

---

## 0) Non-negotiables

### 0.1 No automated Google SERP dependency
- Google is **human-in-the-loop rescue** only: paste seed URLs into a run.
- Those URLs are persisted in **URLIndex** so future runs don’t need repeated discovery.

### 0.2 Two-layer output model
**Core Spec (FACTS)** vs **Deep Spec (CLAIMS)**.
- Core facts require strong sources.
- Deep fields stored as claims with conditions and corroboration.

### 0.3 Evidence-locked
- Missing evidence → `null` (core) or low-confidence claim (deep).
- Every non-null includes `{source_url + evidence_quote + anchor/span}`.

---

## 1) Discovery layer (now explicitly depends on Discovery v2)

Hybrid v3.1 assumes Discovery v2 is in place:

- **SourceRegistry + HostPolicy**
  - tier expansion: `manufacturer`, `retailer`, `lab`, `database`, `community`
  - authority + doc_kind + field_affinity metadata
  - per-host pacing constraints
  - `connector_only` / `blocked_in_search` flags

- **ProviderCapabilities + QueryCompiler**
  - compile `site:` / `filetype:` / time filters per provider
  - fall back to lexical constraints when unsupported

- **EffectiveHostPlan** is the truth object
  - discovery, scoring, UI explain, and repair all depend on it

---

## 2) What to build to maximize accuracy (the real driver)

### 2.1 Core vs Deep enforcement
Implement acceptance rules:
- **Core facts:** Tier1/Tier2 or corroboration.
- **Deep fields:** allow methodology-grade labs, stored as claims.
- **Community:** never overwrite core facts.

### 2.2 Claim clustering for deep numeric fields

---

## 2.3 Optional: Downloaded/local AI (text + vision) — bounded helpers

You can run **downloaded models** locally to reduce cost and improve throughput, but they must be treated as **helpers**, not authorities.

### Recommended roles
**Local text model (Qwen3-class):**
- query intent synonym expansion (bounded)
- evidence triage (what to read first)
- chunk/page routing for big PDFs/manuals
- fast “does this snippet contain X?” classification

**Local vision model (Qwen2.5-VL-class):**
- Phase 08 visual capture triage: does this screenshot contain a spec table / model label / tech specs section?
- prioritize which captures go through expensive parsing/LLM steps

### Guardrails (keep accuracy intact)
- Local AI cannot publish fields directly.
- Local AI cannot introduce new hosts/domains/URLs.
- All local outputs must be JSON-schema validated and logged as advisory.
- Core vs Deep enforcement remains the final gate.

### Operational constraints (so concurrency doesn’t collapse)
- Run local AI behind a small queue: `LOCAL_AI_MAX_CONCURRENT=1..2`
- Per-call timeouts: `LOCAL_AI_TIMEOUT_MS=6000..12000`
- If queue is saturated, skip local AI and continue deterministic flow.

### Env knobs
- `LOCAL_AI_ENABLED=false`
- `LOCAL_AI_ENDPOINT=http://127.0.0.1:8000`
- `LOCAL_TEXT_MODEL=qwen3`
- `LOCAL_VLM_MODEL=qwen2.5-vl`
- `LOCAL_AI_MAX_CONCURRENT=1`
- `LOCAL_AI_TIMEOUT_MS=8000`


For latency fields:
- cluster values within tolerance
- output median/range + number of sources
- retain outliers with notes (firmware/variant differences)

---

## 3) Index what compounds (required for throughput)

### 3.1 QueryIndex
Store:
- query text + provider
- result set summary
- downstream yield attribution (which fields were filled)

### 3.2 URLIndex
Store:
- URL fetch outcomes + last success
- tier + doc_kind
- which fields it filled
- tags: “high-yield for X field”

### 3.3 PromptIndex
Store:
- versioned prompts per route
- yield + error rates

---

## 4) Community ingestion (do not depend on HTML crawling)

### 4.1 Add Reddit ingest connector
- pull post + top comments + metadata
- treat as Tier4
- output deep fields as claims

### 4.2 Mark community sources correctly in SourceRegistry
- If a site is connector-only, set `connector_only: true`.
- Avoid planning `site:` queries against it.

---

## 5) Parsing upgrades (big recall + cost wins)

Implement as a router stack:
- Trafilatura pre-cleaner for HTML
- Unstructured partition backend for PDFs
- Apache Tika fallback for odd formats

### 5.1 Evidence quote anchoring
Store each quote with:
- content hash
- offset/span (or DOM selector)
- small context window

---

## 6) Operations (15–20/day)

### 6.1 Caching + conditional requests
- cache by URL + content hash
- revalidate with ETag/Last-Modified when available
- dedupe PDFs across products

### 6.2 Static-first, dynamic-only-when-needed
Use headless rendering only when static parsing yields insufficient evidence.

---

## 7) Baseline env overrides (Hybrid v3.1)

```env
# --- IndexLab Mice Hybrid v3.1 baseline ---

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

## 8) What to measure

Per product:
- field fill rate (core vs deep)
- wrong-value rate (manual audit)
- avg URLs fetched
- searches per product (should fall over time due to URLIndex)
- block/challenge rate by host
- deep claim corroboration stats
