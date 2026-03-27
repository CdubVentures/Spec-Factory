# Prefetch Pipeline Overview

Validated: 2026-03-23 (vertical slicing complete — all pipeline modules moved to `src/features/indexing/pipeline/`. Event/scope names, stage labels, and schema terminology updated to semantic names. Manufacturer sources removed from static config. Plain English overview merged from visual-audit).

Architecture audit: 2026-03-22 (P0-P4). Schema enforcement: 2026-03-23 (P5). See `PIPELINE-CONTRACT-AUDIT.md` for full results.

**P5 summary (2026-03-23):** Cumulative pipeline context schema replaces per-stage schemas. All 11 LLM adapter schemas unified to Zod. Enforcement mode with `pipelineSchemaEnforcementMode` registry knob (`off`/`warn`/`enforce`). Orchestrator mutations removed. Hardcoded crawl config extracted to registry. Live-tested in enforce mode — zero validation failures.

Source of truth:

- `src/features/indexing/pipeline/orchestration/runDiscoverySeedPlan.js` — 8-phase orchestrator with cumulative context accumulation + schema validation at each boundary
- `src/features/indexing/pipeline/orchestration/pipelineContextSchema.js` — **SSOT for pipeline contracts** (cumulative Zod schema with 8 progressive checkpoints, typed sub-schemas, enforcement mode)
- `src/features/indexing/pipeline/needSet/runNeedSet.js`
- `src/features/indexing/pipeline/brandResolver/runBrandResolver.js`
- `src/features/indexing/pipeline/searchProfile/runSearchProfile.js`
- `src/features/indexing/pipeline/searchPlanner/runSearchPlanner.js`
- `src/features/indexing/pipeline/queryJourney/runQueryJourney.js`
- `src/features/indexing/pipeline/searchExecution/executeSearchQueries.js`
- `src/features/indexing/pipeline/resultProcessing/processDiscoveryResults.js` (orchestrator, 344 LOC)
- `src/features/indexing/pipeline/resultProcessing/resultTraceBuilder.js` (trace lifecycle)
- `src/features/indexing/pipeline/resultProcessing/resultClassifier.js` (URL/domain classification)
- `src/features/indexing/pipeline/resultProcessing/resultPayloadBuilder.js` (SERP explorer + payloads)

## 8-Phase Pipeline Flow (NeedSet + Brand Resolver parallel)

```text
         +-- NeedSet phase -------+
Start -->|                        +--> Search Profile phase --> Search Planner --> Query Journey --> Search Execution --> Result Processing --> Domain Classifier
         +-- Brand Resolver phase-+
                                 ^
                          convergence point
```

```text
NeedSet phase           - NeedSet assessment -> Search planning context -> Search plan (LLM-annotated) group annotations (no queries)
Brand Resolver phase    - brand domain, aliases, support domain, auto-promotion
  (NeedSet + Brand Resolver run in parallel via Promise.all -- neither depends on the other's output)
Search Profile phase    - CONVERGENCE POINT: first phase requiring both NeedSet + Brand outputs
                          tier-aware deterministic query generation, returns { searchProfileBase }
Search Planner phase    - tier-aware LLM query enhancement via enhanceQueryRows
Query Journey phase     - dedupe, rank, guard, cap, write planned search_profile
Search Execution phase  - internal/frontier/provider execution
Result Processing phase - selector path or deterministic lane-selection path
Domain Classifier phase - enqueue approved/candidate URLs to planner queue
```

Every phase runs. There is no branching between phases. Conditional behavior stays inside the phase that owns it. NeedSet and Brand Resolver are the only parallel pair -- all subsequent phases are strictly sequential. See `03-pipeline-context.json` for the full accumulated state at convergence.

---

## What This Pipeline Does (One Paragraph)

When Spec Factory needs to find specifications for a product (e.g., "Logitech G Pro X Superlight 2"), this pipeline figures out **what data is missing**, **where to look**, **what to search for**, **which results to keep**, and **how to get smarter on each retry**. It runs in rounds — each round builds on what previous rounds found, progressively narrowing its search from broad seed queries down to surgical per-field lookups.

---

## The 8 Phases at a Glance

| Phase | Name | One-Liner | LLM? |
|-------|------|-----------|------|
| NeedSet | **NeedSet** | "What fields are we still missing? How hard is each one to find?" | Yes (assessment only) |
| Brand Resolver | **Brand Resolver** | "What is the official website for this brand?" | Yes (cache miss only) |
| Search Profile | **Search Profile** | "Generate the actual search queries, tagged by tier." | No (deterministic) |
| Search Planner | **Search Planner** | "Polish those queries with an LLM to make them better." | Yes |
| Query Journey | **Query Journey** | "Deduplicate, rank, guard, cap, and finalize the query list." | No (deterministic) |
| Search Execution | **Search Execution** | "Run the queries against Google / SearXNG / internal corpus." | No |
| Result Processing | **Result Processing** | "Which search results are worth scraping?" | Optional LLM |
| Domain Classifier | **Domain Classifier** | "Enqueue approved URLs into the scraping pipeline." | No |

**NeedSet and Brand Resolver run in parallel** — neither needs the other's output. Search Profile is the convergence point that needs both.

---

## NeedSet Phase — "What Do We Still Need?"

### Plain English

NeedSet looks at every field the category defines (weight, sensor DPI, polling rate, etc.) and asks: "Do we already have a good value for this? If not, how hard will it be to find?"

It does **not** generate search queries. It produces a prioritized shopping list that downstream phases use to build queries.

### Three Layers

**Layer 1 — Per-Field Gap Check (NeedSet assessment, deterministic)**

For every field in the category:
- Is it `covered` (we have a good value), `missing`, `weak` (low confidence), or `conflict` (contradictory values)?
- Why is it unresolved? (never searched, low confidence, not enough references, conflicting sources)
- How many times have we already searched for it? (`repeat_count`)
- What aliases does it have? ("DPI" = "dots per inch" = "optical resolution")
- How easy is it to find? (`easy` / `medium` / `hard`)
- How commonly do spec sheets include it? (`always` / `expected` / `sometimes` / `rare`)

**Layer 2 — Group Planning (Search planning context, deterministic)**

Fields are organized into groups (e.g., "sensor specs", "physical dimensions", "connectivity"). For each group:
- What percentage of its fields are already resolved? (`coverage_ratio`)
- Is this group worth doing a broad search for? (Yes if: coverage < 80%, at least 3 missing fields, and we haven't already done 3 group searches)
- How productive would searching this group be? (`productivity_score` — easy + common + untried = higher)
- Which individual keys should we search if the group isn't worth a broad search?

**Layer 3 — LLM Assessment (Search plan, LLM-annotated)**

An LLM reviews the groups and says: "This group should be searched now / next round / put on hold." It does NOT generate queries — it only provides priority annotations.

### What Comes Out

A clean three-field return:
- `focusGroups` — the prioritized group list with per-key queues
- `seedStatus` — whether broad "specs" searches are still needed
- `seedSearchPlan` — assessment metadata for the GUI

---

## Brand Resolver Phase — "Where Is the Official Site?"

### Plain English

Given a brand name like "Logitech," this phase finds the official website (`logitech.com`), any aliases, and a support domain. It checks a cache first — the LLM only fires on a cache miss.

Brand Resolver is the SOLE source of manufacturer domain data per product. There are no static manufacturer domain lists — `sources.json` `approved.manufacturer` arrays are empty for all categories.

### How It Works

1. Check the cache for this brand + category combo
2. **Cache hit** -> return the stored domain and confidence (typically 0.8)
3. **Cache miss** -> ask an LLM: "What is the official domain for Logitech in the mouse category?"
4. Store the result for next time
5. If the LLM fails or returns no domain -> confidence = null, continue without it

### What the Orchestrator Does With It

After Brand Resolver returns, the orchestrator (not the phase itself) promotes the official domain into `categoryConfig.sourceHosts` as a manufacturer source with a crawl configuration. This means the official site becomes a searchable source for all subsequent phases.

---

## Search Profile Phase — "Build the Actual Queries"

### Plain English

This is the first phase that needs output from BOTH NeedSet and Brand Resolver. It is fully deterministic — no LLM. It takes the NeedSet's prioritized field list and generates actual search query strings, tagged by tier.

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

## Search Planner Phase — "Polish the Queries With an LLM"

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

## Query Journey Phase — "Finalize the Query List"

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
- A persisted "planned" search profile artifact (later rewritten to "executed" after Result Processing)

---

## Search Execution Phase — "Run the Queries"

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

## Result Processing Phase — "Which Results Are Worth Scraping?"

### Plain English

Takes the raw search results and decides which URLs are worth actually fetching and extracting data from.

The triage flow (decomposed into 4 files in P3):
1. Hard-drop filter: Remove non-HTTPS, denied hosts, utility shells (video filtering done upstream by Search Results)
2. Classify and deduplicate URLs (`resultClassifier.js`)
3. Deterministic domain safety heuristics (`resultClassifier.js`)
4. LLM selector picks which URLs to keep (deterministic reranker fallback on LLM failure)
5. Enrich candidate traces with reason codes (`resultTraceBuilder.js`)
6. Build SERP explorer and write payloads (`resultPayloadBuilder.js`)

### What Comes Out

- `candidates` — the selected URLs to scrape (both "approved" and "candidate" status)
- Rewrites the search profile from "planned" to "executed"

---

## Domain Classifier Phase — "Send to Scraping"

### Plain English

Enqueues the approved URLs into the planner queue for actual page fetching and data extraction. Seeds candidate URLs when the `fetchCandidateSources` setting is enabled.

---

## Three-Tier Search Model (V4)

The discovery search system operates on three query tiers. NeedSet's job is to rank groups by easiest/most productive, compute a budget-aware tier allocation from `searchProfileQueryCap`, and tell Search Profile "you have N slots — spend them like this." When those groups are checked off, NeedSet surfaces the next batch. Search Profile and Search Planner write the actual queries.

### Tier 1 — Broad Seeds (fire once, cooldown)
- `{brand} {model} {variant} specifications`
- `{brand} {model} {variant} {source}`
- Query completion model: 1 query = parent, up to 10 SERP URLs = children. Parent done only when child scrape work done.
- Complete when: `scrape_complete` or `exhausted` AND `new_fields_closed >= 1`
- Cooldown: `seedCooldownMs` (default 30 days) via Unix timestamp comparison
- NeedSet emits `seed_status` with per-seed `last_status`, `cooldown_until_ms`, `new_fields_closed_last_run`
- Source seeds include: category source hosts (`categoryConfig.sourceHosts`), identity official/support domains, and previously executed seed queries from frontier

### Tier 2 — Group Searches (conditional)
- `{brand} {model} {variant} {group} {description}`
- NeedSet computes `group_search_worthy` using `group_query_count` (actual Tier 2 broad searches, NOT sum of key retries)
- Skip reasons: `group_mostly_resolved` (coverage >= 80%), `too_few_missing_keys` (< 3 unresolved), `group_search_exhausted` (>= 3 broad searches), `group_on_hold`
- Two-level fingerprint: `group_fingerprint_coarse` (stable = group_key) for broad suppression, `group_fingerprint_fine` (group_key + sorted keys) for "meaningfully different?"

### Tier 3 — Individual Key Searches (progressive enrichment per-key)
- Enriched based on per-key `repeat_count` (not round number):
  - 3a (repeat=0): `{brand} {model} {variant} {key}` — bare
  - 3b (repeat=1): `+ aliases` — cumulative from here forward
  - 3c (repeat=2): `+ untried domain hint`
  - 3d (repeat=3+): `+ untried content type`
- `repeat_count` tracked via `query_count` in `previousFieldHistories`, incremented by `buildFieldHistories()` at finalization
- NeedSet emits enriched `normalized_key_queue` objects with per-key: `normalized_key`, `repeat_count`, `all_aliases`, `domain_hints`, `preferred_content_types`, `domains_tried_for_key`, `content_types_tried_for_key`
- Queue sorted by: availability -> difficulty -> repeat -> need_score -> required_level

### Query Execution History
Structured per-query tracking with `tier`, `group_key`, `normalized_key`, `hint_source` persisted by `frontierDb.recordQuery()` at fire-time via `resolveSelectedQueryRow()` in `executeSearchQueries.js`. `runDiscoverySeedPlan` calls `frontierDb.buildQueryExecutionHistory(productId)` before NeedSet and passes the result through `runNeedSet` to `buildSearchPlanningContext`.

### Field History Feedback Loop
`runUntilComplete.js` extracts `previousFieldHistories` from `roundResult.needSet.fields[].history` via `buildPreviousFieldHistories()` after each round completes. This is passed in `roundContext` to the next round's `computeNeedSet()`, enabling `repeat_count` accumulation, `domains_tried_for_key` tracking, and progressive Tier 3 enrichment.

## Canonical runtime order

`runDiscoverySeedPlan()`:
1. Load enabled source entries and normalize planning hints.
2. Force `discoveryEnabled=true` and default empty `searchEngines` to `bing,google`.
3. **NeedSet + Brand Resolver (parallel via Promise.all):**
   - NeedSet phase and Brand Resolver phase fire simultaneously -- neither depends on the other's output. Wall-clock time saved equals the shorter of the two calls.
   - NeedSet phase:
     - `computeNeedSet()` builds the NeedSet assessment.
     - `buildSearchPlanningContext()` builds the search planning context (includes `seed_status`, `focus_groups` with V4 tier signals, budget-aware `tier_allocation`, expanded `pass_seed`). Receives `queryExecutionHistory` for round-over-round awareness.
     - `assembleSearchPlan()` builds the search plan (LLM-annotated) -- LLM assesses groups (`reason_active`, `planner_confidence`) but does NOT generate queries. `search_plan_handoff.queries` is always empty.
     - `runNeedSet()` emits `needset_computed` twice when the search plan succeeds:
       - `scope: needset_assessment` before the search plan LLM call
       - `scope: search_plan` after panel is assembled. Panel `profile_influence` shows budget-aware targeting: `targeted_specification`, `targeted_sources`, `targeted_groups`, `targeted_single` (allocation-based), plus `budget`, `allocated`, `overflow_groups`, `overflow_keys`.
   - Brand Resolver phase:
     - `runBrandResolver()` resolves brand domains in parallel with NeedSet.
     - manufacturer auto-promotion happens here when enabled.
4. Orchestrator convergence glue (between NeedSet+Brand Resolver and Search Profile):
   - Apply brand promotions to `categoryConfig` (sourceHosts, sourceHostMap, approvedRootDomains, sourceRegistry). The phase returns pure data; the orchestrator owns the mutation.
   - `resolveJobIdentity(job)` builds `variables` object (`brand`, `model`, `variant`, `category`).
   - Normalize `missingFields` from `fieldOrder` and provenance.
   - `loadLearningStoreHintsForRun()` loads learning artifacts from storage.
   - `mergeLearningStoreHints()` produces `enrichedLexicon`.
   - `resolveSearchProfileCaps(config)` produces `searchProfileCaps`.
   - Build `identityLock` from `job.identityLock` or `job` fields (`brand`, `model`, `variant`, `productId`).
   - These feed Search Profile, Search Planner, and several downstream phases.
   - This is inline orchestrator logic, not a separate phase module.
   - See `03-pipeline-context.json` for the full accumulated state at this convergence point.
5. Search Profile phase:
   - `runSearchProfile()` receives `seedStatus` and `focusGroups` from NeedSet.
   - `buildSearchProfile()` calls `determineQueryModes()` to decide which tiers fire, then runs `buildTier1Queries`, `buildTier2Queries`, `buildTier3Queries` as appropriate. Fully deterministic, no LLM.
6. Search Planner phase:
   - `enhanceQueryRows()` receives tier-tagged `query_rows` from Search Profile + query history.
   - LLM enhances query strings while preserving tier metadata (tier, group_key, normalized_key, target_fields are passthrough).
   - Fallback: no API key, no model, or LLM fails twice -> returns rows unchanged as `deterministic_fallback`.
   - `search_plan_generated` emitted when LLM succeeds.
7. Query Journey phase:
   - receives enhanced rows from Search Planner (LLM-enhanced or deterministic fallback — treated identically).
   - dedupe, rank by field priority, cap to `searchProfileQueryCap`, identity guard.
   - write planned `search_profile`.
   - emit `query_journey_completed`.
8. Emit `search_queued` rows before Search Execution so every search slot is visible before execution starts.
9. Search Execution phase:
   - `executeSearchQueries()` runs internal-first lookup, frontier reuse, live provider search, and plan-only fallback.
10. Result Processing phase:
   - `processDiscoveryResults()` performs deterministic domain classification.
   - LLM selector path selects URLs (selector is the only triage path).
11. Attach `seed_search_plan_output` to the discovery result when the search plan exists.
12. Domain Classifier phase:
   - `runDomainClassifier()` enqueues approved URLs and seeds candidate URLs.

`discoverCandidateSources()` remains as a compatibility entrypoint for direct callers and tests. It still mirrors the same phase logic, but the canonical GUI-facing pipeline is the phase-based orchestrator above.

## Logical tab order vs event order

Logical tab order:

```text
needset -> brand_resolver -> search_profile -> search_planner ->
query_journey -> search_results -> serp_triage -> domain_classifier
```

Actual key runtime event order on the canonical path:

```text
needset_computed (scope: needset_assessment)    — NeedSet phase, before search plan LLM call
brand_resolved                                  — Brand Resolver phase, parallel with NeedSet
needset_computed (scope: search_plan)           — NeedSet phase, after search plan LLM completes
search_profile_generated                        — Search Profile phase, deterministic profile built
search_plan_generated                           — Search Planner phase, after LLM enhancement (or deterministic fallback)
query_journey_completed                         — Query Journey phase, final query selection written
search_queued                                   — orchestrator, pre-Search Execution GUI slot allocation
discovery_query_started                         — Search Execution phase, per-query
discovery_query_completed                       — Search Execution phase, per-query
serp_selector_completed                         — Result Processing phase, after LLM selector path completes
domains_classified                              — Result Processing phase, after domain classification (runs AFTER selector)
discovery_enqueue_summary                       — Domain Classifier phase, planner queue handoff
```

Important nuance: `search_profile_generated` is emitted by `runSearchProfile.js` (Search Profile phase) when the deterministic profile is built. The planned artifact (with status `'planned'`) is written later by Query Journey phase via `writeSearchProfileArtifacts()`. The GUI maps the Search Profile event to the Search Profile tab.

## LLM surfaces

| Phase | Tab / Worker | Reason | Role | Owner |
|-------|--------------|--------|------|-------|
| NeedSet | needset | `needset_search_planner` | `plan` | `src/indexlab/searchPlanBuilder.js` (group annotations only, no queries) |
| Brand Resolver | brand_resolver | `brand_resolution` | `triage` | `src/features/indexing/pipeline/brandResolver/brandResolverLlmAdapter.js` |
| Search Planner | search_planner | `search_planner_enhance` | `plan` | `src/research/queryPlanner.js` (`enhanceQueryRows`) |
| Result Processing | serp_triage | `serp_url_selector` | `triage` | `src/features/indexing/pipeline/resultProcessing/serpSelectorLlmAdapter.js` |
| Result Processing | serp_triage | `uber_serp_reranker` | `plan` | `src/research/serpReranker.js` |

`serp_triage` is a shared GUI tab/call-type bucket. In the live code, Result Processing may use the selector, the reranker, neither, but never both at the same time on the same branch.

## Query Journey merge

One input stream:

- **Enhanced rows** from Search Planner — same rows as `searchProfileBase.query_rows` but with potentially LLM-rewritten `query` strings. If LLM failed, these are exact copies of the deterministic rows. Tagged with `tier: 'seed' | 'group_search' | 'key_search'` and `hint_source` ending in `_llm` when LLM-enhanced.

Then:

- `dedupeQueryRows(queryCandidates, searchProfileCaps.dedupeQueriesCap)`
- cap to `searchProfileQueryCap` via `.slice(0, mergedQueryCap)`
- `enforceIdentityQueryGuard()` with variant guard terms
- build `llm_queries` from rows where `hint_source` ends with `_llm`
- write planned `search_profile` via `writeSearchProfileArtifacts()`
- emit `query_journey_completed`

`searchProfilePlanned.llm_queries` contains only query texts from rows where `hint_source` ends with `_llm`. Empty when LLM failed.

## Search worker slots

Each planned query gets its own letter slot. Slots stay visible because the orchestrator emits `search_queued` before execution starts.

- Query 1 -> `search-a`
- Query 2 -> `search-b`
- Query 3 -> `search-c`
- ...up to 26 letters, then `search-overflow-N`

Canonical orchestrator behavior:

- `runDiscoverySeedPlan()` forces `queryConcurrency = 1`
- search execution is strictly sequential
- queued slots keep the GUI ball alive between queries

Compatibility behavior:

- direct `discoverCandidateSources()` callers also hardcode `queryConcurrency` to 1

Search workers cannot appear before `query_journey_completed` fires. The GUI gates the Search Results tab on query journey data.

## Phase ownership

NeedSet:
- `src/features/indexing/pipeline/needSet/runNeedSet.js`
- `src/indexlab/needsetEngine.js`
- `src/indexlab/searchPlanningContext.js`
- `src/indexlab/searchPlanBuilder.js`

Brand Resolver:
- `src/features/indexing/pipeline/brandResolver/runBrandResolver.js`
- `src/features/indexing/pipeline/brandResolver/resolveBrandDomain.js`
- `src/features/indexing/pipeline/brandResolver/brandResolverLlmAdapter.js`

Search Profile:
- `src/features/indexing/pipeline/searchProfile/runSearchProfile.js`
- `src/features/indexing/search/queryBuilder.js`

Search Planner:
- `src/features/indexing/pipeline/searchPlanner/runSearchPlanner.js`
- `src/research/queryPlanner.js` (`enhanceQueryRows`)

Query Journey:
- `src/features/indexing/pipeline/queryJourney/runQueryJourney.js`
- `src/features/indexing/pipeline/shared/queryPlan.js`

Search Execution:
- `src/features/indexing/pipeline/searchExecution/executeSearchQueries.js`
- `src/features/indexing/search/searchProviders.js`
- `src/features/indexing/search/searchGoogle.js`

Result Processing (decomposed in P3):
- `src/features/indexing/pipeline/resultProcessing/processDiscoveryResults.js` (orchestrator, 344 LOC)
- `src/features/indexing/pipeline/resultProcessing/resultTraceBuilder.js` (trace lifecycle)
- `src/features/indexing/pipeline/resultProcessing/resultClassifier.js` (URL/domain classification)
- `src/features/indexing/pipeline/resultProcessing/resultPayloadBuilder.js` (SERP explorer + payloads)
- `src/features/indexing/pipeline/resultProcessing/serpSelector.js`
- `src/features/indexing/pipeline/resultProcessing/serpSelectorLlmAdapter.js`
- `src/research/serpReranker.js`

Domain Classifier:
- `src/features/indexing/pipeline/domainClassifier/runDomainClassifier.js`

## Artifacts

Planned then executed `search_profile`:
- `_discovery/{category}/{runId}.search_profile.json`
- `{category}/{productId}/runs/{runId}/analysis/search_profile.json`
- `{category}/{productId}/latest/search_profile.json`

Post-triage payloads:
- `_discovery/{category}/{runId}.json`
- `_sources/candidates/{category}/{runId}.json`

Search screenshots:
- `{indexLabRoot}/{runId}/screenshots/google-serp-*.jpeg`

Seed-phase carry-through:
- `runDiscoverySeedPlan()` attaches `seed_search_plan_output` to the discovery result so finalization can reuse the search plan output without re-calling the NeedSet planner LLM. Note: the search plan no longer contains queries, only group annotations and tier metadata.

## Conditional behavior

- Brand resolution short-circuits on empty brand, cache hit, missing route key, or resolver error.
- NeedSet preview `needset_computed` emits before the search plan LLM call; the `search_plan` `needset_computed` event is conditional on the panel. Panel bundles do not carry queries. `profile_influence` shows budget-aware targeting counts (allocation-based when `tier_allocation` is present, aspirational fallback otherwise).
- Search Planner falls back to deterministic output when no `plan` route API key or no phase model is available.
- External search can be skipped when `discoveryInternalFirst` satisfies required-field pressure.
- Plan-only URLs are emitted only when there is no viable provider path and search results are still empty.
- Result Processing always runs the LLM selector (all candidates sent, output capped by `serpSelectorMaxKeep`). On LLM failure, falls back to deterministic reranker scoring.
- `serp_selector_completed` is emitted after the LLM selector path completes. There is no separate reranker path — the selector is the sole LLM triage mechanism.

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

## Feedback loops

Two separate feedback mechanisms serve different purposes:

### Per-run feedback (primary planning signals)

- **`previousFieldHistories`** — per-field retry counts, `domains_tried`, `content_types_tried`, `query_modes_tried_for_key`. Built by `buildFieldHistories()` at finalization, passed via `roundContext` to the next round's `computeNeedSet()`. Drives `repeat_count` accumulation, group exhaustion detection, and progressive Tier 3 enrichment.
- **`queryExecutionHistory`** — per-query completion state with `tier`, `group_key`, `normalized_key`, `status`, `completed_at_ms`. Built from `frontierDb.buildQueryExecutionHistory(productId)` before NeedSet. Drives seed completion, `group_query_count`, and budget-aware `tier_allocation`.

These are per-product, per-run, and reset between runs. They are the signals NeedSet and Search Planning Context use for all tier/phase/exhaustion decisions.

### Cross-product category learning (query generation only)

- **Bootstrap**: `loadLearningStoreHintsForRun()` reads from SQLite (`_learning/{category}/spec.sqlite`) when `selfImproveEnabled=true`. `loadLearningArtifacts()` reads `field_lexicon.json`, `query_templates.json`, `field_yield.json`.
- **Consumed by**: Search Profile phase only — `learnedQueries.templates_by_field` and `templates_by_brand` inject learned query templates. `enrichedLexicon` merges learning hints into the field lexicon. `fieldYieldByDomain` optionally informs domain-aware query generation.
- **Not consumed by**: NeedSet planner (`runNeedSet()` passes `learning: null` into `buildSearchPlanningContext()`), Search Planner LLM, or Result Processing.
- **Finalization writeback**: `persistSelfImproveLearningStores()` writes domain/field yield, URL memory, field anchors, and component lexicon to SQLite when `selfImproveEnabled=true` and there are accepted updates.

Category learning captures cross-product patterns (e.g., "for mice, sensor DPI is found on spec sheets") that accumulate over time with configurable decay. It influences which query templates Search Profile generates, but does not influence NeedSet's tier allocation or group exhaustion logic.

## Mermaid Diagram Index

| File | What It Shows |
|------|---------------|
| `visual-audit/01-full-pipeline-flow.mmd` | All 8 phases, parallel paths, convergence point |
| `visual-audit/02-needset-three-layers.mmd` | NeedSet's assessment -> planning context -> search plan pipeline |
| `visual-audit/03-three-tier-search-model.mmd` | How Tier 1, 2, 3 queries are structured and when they fire |
| `visual-audit/04-tier-progression-across-rounds.mmd` | How searches grow from Round 0 through convergence |
| `visual-audit/05-history-tracking-feedback-loops.mmd` | Per-query, per-field, per-URL, and cross-product history |
| `visual-audit/06-tier3-progressive-enrichment.mmd` | Tier 3 repeat_count progression (3a -> 3b -> 3c -> 3d) |
