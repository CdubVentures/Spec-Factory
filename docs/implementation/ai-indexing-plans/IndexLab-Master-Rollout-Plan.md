**IndexLab Master Rollout Plan**

Collect-Then-Refine Architecture

*Replaces: 13-Phase Convergence Pipeline*

Date: March 2026

**1. Executive Decision**

IndexLab is being restructured from a 13-phase convergence pipeline with
526 knobs into a 5-stage collect-then-refine pipeline with approximately
50 settings. The old architecture made real-time decisions on partial
data during collection, causing identity conflicts, wasted fetch slots,
and 0-field runs. The new architecture separates collection from
judgment: fetch everything, extract per-source, classify later, compare
on complete data, then publish.

The identity gate no longer kills runs. Identity becomes a label on
source records, not a gate that destroys evidence. The convergence loop
has been eliminated (code removed 2026-03-15). The NeedSet engine loses its enforcement role. Consensus
becomes simple cross-source agreement instead of a 24-knob scoring
engine.

**What Changes**

-   13-phase pipeline replaced by 5-stage linear flow: Collect, Extract,
    Catalog, Compare, Publish

-   Identity gate converted from kill switch to label + publish gate (6
    kill points neutralized)

-   Convergence loop eliminated — **DONE 2026-03-15** (code, 7 knobs, CLI path,
    GUI fields, event handlers, and tests all removed)

-   NeedSet engine loses enforcement role (identity caps and blocking
    removed)

-   Consensus engine simplified (label-based source inclusion, no
    24-knob scoring)

-   526 knobs reduced to approximately 50

-   Evidence is always preserved, even when publish is blocked

**What Stays**

-   Source registry and host policy

-   SearXNG search infrastructure (searchProvider=google as default)

-   Playwright headless fetcher

-   All deterministic parsers (JSON-LD, spec tables, metadata, PDF)

-   LLM-assisted extraction (per-source, not per-convergence-round)

-   URLIndex for compound learning

-   SERP triage and domain classification (hardcoded invariants, always
    on)

-   Evidence locking requirement (source_url + evidence_quote + anchor)

-   Core/Deep field classification (moves to Stage 4 comparison)

-   GUI runtime ops surfaces (adapted to show 5 stages)

**2. The 5-Stage Pipeline**

**IMPORTANT: The 5-stage model describes the full product lifecycle, not the collection pipeline.** Stages 1–2 (Collect + Extract) form the **Collection Pipeline** — the 13-stage system currently being built. Stages 3–5 (Catalog, Compare, Publish) form the **Review Phase** — a separate process that executes independently after collection is complete and will be implemented later.

The Collection Pipeline's only job is high-value extraction and storage: search broadly, fetch aggressively, extract per-source, store everything with evidence. It does NOT decide which value is "correct" or compare sources against each other.

The Review Phase (future) compares all collected per-source data, identifies the correct value for each field, resolves conflicts, and decides whether another collection loop is needed.

Every product run follows 5 stages in strict sequence. No stage makes
judgment calls that belong to a later stage. Collection does not filter
by identity. Extraction does not merge across sources. Cataloging does
not publish. Comparison does not fetch.

**Stage 1: Collect**

Search broadly for the product. Fetch every relevant page from the
source registry. Store raw content per URL. No identity filtering. No
tier-based fetch decisions. Every URL from known-good sources gets
fetched.

**Inputs:** Product identity (brand + model), source registry, URLIndex
(for pre-seeding from prior runs)

**Outputs:** Raw stored content per URL in
/data/{category}/{product}/raw/

**Compound learning:** URLIndex is consulted at startup. High-yield URLs
from prior runs are pre-seeded into the fetch queue. Dead queries from
prior runs are skipped.

**Search:** All search routes through self-hosted SearXNG.
searchProvider=google is the default (SearXNG proxying Google engine).
Cost: \$0/month.

**Stage 2: Extract**

Run deterministic + LLM extraction on each stored page independently.
Output is one flat JSON per source with all extracted field/value pairs
plus evidence. No merging across sources. No identity decisions.

**Inputs:** Raw stored pages from Stage 1

**Outputs:** Per-source JSON in
/data/{category}/{product}/extracted/{host}.json

**Per-source JSON contains:** URL, host, every field extracted, every
value, evidence quotes, parse method, parser warnings, extraction
confidence

---

**--- BOUNDARY: Everything below is the REVIEW PHASE (separate from the Collection Pipeline, implemented later) ---**

---

**Stage 3: Catalog**

*Part of the Review Phase, not the Collection Pipeline.*

Classify each source record: does this page describe the exact product
(confirmed), a variant in the same family (variant), or a different
product (rejected)? Identity is a label, not a gate. Rejected sources
are kept for audit. Variant sources contribute shared fields.

**Inputs:** Per-source JSONs from Stage 2

**Outputs:** Source records with identity labels in
/data/{category}/{product}/identity/

**Identity labels:** confirmed (exact match), variant (same family),
uncertain (needs review), rejected (wrong product)

**Variant-sensitive fields:** weight, battery_hours, connection, SKU,
price, colors are variant-specific. Sensor, switch, DPI, shape, material
are variant-invariant and can come from any family member.

**Stage 4: Compare**

*Part of the Review Phase, not the Collection Pipeline.*

Lay all confirmed + variant sources side by side in a comparison matrix.
For each field, show every source\'s value. Consensus emerges from
agreement. Outliers are flagged for review. No complex scoring engine
needed.

**Inputs:** Identity-classified source records from Stage 3

**Outputs:** Comparison matrix (field x source), consensus values,
conflict flags, outlier annotations

**Consensus rule:** Simple majority agreement across confirmed sources.
Variant sources contribute only variant-invariant fields. Single-source
values are accepted with a \'single source\' note.

**Stage 5: Publish**

*Part of the Review Phase, not the Collection Pipeline.*

Merge consensus values into final spec JSON with full provenance. Every
field traces to specific source files. If identity is not resolved (too
many uncertain sources), the run is marked publishable=false and routed
to review. Evidence is always preserved.

**Inputs:** Comparison matrix from Stage 4

**Outputs:** spec.json (final), provenance.json (per-field evidence
chain), comparison.csv (field x source matrix)

**Publish gate:** Blocks publish when identity is not resolved. Does NOT
destroy evidence. Review queue receives the run with all collected data
intact.

**3. Identity Gate Refactor**

The identity gate is converted from a kill switch to a label + publish
gate. This is the single most important architectural change. The old
gate destroyed 203 internally extracted fields because of a
size_class_conflict triggered by a parse error (height=11 from
TechPowerUp). The new system preserves all evidence and labels sources
for review.

**Layer 1: Identity Labeling**

Every source gets a simple label during Stage 3. Nothing gets blocked
during collection, extraction, or normalization. Only publish is blocked
when identity is unsafe.

Per-source metadata: identity_label
(matched/possible/different/unknown), identity_confidence (0-1),
identity_notes (human-readable reasons). That is it. No caps, no
extraction blocking, no normalization aborts, and no identity-based
consensus penalties.

**Layer 2: Publish Gate**

If product identity is not safe: do not publish, send to review.
Evidence is preserved. Source reassignment is easy. The real workflow is
review-driven, not automation-driven.

**6 Kill Points Neutralized**

  -------- ----------------------------------------- --------------------------- ----------------------------
  **\#**   **Location**                              **Old Behavior**            **New Behavior**

  KP1      consensusEngine.js:438                    Filters out                 Label-based inclusion:
                                                     identity.match===false      matched + possible vote;
                                                     sources                     different preserved but
                                                                                 silent

  KP2      identityGateExtraction.js:42              Caps confidence to 15%      Adds identity_label
                                                                                 annotation only, no cap

  KP3      identityHelpers.js:163                    resolveExtractionGateOpen   Function deleted. No
                                                     blocks extraction           extraction gate.

  KP4      needsetEngine.js:418                      Blocks fields, caps         Blocking and caps removed.
                                                     confidence 0.45/0.25        Label stored only.

  KP5      buildIdentityNormalizationContext.js:20   identityAbort wipes         Abort removed. Always pass
                                                     consensus to empty spec     through consensus.

  KP6      queueState.js:506                         Routes to needs_manual      Kept exactly as-is.
  -------- ----------------------------------------- --------------------------- ----------------------------

**Implementation Phases**

Phase 0: Characterization tests lock current behavior (5 new test
files). Phase 1: Consensus engine uses label-based inclusion (KP1).
Phase 2: Candidate annotation adds labels, no capping (KP2). Phase 3:
Delete extraction gate (KP3). Phase 4: Remove NeedSet blocking (KP4).
Phase 5: Remove normalization abort (KP5). Phase 6: Live validation on
Razer Viper V3 Pro + Logitech G Pro X Superlight 2.

**4. Evidence Memory Architecture**

Phase 4 is no longer a compound learning add-on bolted onto the
convergence pipeline. In the new architecture, the evidence store IS the
pipeline. Phase 4A-4D are replaced by the 5-stage storage model.

**4A: Durable Source Records**

Every fetched URL becomes a durable source record with URL memory (fetch
metadata, content hash, redirect chain), source record memory (identity
label, parser quality, extraction outputs), and field candidate memory
(per-field values with provenance). This is Stage 1 and Stage 2\'s core
output, not a separate telemetry layer.

**4B: Comparison and Review Objects**

The comparison matrix from Stage 4 is the primary analytical artifact.
It replaces the old compound curve, plan diff, and cross-run metrics.
Additionally: host health aggregation (per-host fetch success, block
rate, latency) and compound trend (run-over-run search count, URL reuse,
field fill, cost) persist.

**4C: Review and Correction**

Operators can inspect every source record, reassign sources to different
identities, reject bad sources, approve or reject field candidates, and
split contaminated comparison groups. Every review action is logged
durably. Review produces structured outputs (alias mappings, parser
suppressions, identity rules) that feed Stage 1 on future runs.

**4D: Safe Consumption**

Memory from prior runs accelerates future runs under strict rules. Safe
to reuse early: dead query patterns, dead URL patterns, host health,
parser suppression rules, reviewed alias mappings. Reuse with
guardrails: product-family URL seeds, identity-specific query
expansions. Never reuse as truth without fresh evidence: historical
field values, old consensus results, previously published values.

**5. Non-Negotiables**

-   Evidence-locked output: every non-null value includes source_url,
    evidence_quote, and anchor/span

-   Core/Deep separation: core facts require Tier1/Tier2 sources or
    cross-source corroboration; deep claims stay annotated

-   Community sources never overwrite core facts unilaterally

-   SERP triage and domain classification are always on (hardcoded
    invariants, not configurable)

-   All search routes through self-hosted SearXNG (no direct API keys,
    \$0/month)

-   Identity labeling is advisory metadata, not destructive enforcement

-   Publish gate blocks publication when identity is unsafe but never
    destroys evidence

-   Every rollout step has a feature flag, rollback path, and explicit
    exit gate

**6. Rollout Phases**

**Phase 0: Identity Gate Refactor**

Neutralize the 6 kill points. Convert identity from gate to label. This
is the prerequisite for everything else. Without this, runs continue
producing 0/80 fields.

**Exit gate:** Razer Viper V3 Pro produces fields with identity labels.
Logitech G Pro X Superlight 2 produces fields (previously 0). Publish
gate still blocks when identity is uncertain.

**Phase 1: Stage 1 Infrastructure (Collect)**

Build the durable URL storage, search dispatch with dead-query
exclusion, URL pre-seeding from prior runs, and raw content storage per
URL. This replaces the old convergence loop entry, search profile, and
fetch scheduler.

**Exit gate:** 10 products fetched with 90%+ fetch success. Raw content
stored per URL. URLIndex populated.

**Phase 2: Stage 2 Infrastructure (Extract)**

Build per-source extraction to flat JSON. Every page produces one
independent extraction file with all fields, values, evidence, and
parser metadata. This replaces the old convergence-round extraction.

**Exit gate:** Per-source JSONs produced for all fetched pages. Parser
warnings captured. No merging across sources.

**Phase 3: Stage 3 Infrastructure (Catalog)** — *Review Phase, implemented after collection pipeline*

Build identity classification on complete data. Label every source as
confirmed, variant, uncertain, or rejected. This replaces the old
real-time identity gate.

**Exit gate:** Identity labels correct on 10-product test set. Variant
sources correctly tagged. Rejected sources preserved for audit.

**Phase 4: Stage 4 Infrastructure (Compare)** — *Review Phase, implemented after collection pipeline*

Build the comparison matrix. Field x source grid with consensus values,
outlier detection, and conflict flags. This replaces the old consensus
engine (24 knobs reduced to simple agreement counting).

**Exit gate:** Comparison matrix renders in Evidence Catalog Panel.
Conflicts highlighted. Outliers flagged. Consensus values match manual
verification.

**Phase 5: Stage 5 + Publish** — *Review Phase, implemented after collection pipeline*

Build final spec output with full provenance. Publish gate blocks when
identity is unresolved. Review queue receives blocked runs with all
evidence intact.

**Exit gate:** 20 products published with 95%+ accuracy on populated
fields. Review queue receives uncertain-identity runs with evidence
preserved.

**Phase 6: Visual + Parsing Expansion**

Add visual capture manifest, quality/target gates, image OCR worker, PDF
parsing upgrades, chart extraction, office document router. These add
new extraction methods to Stage 2 without changing the pipeline
architecture.

**Exit gate:** Visual evidence enters extraction after quality gates.
OCR improves coverage on Tier 3/4 fields.

**Phase 7: Community + Acceleration**

Add Reddit connector (claims only, never overwrites core facts),
throughput tuning, and optional local AI helpers (advisory only, behind
feature flag, cannot introduce hosts).

**Exit gate:** 15+ products/day for 7 consecutive days. Community claims
stored as deep claims only. Local AI disabled = identical behavior.

**7. What Was Removed from the Old Architecture**

  ----------------------- -------------------------- -----------------------
  **Old Component**       **Why Removed**            **Replaced By**

  Convergence Loop (3     Complexity, identity       Single-pass collection
  rounds)                 conflicts cascade across   in Stage 1. **REMOVED
                          rounds                     2026-03-15.**

  NeedSet Engine (18      Enforcement role created   Simple \'which fields
  knobs)                  false blocks               are empty\' check on
                                                     comparison matrix

  Identity Gate (15       Kill switch destroyed 203  Label + publish gate
  knobs)                  fields on parse errors     (advisory metadata)

  Consensus Engine (24    Over-engineered scoring    Cross-source comparison
  knobs)                  for simple agreement       matrix with majority
                                                     rule

  Aggressive Mode (18     Escalation ladder for a    Stage 1 fetches
  knobs)                  convergence loop that no   everything; no
                          longer exists              escalation needed

  EffectiveHostPlan       Scoring/diversity/health   Source registry
  (complex object)        for real-time decisions    provides URL list; host
                                                     health is observability

  Repair Queue (CP-1)     Self-healing for           No convergence = no
                          convergence failures       repair loop needed

  LLM Predict (URL        30% hit rate, 70% garbage  Search-first discovery
  prediction)                                        only

  DuckDuckGo provider     Thin index, weak operator  SearXNG with
                          support                    Google/Bing engines

  \~400 of 526 knobs      Complexity from real-time  \~50 settings for a
                          decision-making            linear pipeline
  ----------------------- -------------------------- -----------------------

**8. Production Settings (Approximately 50)**

The old system had 526 knobs because every real-time decision needed
thresholds, weights, and fallbacks. The new system makes most decisions
on complete data, eliminating the need for hundreds of tuning
parameters.

**Search**

**SEARCH_PROVIDER:** google (SearXNG proxying Google engine)

**SEARXNG_BASE_URL:** http://127.0.0.1:8080

**SEARXNG_MIN_DELAY_MS:** 2000

**Fetch**

**LANE_CONCURRENCY_FETCH:** 4

**PER_HOST_MIN_DELAY_MS:** 1500

**FETCH_PER_HOST_CONCURRENCY_CAP:** 1

**PAGE_GOTO_TIMEOUT_MS:** 12000

**POST_LOAD_WAIT_MS:** 200

**PREFER_HTTP_FETCHER:** true (static-first, headless escalation via
requires_js)

**Extraction**

**LLM_ENABLED:** true

**LLM_PER_PRODUCT_BUDGET_USD:** 0.35

**Source Registry**

**ENABLE_SOURCE_REGISTRY:** true

**Hardcoded Invariants (not configurable)**

**SERP Triage:** Always on. No toggle.

**Domain Classification:** Always on. No toggle.

**Evidence Locking:** Always on. No toggle.

**9. Acceptance Criteria**

  ----------------------------------- -----------------------------------
  **Metric**                          **Target**

  Tier 1 field fill rate (27 fields)  95%+

  Tier 2 field fill rate (31 fields)  88%+

  Factual accuracy on populated       95%+
  fields                              

  Products per day (sustained 7 days) 15-20

  Average run time                    \< 8 minutes

  LLM cost per product                \< \$0.50

  Search cost per product             \$0 (self-hosted SearXNG)

  Fetch success rate                  \>= 90%

  Zero-field runs                     0 (identity gate never destroys
                                      evidence)

  Searches per product (compound      Decreasing over time within
  trend)                              category

  Community overwriting core facts    Never

  Wrong-value rate delta vs manual    Within 2%
  baseline                            
  ----------------------------------- -----------------------------------

**10. Failure Prevention Rules**

1.  No single-phase big bang cutover

2.  Shadow-run new stages before defaulting

3.  Block rollout on wrong-value regression, not only fill-rate
    improvement

4.  Identity labels are advisory metadata, never destructive gates

5.  Evidence is always preserved, even when publish is blocked

6.  Never let unsupported search operators fail silently

7.  Never allow community or local AI to publish authoritative facts

8.  Keep static-first fetch policy; headless only when static evidence
    is insufficient

9.  Rollback by flag, not by code surgery

10. Every consumed memory item must be explainable and auditable

**11. Bottom Line**

The old architecture tried to be smart during collection. It made
identity decisions before it had all the evidence. It filtered sources
before it knew which sources agreed. It killed runs before it knew
whether the kill was justified. Every piece of complexity in the old
system (526 knobs, 13 phases, convergence rounds, identity gate, NeedSet
caps, consensus scoring) existed because the architecture forced
real-time decisions on partial information.

The new architecture separates collection from judgment. Collect
everything. Extract per-source. Classify on complete data. Compare
across all sources. Publish consensus. The operator sees a comparison
matrix where rows are fields and columns are sources. Agreement is
visible. Conflicts are highlighted. Parse errors are obvious. Identity
is a label, not a gate.

The result: zero-field runs are impossible because evidence is never
destroyed. Variant pages contribute shared fields instead of triggering
conflicts. Parse errors are flagged as outliers instead of killing the
run. The system gets simpler (50 settings instead of 526) while getting
more capable (every fetched page contributes data instead of potentially
destroying it).

**This is the shortest path to 20 accurate, evidence-locked products per
day.**
