# Search Planner Logic In And Out

Validated against live code on 2026-03-23.

## What this stage is

Search Planner is the Stage 04 tier-aware LLM enhancement boundary owned by `runSearchPlanner()`. It receives tier-tagged `query_rows` from Search Profile and enhances query strings via LLM. Tier metadata is passthrough — only the `query` string changes.

Primary owners:

- `src/features/indexing/discovery/stages/searchPlanner.js`
- `src/research/queryPlanner.js` (`enhanceQueryRows`)

## Inputs in

`runSearchPlanner()` consumes (verified against `searchPlanner.js:12-19`):

- `searchProfileBase` — deterministic base from Stage 03
- `queryExecutionHistory` — optional, defaults to `null`. Per-query completion state from frontierDb.
- `config` — runtime config (LLM routing, timeouts)
- `logger`
- `identityLock` — `{ brand, model, variant, productId }`
- `missingFields` — flat missing field list

Note: `variables` and `job` are NOT parameters of `runSearchPlanner()`. They are consumed by other stages.

Derived internally:

- `queryRows` — `toArray(searchProfileBase?.query_rows)` (tier-tagged rows from Search Profile)
- `queryHistory` — deduplicated union of `searchProfileBase.base_templates` AND `queryExecutionHistory.queries[].query_text` (both prior deterministic templates and actual executed queries to avoid repeating)

## Live logic

1. Extract `query_rows` from `searchProfileBase` via `toArray()`.
2. Build `queryHistory` as deduplicated union of `base_templates` + `queryExecutionHistory.queries[].query_text`.
3. Call `enhanceQueryRows({ queryRows, queryHistory, missingFields, identityLock, config, logger })`.
4. Count LLM-enhanced rows (where `hint_source` ends with `_llm`).
5. Emit `search_plan_generated` event with enhancement details (always emitted, even on deterministic fallback).
6. Return `{ enhancedRows: result.rows, source: result.source }`.

### `enhanceQueryRows` behavior

**Early exits (deterministic fallback — rows returned unchanged):**

- No API key for `plan` role
- No model resolved for `searchPlanner` phase
- Empty `queryRows` input

**LLM path:**

1. Build payload: `identity_lock`, `query_history`, `missing_fields`, `rows[]` (each with `index`, `query`, `tier`, `target_fields`, `group_key`, `normalized_key`).
2. Call LLM with tier-aware system prompt and JSON schema.
3. Validate response: must have exactly N entries matching input row count.
4. Per-row identity lock check: enhanced query must contain brand + model tokens.
5. If a row fails identity lock, that row keeps its original query (no `_llm` suffix).
6. Successful rows get `hint_source` updated to `{original}_llm` and `original_query` preserved.

**Retry:** 1 retry on failure, then deterministic fallback.

**Fallback cascade:**
- LLM returns wrong-length array → retry → fallback
- LLM returns malformed response → retry → fallback
- LLM call throws → retry → fallback
- Both attempts fail → return original rows unchanged, `source: 'deterministic_fallback'`

## Tier-aware enhancement rules

| Tier | `tier` value | LLM latitude | What changes |
|---|---|---|---|
| 1 (Seeds) | `seed` | Minimal | Minor phrasing only. Structure stays. |
| 2 (Groups) | `group_search` | Moderate | Tighten description, drop redundant tokens, better search angle. |
| 3 (Keys) | `key_search` | Maximum | Add aliases, vary phrasing (review, benchmark, teardown, spec sheet), pick different angles. Avoid patterns from `query_history`. |

**Passthrough invariant:** `tier`, `hint_source` (base), `group_key`, `normalized_key`, `target_fields`, `doc_hint`, `domain_hint`, `source_host` are never mutated by the LLM. Only `query` changes.

## LLM system prompt

```
You enhance search queries for hardware specification collection.
You receive N query rows. Return exactly N enhanced queries in the same order.

IDENTITY LOCK (mandatory):
- Every output query MUST contain the brand name and model name.
- Never drop, abbreviate, or alter the brand/model identity tokens.
- Never drift to a sibling or competitor product.

TIER 1 — "seed": Broad product seed queries (e.g. "{brand} {model} specifications").
- Return the query unchanged or with only trivial phrasing cleanup.
- Do NOT restructure, add fields, or change intent.

TIER 2 — "group_search": Queries targeting a spec group (e.g. connectivity, sensor).
- The query contains a group description. You may tighten redundant tokens or pick a better search angle.
- target_fields shows which fields this group needs. Use that to focus the query.
- Keep the group intent. Do not narrow to a single field.

TIER 3 — "key_search": Queries targeting a single unresolved field. This is where you add the most value.
- Each row includes enrichment context: repeat_count, all_aliases, domain_hints, preferred_content_types, domains_tried, content_types_tried.
- Use the enrichment context to craft a materially different query from the deterministic base.

TIER 3 SUB-RULES by repeat_count:
- repeat=0 (3a): First attempt. The deterministic query is bare "{brand} {model} {key}". Pick the best alias combination for a clean first search.
- repeat=1 (3b): Second attempt. Aliases are now available. Use a DIFFERENT alias combination than what the base query already contains. Vary word order.
- repeat=2 (3c): Third attempt. Domain hints and domains_tried are available. Add an UNTRIED domain as a bias term (e.g. "rtings.com", "techpowerup"). Do NOT repeat domains_tried.
- repeat=3+ (3d): Fourth+ attempt. Content type hints and content_types_tried are available. Get creative — vary phrasing family (teardown, benchmark, measured, review, spec sheet, comparison, reference). Use untried content types. Use untried domain hints. Each query must be materially unique from prior attempts.

HISTORY AWARENESS:
- query_history shows queries already executed. Do NOT repeat them or trivial rewrites.

OUTPUT: Return JSON with enhanced_queries array. Each entry: {"index": N, "query": "enhanced query"}.
Return exactly N entries in the same order as input.
```

## LLM JSON schema (structured output)

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enhanced_queries": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "index": { "type": "integer" },
          "query": { "type": "string" }
        },
        "required": ["index", "query"]
      }
    }
  },
  "required": ["enhanced_queries"]
}
```

## LLM user payload (example)

```json
{
  "identity_lock": {
    "brand": "Logitech",
    "model": "G Pro X Superlight 2",
    "variant": ""
  },
  "query_history": [
    "Logitech G Pro X Superlight 2 specifications",
    "Logitech G Pro X Superlight 2 rtings.com",
    "Logitech G Pro X Superlight 2 switch brand"
  ],
  "missing_fields": ["switch_brand", "encoder_brand", "battery_hours"],
  "rows": [
    {
      "index": 0,
      "query": "Logitech G Pro X Superlight 2 specifications",
      "tier": "seed",
      "target_fields": [],
      "group_key": "",
      "normalized_key": ""
    },
    {
      "index": 1,
      "query": "Logitech G Pro X Superlight 2 connectivity bluetooth battery life",
      "tier": "group_search",
      "target_fields": ["bluetooth", "battery_hours"],
      "group_key": "connectivity",
      "normalized_key": ""
    },
    {
      "index": 2,
      "query": "Logitech G Pro X Superlight 2 switch brand optical switch teardown",
      "tier": "key_search",
      "target_fields": ["switch_brand"],
      "group_key": "buttons",
      "normalized_key": "switch_brand",
      "repeat_count": 2,
      "all_aliases": ["switch brand", "switch type", "optical switch", "mouse switch"],
      "domain_hints": ["rtings.com", "techpowerup.com", "overclock.net"],
      "preferred_content_types": ["teardown", "review", "spec_sheet"],
      "domains_tried": ["rtings.com"],
      "content_types_tried": []
    },
    {
      "index": 3,
      "query": "Logitech G Pro X Superlight 2 encoder brand",
      "tier": "key_search",
      "target_fields": ["encoder_brand"],
      "group_key": "sensor",
      "normalized_key": "encoder_brand",
      "repeat_count": 0,
      "all_aliases": ["encoder brand", "encoder type", "rotary encoder"],
      "domain_hints": ["techpowerup.com"],
      "preferred_content_types": ["teardown"],
      "domains_tried": [],
      "content_types_tried": []
    }
  ]
}
```

Note: Row 2 is a Tier 3c query (repeat=2) — the deterministic base already includes aliases and an untried domain. The LLM should pick a *different* untried domain (techpowerup.com or overclock.net) and vary the alias combination. Row 3 is a Tier 3a query (repeat=0) — first attempt, the LLM should pick the best alias combination for a clean first search.

## Outputs out

`runSearchPlanner()` returns:

- `enhancedRows` — array of row objects, same shape as input `query_rows` with:
  - `query` — possibly rewritten by LLM
  - `hint_source` — `{original}_llm` if LLM enhanced, original value if not
  - `original_query` — pre-enhancement query (only present on LLM-enhanced rows)
  - All other fields unchanged (tier, group_key, normalized_key, target_fields, etc.)
- `source` — `'llm'` or `'deterministic_fallback'`

## Side effects and persistence

- Optional routed LLM call through `enhanceQueryRows()`
- `search_plan_generated` runtime event (when LLM succeeds)

No direct storage writes happen in this stage.

## What it feeds next

Search Planner feeds Query Journey with `enhancedRows`. Query Journey treats these identically regardless of whether they were LLM-enhanced or deterministic fallback — the downstream pipeline is the same either way:

1. Query Journey deduplicates, ranks by field priority, applies identity guard
2. Caps to `searchProfileQueryCap`
3. Appends host-plan rows
4. Persists the planned search profile artifact
5. Feeds Stage 06 Search Execution with the final query list
