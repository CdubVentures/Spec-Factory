# Discovery Pipeline — Plain English Audit

> Generated 2026-03-22. Verified against live code with line numbers.
> Updated 2026-03-22: P0 SSOT fixes complete. P1 complete (field_history persistence, fetch drain timeout, Zod schemas). P2 re-audited (all findings resolved). P3 complete (processDiscoveryResults decomposed 674→344 LOC). Legacy archetype pipeline removed — tier-only is sole query generation path. See `PIPELINE-CONTRACT-AUDIT.md` for full audit.

---

## What This Pipeline Does (One Paragraph)

When Spec Factory needs to find specifications for a product (e.g., "Logitech G Pro X Superlight 2"), this pipeline figures out **what data is missing**, **where to look**, **what to search for**, **which results to keep**, and **how to get smarter on each retry**. It runs in rounds — each round builds on what previous rounds found, progressively narrowing its search from broad seed queries down to surgical per-field lookups.

---

## The 8 Stages at a Glance

| # | Stage | One-Liner | LLM? |
|---|-------|-----------|------|
| 01 | **NeedSet** | "What fields are we still missing? How hard is each one to find?" | Yes (assessment only) |
| 02 | **Brand Resolver** | "What is the official website for this brand?" | Yes (cache miss only) |
| 03 | **Search Profile** | "Generate the actual search queries, tagged by tier." | No (deterministic) |
| 04 | **Search Planner** | "Polish those queries with an LLM to make them better." | Yes |
| 05 | **Query Journey** | "Deduplicate, rank, guard, cap, and finalize the query list." | No (deterministic) |
| 06 | **Search Execution** | "Run the queries against Google / SearXNG / internal corpus." | No |
| 07 | **SERP Triage** | "Which search results are worth scraping?" | Optional LLM |
| 08 | **Domain Classifier** | "Enqueue approved URLs into the scraping pipeline." | No |

**Stages 01 and 02 run in parallel** — neither needs the other's output. Stage 03 is the convergence point that needs both.

---

## Stage 01: NeedSet — "What Do We Still Need?"

### Plain English

NeedSet looks at every field the category defines (weight, sensor DPI, polling rate, etc.) and asks: "Do we already have a good value for this? If not, how hard will it be to find?"

It does **not** generate search queries. It produces a prioritized shopping list that downstream stages use to build queries.

### Three Layers

**Layer 1 — Per-Field Gap Check (Schema 2, deterministic)**

For every field in the category:
- Is it `covered` (we have a good value), `missing`, `weak` (low confidence), or `conflict` (contradictory values)?
- Why is it unresolved? (never searched, low confidence, not enough references, conflicting sources)
- How many times have we already searched for it? (`repeat_count`)
- What aliases does it have? ("DPI" = "dots per inch" = "optical resolution")
- How easy is it to find? (`easy` / `medium` / `hard`)
- How commonly do spec sheets include it? (`always` / `expected` / `sometimes` / `rare`)

**Layer 2 — Group Planning (Schema 3, deterministic)**

Fields are organized into groups (e.g., "sensor specs", "physical dimensions", "connectivity"). For each group:
- What percentage of its fields are already resolved? (`coverage_ratio`)
- Is this group worth doing a broad search for? (Yes if: coverage < 80%, at least 3 missing fields, and we haven't already done 3 group searches)
- How productive would searching this group be? (`productivity_score` — easy + common + untried = higher)
- Which individual keys should we search if the group isn't worth a broad search?

**Layer 3 — LLM Assessment (Schema 4)**

An LLM reviews the groups and says: "This group should be searched now / next round / put on hold." It does NOT generate queries — it only provides priority annotations.

### What Comes Out

A clean three-field return:
- `focusGroups` — the prioritized group list with per-key queues
- `seedStatus` — whether broad "specs" searches are still needed
- `seedSearchPlan` — assessment metadata for the GUI

---

## Stage 02: Brand Resolver — "Where Is the Official Site?"

### Plain English

Given a brand name like "Logitech," this stage finds the official website (`logitech.com`), any aliases, and a support domain. It checks a cache first — the LLM only fires on a cache miss.

### How It Works

1. Check the cache for this brand + category combo
2. **Cache hit** → return the stored domain and confidence (typically 0.8)
3. **Cache miss** → ask an LLM: "What is the official domain for Logitech in the mouse category?"
4. Store the result for next time
5. If the LLM fails or returns no domain → confidence = 0, continue without it

### What the Orchestrator Does With It

After Brand Resolver returns, the orchestrator (not the stage itself) promotes the official domain into `categoryConfig.sourceHosts` as a manufacturer source with a crawl configuration. This means the official site becomes a searchable source for all subsequent stages.

---

## Stage 03: Search Profile — "Build the Actual Queries"

### Plain English

This is the first stage that needs output from BOTH NeedSet and Brand Resolver. It is fully deterministic — no LLM. It takes the NeedSet's prioritized field list and generates actual search query strings, tagged by tier.

### The Three Tiers

**Tier 1 — Broad Seeds** (fire once per product, then cooldown)
- Query: `"Logitech G Pro X Superlight 2 specifications"`
- Query: `"Logitech G Pro X Superlight 2 rtings.com"` (per needed source)
- Purpose: Cast the widest net. Usually fills 40-60% of fields on first hit.
- When: Only when `seedStatus` says seeds are still needed (not on cooldown)

**Tier 2 — Group Searches** (for under-covered groups)
- Query: `"Logitech G Pro X Superlight 2 sensor specs DPI max tracking speed lift-off distance"`
- Purpose: Target a whole group of related fields at once
- When: Group has < 80% coverage, 3+ missing fields, and < 3 prior group searches
- Sorted by: `productivity_score` (easy + common + untried fields score highest)

**Tier 3 — Individual Key Searches** (per-field, progressive enrichment)
- Query evolves with each retry:
  - **First try (repeat=0):** `"Logitech G Pro X Superlight 2 weight"`
  - **Second try (repeat=1):** `"Logitech G Pro X Superlight 2 weight grams mass"` (adds aliases)
  - **Third try (repeat=2):** `"Logitech G Pro X Superlight 2 weight grams rtings.com"` (adds untried domain)
  - **Fourth try (repeat=3+):** `"Logitech G Pro X Superlight 2 weight teardown measured"` (varies phrasing family)
- Each retry is cumulative and uses previously untried search angles

### All Three Tiers Can Be Active Simultaneously

A single round can fire Tier 1 seeds, Tier 2 group searches, AND Tier 3 individual key searches — they are independent.

---

## Stage 04: Search Planner — "Polish the Queries With an LLM"

### Plain English

Takes the tier-tagged queries from Search Profile and passes them through an LLM to improve the wording. The tier metadata (tier tag, group key, target fields) passes through unchanged — only the query text can change.

### LLM Latitude by Tier

| Tier | Freedom | Example |
|------|---------|---------|
| **Tier 1 (Seeds)** | Almost none | Minor cleanup only. Don't restructure. |
| **Tier 2 (Groups)** | Moderate | Tighten description, remove redundant words, pick better search angle |
| **Tier 3 (Keys)** | Maximum | Add aliases, vary phrasing, pick different angles based on what's been tried |

### Tier 3 Sub-Rules

The LLM receives the full history of what's been tried for each key and is told:
- **repeat=0:** Pick the best alias combination for a clean first search
- **repeat=1:** Use a DIFFERENT alias combination than the base query
- **repeat=2:** Add an UNTRIED domain as a bias term (don't repeat `domains_tried`)
- **repeat=3+:** Get creative — vary the phrasing family (teardown, benchmark, review, spec sheet, comparison)

### If the LLM Fails

Falls back to the original deterministic queries. No `_llm` suffix added to `hint_source`. The pipeline continues either way.

---

## Stage 05: Query Journey — "Finalize the Query List"

### Plain English

This is the last checkpoint before queries actually execute. It deduplicates, ranks by field priority, applies an identity guard (every query must mention the brand and model), caps the total count, and persists the planned search profile.

### Identity Guard

Every query must contain the brand token and model token. Queries that don't are rejected with a reason:
- `missing_brand_token`
- `missing_model_token`
- `missing_required_digit_group` (e.g., model has "2" in the name, query dropped it)
- `foreign_model_token` (query mentions a different model)

### What Comes Out

- Final list of queries to execute
- A persisted "planned" search profile artifact (later rewritten to "executed" after Stage 07)

---

## Stage 06: Search Execution — "Run the Queries"

### Plain English

Executes the finalized queries against configured search providers:
- **Google** via Crawlee browser automation
- **SearXNG** for non-Google engines
- **Internal corpus** first, if enabled (check internal data before going to the internet)
- **Frontier cache** reuse (if we've already searched this exact query recently, reuse results)

Queries run sequentially (concurrency = 1 in canonical mode) to avoid rate limiting.

### What Comes Out

Raw search result rows — each with a URL, title, snippet, provider name, and tier metadata from the original query.

---

## Stage 07: SERP Triage — "Which Results Are Worth Scraping?"

### Plain English

Takes the raw search results and decides which URLs are worth actually fetching and extracting data from. Two paths:

The triage flow (decomposed into 4 files in P3):
1. Hard-drop filter: Remove non-HTTPS, denied hosts, cooldown violations
2. Classify and deduplicate URLs (`discoveryResultClassifier.js`)
3. Deterministic domain safety heuristics (`discoveryResultClassifier.js`)
4. LLM selector picks which URLs to keep (the only triage path — no deterministic fallback)
5. Enrich candidate traces with reason codes (`discoveryResultTraceBuilder.js`)
6. Build SERP explorer and write payloads (`discoveryResultPayloadBuilder.js`)

### What Comes Out

- `candidates` — the selected URLs to scrape (both "approved" and "candidate" status)
- Rewrites the search profile from "planned" to "executed"

---

## Stage 08: Domain Classifier — "Send to Scraping"

### Plain English

Enqueues the approved URLs into the planner queue for actual page fetching and data extraction. Seeds candidate URLs when the `fetchCandidateSources` setting is enabled.

---

## How History Is Tracked

### Per-Query History

Every query that executes gets recorded in the **frontier database** with:
- `query_hash` — deterministic hash of the query text
- `status` — `never_run` / `searched` / `scrape_complete` / `exhausted`
- `results_returned` — how many results the search engine gave
- `admitted_count` — how many results passed triage
- `fields_extracted_unique` — how many new field values were found
- `new_fields_closed` — how many fields went from unknown to resolved

This history is loaded as `queryExecutionHistory` at the start of each round and drives:
- Seed completion checks (did the seed query find anything new?)
- Group query counting (how many broad searches has this group had?)
- Tier allocation budgets

### Per-Field History

Each field accumulates its own search history via `previousFieldHistories`:
- `query_count` — how many times this field was directly searched (becomes `repeat_count`)
- `existing_queries` — exact query strings used
- `domains_tried` — which domains were used as bias terms
- `content_types_tried` — which content types were used
- `urls_examined_count` — how many pages were checked for this field
- `refs_found` — how many references were found
- `no_value_attempts` — how many searches returned zero useful values

This drives **Tier 3 progressive enrichment** — each retry adds new angles based on what hasn't been tried.

**Crash recovery (P1):** Field histories are persisted to the `field_history` table in specDb at the end of each round (inside the `exportToSpecDb()` transaction, atomic with all other writes). On startup, `runUntilComplete.js` loads histories from DB if available. In-memory handoff remains the fast path between rounds within the same process; DB read is the crash-recovery path.

### Per-URL History

URLs are tracked through the frontier database:
- Deduplication prevents re-scraping the same URL
- Scrape status (pending / complete / failed) determines if a URL needs revisiting
- Field extraction results are linked back to the source URL

### Cross-Product Learning (Category-Level)

When `selfImproveEnabled`:
- Domain/field yield: "For mice, rtings.com tends to have sensor DPI data"
- URL memory: "This URL was useful for weight data"
- Field anchors: "The term 'optical resolution' maps to the DPI field"
- Component lexicon: "HERO 2 is a sensor"

This learning influences which query templates Search Profile generates but does NOT influence NeedSet's tier decisions.

---

## How Searches Grow and Expand Across Rounds

### Round 0 (First Run)

1. NeedSet sees all fields as `missing` (no history)
2. Tier 1 seeds fire: broad "specifications" queries
3. Tier 2 groups fire for all groups with 3+ fields
4. No Tier 3 yet (nothing has `repeat_count > 0`)
5. Pages are scraped, fields are extracted
6. Typically fills 40-60% of fields

### Round 1

1. NeedSet sees which fields are now `covered` vs still `missing`
2. Tier 1 seeds may be on cooldown (if they found new fields last round)
3. Tier 2 groups only fire for groups still < 80% coverage
4. Tier 3 begins for individual fields that were searched but not found:
   - repeat=0 fields get bare key queries
   - The LLM picks the best alias combinations
5. History tracking records what domains and content types were tried

### Round 2+

1. Tier 1 usually on cooldown (30 days default)
2. Tier 2 groups that hit 3 searches move to exhausted — their individual keys fall to Tier 3
3. Tier 3 keys with repeat=1 get alias enrichment
4. Tier 3 keys with repeat=2 get domain hints (untried domains)
5. Tier 3 keys with repeat=3+ get creative phrasing (teardown, benchmark, review, comparison)
6. Each retry targets a different search angle, never repeating what was already tried

### Convergence

Eventually:
- All Tier 1 seeds are on cooldown
- All Tier 2 groups are either resolved (80%+) or exhausted (3 searches)
- Tier 3 keys with many retries produce diminishing returns
- The system reaches a steady state where further searching adds little value

---

## Mermaid Diagram Index

| File | What It Shows |
|------|---------------|
| `01-full-pipeline-flow.mmd` | All 8 stages, parallel paths, convergence point |
| `02-needset-three-layers.mmd` | NeedSet's Schema 2 → 3 → 4 pipeline |
| `03-three-tier-search-model.mmd` | How Tier 1, 2, 3 queries are structured and when they fire |
| `04-tier-progression-across-rounds.mmd` | How searches grow from Round 0 through convergence |
| `05-history-tracking-feedback-loops.mmd` | Per-query, per-field, per-URL, and cross-product history |
| `06-tier3-progressive-enrichment.mmd` | Tier 3 repeat_count progression (3a → 3b → 3c → 3d) |
