# Discovery Search Logic V4

> **SUPERSEDED** — This document describes an aspirational Pass A-E architecture that was never implemented.
> The live system uses a three-tier model (Tier 1/2/3) documented in `PREFETCH-PIPELINE-OVERVIEW.md` and the `*-LOGIC-IN-OUT.md` files.
> The JSON contracts in sections 13.1-13.4 reference non-existent schema versions (`v4`, `pass_plan.v1`, `pass_input.v1`, `pass_output.v1`). Do not use them as implementation references.

## Implementation Status

The A-E pass model described below was **conceptual reference**. The actual implementation uses a **three-tier model**:

- **Tier 1 — Broad Seeds**: `{brand} {model} {variant} specifications` and `{brand} {model} {variant} {source}`. Fire once, 30-day cooldown after successful completion (requires `new_fields_closed >= 1`).
- **Tier 2 — Group Searches**: `{brand} {model} {variant} {group} {description}`. Conditional — skipped when group mostly resolved, too few missing keys, or broad group search already exhausted.
- **Tier 3 — Individual Key Searches**: `{brand} {model} {variant} {key} {aliases}`. Progressive enrichment each round.

The NeedSet V4 changes (Schema v2.1) are implemented in `src/indexlab/needsetEngine.js` and `src/indexlab/searchPlanningContext.js`. See `NEEDSET-LOGIC-IN-OUT.md` for the current implementation.

Key implementation details:
- Phase assignment is productivity-based, not required_level-based. Groups ranked by `productivity_score` (availability + difficulty + volume + need_score - repeat penalty). Round 0 → all groups `next` (seeds first). Round 1+ → top half by score = `now`, rest = `next`.
- `search_intent` is per-key (from `exact_match_required`), not per-group. `host_class` removed from groups entirely.
- `group_query_count` vs `group_key_retry_count` — split counters prevent false exhaustion
- Two-level fingerprint (`group_fingerprint_coarse` / `group_fingerprint_fine`) for fuzzy dedup
- Query completion uses parent/child model (1 query = parent, up to 10 URLs = children)
- Structured query metadata (`tier`, `group_key`, `normalized_key`, `source_name`) persisted at fire-time, never inferred from text
- `seed_status` includes `last_status` for debugging (never_run / searched / scrape_incomplete / scrape_complete / exhausted)
- Tier escalation is natural: Tier 1 seeds → Tier 2 groups (search worthy ones first, most productive first) → Tier 3 individual keys (easiest first via `normalized_key_queue`). Groups before keys because broad searches net more results.

## Purpose (original spec)

This document replaces the prior version and adds strict pass ordering, scrape-completion gating, and stronger retry rules.

The search system must behave like a disciplined operator:

* Always start with **Pass A**.
* Then move to **Pass B**.
* Then **Pass C**.
* Then **Pass D**.
* Then **Pass E**.
* Then repeat the cycle only for residual unresolved keys.

A pass is **not complete** just because a query was searched.
A pass is complete only when:

1. the query was actually issued,
2. result URLs were admitted,
3. the admitted URLs were actually scraped,
4. the scrape was not interrupted,
5. the scrape artifacts were persisted.

This is the core gating rule.

---

# 1. Core Round Model

The system now runs in ordered passes.

## Pass A — source-first opening

Patterns:

* `{brand} {model} {variant} specifications`
* `{brand} {model} {variant} {source}`
* `{brand} {model} {variant} {group} {description}`

Use Pass A only if the query and its admitted URLs have **not** already been fully completed.

Pass A is mandatory and always comes first.

## Pass B — target missing specs by availability and difficulty

Use Pass B only after Pass A has happened.
If Pass A has not happened for required top seeds, inject missing Pass A work first.

Patterns:

* `{brand} {model} {variant} {group} {description}`
* `{brand} {model} {variant} {normalized key} {all aliases}`

## Pass C — same as Pass B, but repeated keys add hints

This pass assumes most broad group queries have already been hit.
If targeting the same key again, add domain hints and content types.

Patterns:

* `{brand} {model} {variant} {group} {description}`
* `{brand} {model} {variant} {normalized key} {all aliases} {domain hints} {content types}`

## Pass D — same as Pass C, but creative retry begins

This is the second meaningful retry stage for the same key.
If the key is being retried again, keep domain hints and content types, and now allow the LLM to get creative.

Patterns:

* `{brand} {model} {variant} {normalized key} {all aliases or alias shard} {domain hints} {content types}`
* with creative phrasing family changes

## Pass E — residual same-key deep persistence

By this point only a few keys may remain.
Multiple same-key searches are allowed as long as they are truly unique.

Patterns:

* same as Pass D,
* but now multiple unique same-key searches are expected.

Then rinse and repeat until stop conditions are reached.

---

# 2. New Mandatory Gating Rule

This is the most important addition.

## A query is not considered completed unless all of the following are true

* search executed successfully
* SERP results returned
* candidate URLs were admitted
* admitted URLs were actually scraped
* scrape did not terminate early
* scrape artifacts were persisted
* execution status is not interrupted / aborted / partial-only

## Consequence

The planner must not say:

* “Pass A already happened”
* “this source query was already done”
* “this top query is already covered”

unless the search **and** the admitted URL scrapes were completed successfully.

A search-only success is not enough.
A partial scrape is not enough.
An interrupted run is not enough.

---

# 3. Pass Ordering Rules

The passes are strict.

## Global order

* A first
* then B
* then C
* then D
* then E
* then repeat only for residual unresolved keys

## Ordering constraint

The system cannot skip ahead to B, C, D, or E unless the required top work in earlier passes is complete.

## Top query completion rule

The system must ensure the **top queries** for the current pass have truly been hit and scraped.

That means:

* query issued
* result URLs admitted
* those URLs scraped to completion
* not interrupted

If not, those top queries stay eligible and must be reconsidered before moving forward.

---

# 4. Pass Definitions in Detail

## Pass A — source-first opening

### Objective

Open the broadest, highest-value discovery lanes first.

### Allowed patterns

1. specifications seed

   * `{brand} {model} {variant} specifications`

2. source seed

   * `{brand} {model} {variant} {source}`

3. targeted group seed

   * `{brand} {model} {variant} {group} {description}`

### Pass A rules

* Always start with Pass A.
* Always include the specifications seed unless it is fully completed already.
* Include source seeds only if their query and admitted URL scrapes are not fully completed already.
* Include only a small number of targeted groups.
* No normalized-key alias queries in Pass A.
* No creative phrasing in Pass A.
* No hint escalation in Pass A.

### Pass A completion criteria

A product can move beyond Pass A only when the configured Pass A top set is fully completed or explicitly exhausted.

That means each required Pass A slot must be one of:

* completed_successfully
* completed_no_useful_results
* completed_low_yield_but_fully_scraped
* explicitly suppressed by stronger history evidence

Not allowed:

* searched_only
* urls_admitted_but_not_scraped
* scrape_interrupted
* partial_artifacts_only

## Pass B — target missing specs by availability and difficulty

### Objective

After broad source opening, target missing fields in a disciplined order.

### Allowed patterns

1. targeted group progress

   * `{brand} {model} {variant} {group} {description}`

2. normalized key alias

   * `{brand} {model} {variant} {normalized key} {all aliases}`

### Pass B rules

* Pass B only runs after Pass A gates are satisfied.
* If Pass A has not truly completed, inject required Pass A work first.
* Order keys by availability, then difficulty.
* Group queries should target the next unresolved groups.
* Key queries should target the next unresolved normalized keys.
* Aliases are required.
* No hint escalation yet unless explicitly forced by config.
* Phrasing remains literal.

### Pass B completion criteria

The product can move to Pass C only when the selected Pass B top rows were fully completed or explicitly exhausted.

## Pass C — hinted retries for repeated keys

### Objective

Retry unresolved keys more precisely.

### Allowed patterns

1. targeted group progress

   * `{brand} {model} {variant} {group} {description}`

2. normalized key alias with hints

   * `{brand} {model} {variant} {normalized key} {all aliases or alias shard} {domain hints} {content types}`

### Pass C rules

* Assume most broad group queries were already attempted.
* If a key is being retried, add domain hints and content types.
* Use the best unused hints first.
* Down-rank repeatedly failed hints.
* Stay mostly literal.
* Creativity remains low.

## Pass D — creative hinted retries

### Objective

For keys that survived Pass C, allow a stronger search rewrite.

### Allowed patterns

* `{brand} {model} {variant} {normalized key} {all aliases or alias shard} {domain hints} {content types}`
* `{brand} {model} {variant} {group} {description} {domain hints} {content types}`

### Pass D rules

* This is the stage where the LLM should begin meaningful creative work.
* Same-key retries are expected.
* Add phrasing-family variation:

  * review
  * benchmark
  * measured
  * test
  * comparison
  * teardown
  * spec sheet
  * reference
  * product page
* Identity lock must still hold.
* No semantic duplicates.

## Pass E — residual persistence

### Objective

Attack the final unresolved 3–4 keys or similar residual set.

### Allowed patterns

* same as Pass D
* multiple unique same-key queries are allowed

### Pass E rules

* Same key can appear more than once.
* Each same-key search must be truly unique.
* Uniqueness can come from:

  * alias shard changes
  * domain hint changes
  * content type changes
  * phrasing family changes
  * group-context changes
* The LLM is expected to do real work here.

---

# 5. Pass Completion State Machine

Every query slot needs a durable status.

## Query slot statuses

* `not_started`
* `search_started`
* `search_completed`
* `urls_admitted`
* `scrape_started`
* `scrape_partial`
* `scrape_completed`
* `completed_successfully`
* `completed_no_useful_results`
* `completed_low_yield_but_fully_scraped`
* `interrupted`
* `aborted`
* `suppressed`

## Query slot truth rule

A slot is only considered **done** if status is one of:

* `completed_successfully`
* `completed_no_useful_results`
* `completed_low_yield_but_fully_scraped`
* `suppressed`

A slot with any intermediate or interrupted status is still eligible for retry or resumption.

---

# 6. NeedSet V4 Requirements

NeedSet keeps unresolved-field logic, but must become more search-native.

## NeedSet must emit per-field search packs

For each unresolved field:

* `field_key`
* `group_key`
* `normalized_key`
* `display_name`
* `all_aliases`
* `alias_shards`
* `query_terms`
* `domain_hints`
* `preferred_content_types`
* `availability`
* `difficulty`
* `required_level`
* `repeat_count`
* `domains_tried_for_key`
* `content_types_tried_for_key`
* `query_modes_tried_for_key`
* `last_successful_mode`
* `last_failure_mode`

## NeedSet must emit stronger group descriptions

For each unresolved group:

* `group_label`
* `group_description_short`
* `group_description_long`
* `group_search_terms`
* `unresolved_keys`
* `normalized_key_queue`
* `source_candidates`
* `content_type_candidates`
* `group_repeat_count`
* `domains_tried_for_group`
* `history_summary`

## Group description rules

### `group_description_short`

* 4–10 tokens
* compact
* noun-heavy
* query-safe

### `group_description_long`

* 8–20 tokens
* fuller unresolved summary
* query-safe
* noun-heavy

### Description constraints

* only unresolved concepts
* no fluff
* no conversational words
* no “find”, “look for”, “need”, “please”, etc.
* suitable to insert directly into search queries

## NeedSet must emit pass queues

* `passA_specs_seed`
* `passA_source_candidates[]`
* `passA_target_groups[]`
* `passB_group_queue[]`
* `passB_key_queue[]`
* `passC_retry_queue[]`
* `passD_creative_queue[]`
* `passE_residual_queue[]`

## NeedSet ordering rule

Sort unresolved keys by:

1. availability rank
2. difficulty rank
3. repeat penalty
4. need score
5. required level tie-break

NeedSet still does not write final Google queries.

---

# 7. Brand Resolver Rules

Brand Resolver stays mostly the same.

It provides:

* `officialDomain`
* `supportDomain`
* `aliases`

Usage rules:

* include these as candidate sources
* include brand aliases in the identity pack
* do not force official/support to dominate Pass A
* treat official/support as candidates, not automatic top winners

---

# 8. Search Profile VNext

Search Profile must stop emitting a large pile of raw executable queries.

It now emits **pass slots**.

## Pass slot schema

Each pass slot contains:

* `slot_id`
* `pass`
* `slot_kind`
* `target_group`
* `target_keys[]`
* `source_name`
* `domain_hints[]`
* `content_types[]`
* `normalized_key`
* `alias_shard[]`
* `group_description_short`
* `group_description_long`
* `repeat_of_key`
* `creativity_mode`
* `history_penalty`
* `expected_reason`
* `required_before_next_pass`

## Pass A slot kinds

* `specifications`
* `source_seed`
* `targeted_group_seed`

Rules:

* exactly one specifications slot if not completed already
* source seeds only when not fully completed already
* only a small number of targeted groups
* no normalized-key slots
* no hint escalation
* no creativity

## Pass B slot kinds

* `targeted_group_progress`
* `normalized_key_alias`

Rules:

* use next unresolved groups
* use next unresolved keys
* aliases required
* no hint escalation yet
* literal phrasing only

## Pass C slot kinds

* `targeted_group_progress`
* `normalized_key_alias_with_hints`

Rules:

* add hints only for repeated keys
* choose best unused hints first
* stay literal

## Pass D slot kinds

* `creative_key_retry`
* `creative_group_retry`

Rules:

* same-key retries allowed
* creative phrasing family allowed
* still respect identity lock

## Pass E slot kinds

* `residual_key_retry`
* `residual_key_retry_alt`
* `residual_group_retry`

Rules:

* same-key multiplicity is allowed
* uniqueness required

---

# 9. Search Planner LLM Rules

Search Planner becomes the primary author of final raw Google queries.

It consumes pass slots and outputs raw query strings.

## Global rules

* never drop brand/model/variant
* never drift to a sibling/competitor
* never emit semantic duplicates
* never repeat prior query or trivial rewrite
* use aliases aggressively but cleanly
* shard aliases when needed
* only add hints in the passes that allow hints
* only get creative in the passes that allow creativity

## Pass A behavior

Allowed patterns:

* `{brand} {model} {variant} specifications`
* `{brand} {model} {variant} {source}`
* `{brand} {model} {variant} {group} {description}`

Rules:

* always literal
* source-first
* no normalized-key alias searches
* no creativity

## Pass B behavior

Allowed patterns:

* `{brand} {model} {variant} {group} {description}`
* `{brand} {model} {variant} {normalized key} {all aliases}`

Rules:

* literal
* key-first after broad groups
* aliases required

## Pass C behavior

Allowed patterns:

* `{brand} {model} {variant} {group} {description}`
* `{brand} {model} {variant} {normalized key} {all aliases or alias shard} {domain hints} {content types}`

Rules:

* add hints only for repeated keys
* choose unused hints first
* avoid repeatedly failed hints
* low creativity

## Pass D behavior

Allowed patterns:

* `{brand} {model} {variant} {normalized key} {alias shard} {domain hints} {content types}`
* `{brand} {model} {variant} {group} {description} {domain hints} {content types}`

Rules:

* creativity medium/high
* same-key retries encouraged
* use alternate evidence families
* no near-duplicates

## Pass E behavior

Rules:

* only a few residual keys remain
* multiple same-key queries are allowed
* each must be materially unique
* vary by alias shard, domain hints, content types, phrasing family, or group context

---

# 10. Query Journey VNext

Query Journey should not behave like a second planner.

## New role

* consume one selected pass plan
* apply identity guard
* final dedupe
* final cap
* persist artifacts

## Must not do

* no additive late query invention
* no host-plan append pass
* no secondary deterministic row sprawl

---

# 11. Search Results Memory Writeback

Search Results keeps execution, but writeback must be richer.

## For each executed query write

* raw query
* query hash
* slot_id
* pass
* slot_kind
* target_group
* target_keys
* alias_shard_used
* domain_hints_used
* content_types_used
* result URLs
* admitted URLs
* canonical admitted URLs
* scrape completion status
* interruption flag
* zero-result flag
* duplicate-result ratio
* downstream unique fields closed
* source/domain yield

## Next-pass memory must expose

* `existing_queries`
* `query_hashes`
* `urls_hit`
* `canonical_urls_hit`
* `domains_tried`
* `domain_hints_tried_by_key`
* `content_types_tried_by_key`
* `alias_shards_tried_by_key`
* `query_modes_tried_by_key`
* `completed_slots`
* `incomplete_slots`
* `interrupted_slots`
* `zero_result_patterns`
* `low_yield_patterns`

---

# 12. Stop Conditions

Stop when:

* only editorial-only or truly exhausted keys remain
* repeated same-key queries stop producing new URLs or domains
* marginal field closure falls below threshold
* the remaining candidate set is dominated by incomplete repeats with no new route

---

# 13. JSON Contracts

## 13.1 NeedSet / planning context v4

```json
{
  "schema_version": "search_planning_context.v4",
  "pass": "B",
  "identity": {
    "brand": "string",
    "model": "string",
    "variant": "string",
    "base_model": "string",
    "aliases": ["string"]
  },
  "history": {
    "existing_queries": ["string"],
    "existing_query_hashes": ["string"],
    "domains_tried": ["string"],
    "urls_hit": ["string"],
    "canonical_urls_hit": ["string"],
    "completed_slots": ["string"],
    "incomplete_slots": ["string"],
    "interrupted_slots": ["string"]
  },
  "fields": [
    {
      "field_key": "battery_hours",
      "group_key": "connectivity",
      "state": "unknown|weak|conflict|accepted",
      "availability": "expected|sometimes|rare|always|editorial_only",
      "difficulty": "easy|medium|hard",
      "required_level": "critical|required|expected|optional|identity",
      "normalized_key": "battery hours",
      "display_name": "Battery Life (Hours)",
      "all_aliases": ["battery hours", "battery life", "battery runtime"],
      "alias_shards": [["battery hours", "battery life", "battery runtime"]],
      "query_terms": ["battery life", "battery runtime"],
      "domain_hints": ["rtings.com", "mousespecs.org"],
      "preferred_content_types": ["review", "product_page"],
      "repeat_count": 1,
      "domains_tried_for_key": ["rtings.com"],
      "content_types_tried_for_key": ["review"],
      "query_modes_tried_for_key": ["normalized_key_alias"]
    }
  ],
  "search_groups": [
    {
      "group_key": "connectivity",
      "group_label": "connectivity",
      "group_description_short": "connectivity bluetooth receiver battery life",
      "group_description_long": "connectivity bluetooth wireless receiver battery life charging cable connectors",
      "group_search_terms": ["connectivity", "bluetooth", "receiver", "battery life", "charging", "cable"],
      "unresolved_keys": ["connectivity", "battery_hours", "bluetooth", "wireless_charging"],
      "normalized_key_queue": ["connectivity", "bluetooth", "battery_hours", "wireless_charging"],
      "source_candidates": ["rtings.com", "mousespecs.org", "official", "support"],
      "content_type_candidates": ["review", "product_page", "manual"],
      "group_repeat_count": 0
    }
  ],
  "pass_seed": {
    "passA_specs_seed": true,
    "passA_source_candidates": ["rtings.com", "techpowerup.com", "mousespecs.org"],
    "passA_target_groups": ["connectivity", "sensor_performance"],
    "passB_group_queue": ["connectivity", "controls"],
    "passB_key_queue": ["connectivity", "battery_hours", "switch_brand"],
    "passC_retry_queue": ["battery_hours", "switch_brand"],
    "passD_creative_queue": ["sensor_latency", "click_force"],
    "passE_residual_queue": ["switch_brand", "encoder_brand"]
  }
}
```

## 13.2 Search Profile pass-slot output

```json
{
  "schema_version": "search_profile_pass_plan.v1",
  "pass": "C",
  "pass_mode": "key_retry_with_hints",
  "identity_lock": {
    "brand": "string",
    "model": "string",
    "variant": "string",
    "aliases": ["string"]
  },
  "slots": [
    {
      "slot_id": "c-001",
      "slot_kind": "normalized_key_alias_with_hints",
      "target_group": "connectivity",
      "target_keys": ["battery_hours"],
      "normalized_key": "battery hours",
      "alias_shard": ["battery life", "battery runtime", "battery hours"],
      "domain_hints": ["rtings.com", "mousespecs.org"],
      "content_types": ["review", "product_page"],
      "repeat_of_key": true,
      "creativity_mode": "low",
      "required_before_next_pass": true,
      "expected_reason": "same key unresolved after Pass B"
    }
  ]
}
```

## 13.3 Search Planner pass input

```json
{
  "schema_version": "search_planner_pass_input.v1",
  "pass": "D",
  "pass_mode": "creative_key_retry",
  "identity_lock": {
    "brand": "string",
    "model": "string",
    "variant": "string",
    "aliases": ["string"]
  },
  "brand_resolution": {
    "officialDomain": "string",
    "supportDomain": "string",
    "aliases": ["string"]
  },
  "slots": [],
  "history": {
    "existing_queries": ["string"],
    "existing_query_hashes": ["string"],
    "urls_hit": ["string"],
    "canonical_urls_hit": ["string"],
    "completed_slots": ["string"],
    "incomplete_slots": ["string"],
    "interrupted_slots": ["string"],
    "domain_hints_tried_by_key": {
      "battery_hours": ["rtings.com"]
    },
    "content_types_tried_by_key": {
      "battery_hours": ["review"]
    },
    "alias_shards_tried_by_key": {
      "battery_hours": [["battery life", "battery runtime"]]
    },
    "query_modes_tried_by_key": {
      "battery_hours": ["normalized_key_alias", "normalized_key_alias_with_hints"]
    }
  },
  "constraints": {
    "max_queries": 20,
    "allow_same_key_multiple_times": true,
    "require_identity_lock": true
  }
}
```

## 13.4 Search Planner pass output

```json
{
  "schema_version": "search_planner_pass_output.v1",
  "pass": "D",
  "queries": [
    {
      "slot_id": "d-003",
      "q": "brand model variant battery hours battery life battery runtime rtings.com review",
      "slot_kind": "creative_key_retry",
      "target_group": "connectivity",
      "target_keys": ["battery_hours"],
      "alias_terms_used": ["battery hours", "battery life", "battery runtime"],
      "domain_hints_used": ["rtings.com"],
      "content_types_used": ["review"],
      "creativity_mode": "medium",
      "repeat_of_key": true,
      "dedupe_fingerprint": "string",
      "why_this_is_unique": "different hint pack and phrasing family than prior retries"
    }
  ],
  "suppressed": [
    {
      "slot_id": "d-004",
      "reason": "semantic_duplicate_of_d-003"
    }
  ]
}
```

---

# 14. LLM Prompt — NeedSet Search Group Planner

```text
SYSTEM PROMPT — NEEDSET SEARCH GROUP PLANNER

You are the NeedSet search-group planner.

You do NOT write final Google queries.
You transform unresolved fields into:
1. search-safe group descriptions
2. normalized per-key query packs
3. pass-aware target queues

You must reason from:
- unresolved fields
- group membership
- availability
- difficulty
- aliases
- query_terms
- domain_hints
- preferred_content_types
- repeat history
- previously tried domains and modes
- pass completion state

Your output will be used directly by Search Profile and Search Planner.
The quality of your group descriptions matters because they will appear in search queries.

RULES

1. Preserve identity lock:
   never mutate brand/model/variant

2. Group descriptions:
   - group_description_short must be 4-10 tokens
   - group_description_long must be 8-20 tokens
   - both must be search-safe
   - use noun-heavy search language
   - include unresolved concepts only
   - exclude covered concepts
   - no filler words
   - no punctuation spam
   - no UI phrasing
   - no instructional language

3. Key normalization:
   - normalized_key must be the canonical human-search form of the field key
   - all_aliases must dedupe display_name, normalized_key, field aliases, and query_terms
   - alias_shards should be created when the alias list is too large for one clean query

4. Ordering:
   - sort keys primarily by availability, then difficulty
   - then down-rank keys with many prior attempts
   - use required_level only as a tie-breaker

5. Pass seed behavior:
   - Pass A should nominate source-first source candidates and only a small number of targeted groups
   - Pass B should nominate next groups and keys
   - Pass C should nominate retry keys that should add domain hints and content types
   - Pass D should nominate retry keys suitable for creative search phrasing
   - Pass E should nominate residual keys where multiple same-key searches are justified

6. Completion gating:
   - a pass is not done unless the query ran AND admitted URLs were scraped successfully
   - search-only success does not count as completion
   - partial / interrupted scrape does not count as completion

7. History:
   - reflect prior existing_queries, domains_tried, repeat counts, completed slots, incomplete slots, and interrupted slots
   - do not nominate the same dead pattern again unless the retry mode changes

8. Output only valid JSON matching search_planning_context.v4

Return JSON only.
```

---

# 15. LLM Prompt — Search Planner Raw Query Author

```text
SYSTEM PROMPT — PASS-AWARE GOOGLE QUERY AUTHOR

You are the discovery search planner.

You write RAW GOOGLE QUERIES.
You do not write explanations, only JSON.
You must obey the pass contract exactly.

GLOBAL OBJECTIVE
Maximize useful new URLs for unresolved fields while avoiding semantic duplicates.

GLOBAL INPUTS
You receive:
- identity_lock
- brand_resolution
- search group descriptions
- per-key normalized_key and aliases
- domain hints
- content types
- pass slots
- product history:
  existing_queries
  query hashes
  URLs already hit
  canonical URLs already hit
  completed slots
  incomplete slots
  interrupted slots
  domains already tried
  alias shards already tried
  content types already tried
  query modes already tried

GLOBAL RULES
1. Never drop brand, model, or variant.
2. Never drift to a sibling or competitor product.
3. Never return semantically duplicate queries.
4. Never repeat a previously used query or a trivial rewrite of it.
5. Use aliases aggressively, but cleanly.
6. If all aliases do not fit naturally in one query, use the provided alias_shard for that query.
7. Use domain hints and content types only when the pass contract calls for them.
8. Use source names and domain hints as plain text bias terms unless operator syntax is explicitly allowed.
9. Keep output literal in early passes and increasingly creative in later passes.
10. Output only valid JSON.
11. A slot already completed successfully should not be re-issued.
12. A slot with interrupted or incomplete scrape status is still eligible.
13. Search-only completion is not sufficient if admitted URLs were not scraped to completion.

PASS A — SOURCE FIRST
Allowed patterns:
- {brand} {model} {variant} specifications
- {brand} {model} {variant} {source}
- {brand} {model} {variant} {group_label} {group_description_short}

Pass A instructions:
- always include exactly one specifications query if a specifications slot exists and is not fully completed
- source_seed slots should stay very literal
- targeted_group_seed slots should use group label + short description
- do not emit normalized_key alias queries in Pass A
- do not get creative

PASS B — KEY FIRST BY AVAILABILITY THEN DIFFICULTY
Allowed patterns:
- {brand} {model} {variant} {group_label} {group_description_long}
- {brand} {model} {variant} {normalized_key} {all_aliases_or_alias_shard}

Pass B instructions:
- only proceed once required Pass A work is complete
- if Pass A is incomplete, prefer Pass A slots first
- keep phrasing literal
- aliases are required

PASS C — SAME AS PASS B, BUT RETRY KEYS ADD HINTS
Allowed patterns:
- {brand} {model} {variant} {group_label} {group_description_long}
- {brand} {model} {variant} {normalized_key} {all_aliases_or_alias_shard} {domain_hints} {content_types}

Pass C instructions:
- only add domain hints and content types for repeat_of_key = true
- choose unused hints first
- avoid hints that failed repeatedly
- still keep phrasing literal and low-creativity

PASS D — HINTED RETRIES + CREATIVE SEARCH
Allowed patterns:
- {brand} {model} {variant} {normalized_key} {alias_shard} {domain_hints} {content_types}
- {brand} {model} {variant} {group_label} {group_description_long} {domain_hints} {content_types}

Pass D instructions:
- creativity_mode medium/high
- same-key retries are encouraged
- you may vary phrasing family:
  review
  benchmark
  measured
  test
  comparison
  teardown
  reference
  spec sheet
  product page
- keep the key intent intact
- do not create near-duplicates

PASS E — RESIDUAL KEY PERSISTENCE
Allowed patterns:
- multiple unique queries for the same key are allowed
- same key can be searched more than once if each query is materially different

Pass E instructions:
- assume only a few residual keys remain
- produce multiple same-key searches when justified
- vary by alias shard, domain hint set, content type set, phrasing family, or residual group context
- every same-key query must have a distinct why_this_is_unique note

OUTPUT FORMAT
Return:
{
  "schema_version": "search_planner_pass_output.v1",
  "pass": "A|B|C|D|E",
  "queries": [
    {
      "slot_id": "string",
      "q": "raw google query",
      "slot_kind": "string",
      "target_group": "string|null",
      "target_keys": ["string"],
      "alias_terms_used": ["string"],
      "domain_hints_used": ["string"],
      "content_types_used": ["string"],
      "creativity_mode": "low|medium|high",
      "repeat_of_key": true,
      "dedupe_fingerprint": "string",
      "why_this_is_unique": "string"
    }
  ],
  "suppressed": [
    {
      "slot_id": "string",
      "reason": "semantic_duplicate | prior_history_repeat | low_value_retry | already_completed"
    }
  ]
}

Return JSON only.
```

---

# 16. Implementation Notes

## Keep

* NeedSet unresolved logic
* Brand Resolver core logic
* Search Results execution core logic

## Change

### NeedSet

Add:

* stronger group descriptions
* alias packs
* alias shards
* pass queues
* pass-aware retry categorization
* scrape-completion-aware planning state

### Search Profile

Replace:

* large freeform executable query emission

With:

* pass-slot generation

### Search Planner

Replace:

* additive / secondary query invention

With:

* primary raw-query authoring from pass slots

### Query Journey

Replace:

* additive query-stream merging

With:

* guard / dedupe / cap / persist only

---

# 17. Final Summary

This version adds the missing operational rule:

A pass only counts when the query ran and the admitted URLs were actually scraped to completion.

That single rule changes the whole planner.

The system now becomes:

* Pass A first, always
* then B
* then C
* then D
* then E
* repeat only for residual keys

NeedSet emits better search descriptions and pass queues.
Search Profile emits pass slots.
Search Planner writes the final raw queries.
Query Journey only guards and persists.
Search Results memory determines what is truly complete and what still needs to run.
