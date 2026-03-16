// COLLECTION PIPELINE DATA SCHEMAS
// Scope: These schemas define the Collection Pipeline's internal contracts.
// The pipeline's only job is high-value data extraction and storage —
// searching, fetching, parsing, extracting, and storing per-source evidence.
// Comparison, consensus, conflict resolution, and publishing are handled by
// the separate Review Phase (implemented later).

// SCHEMA 1 — NEEDSET START INPUT
// Purpose: exact Stage 1 input contract.
// Mental model: per key = setup + current status + history.
// IMPORTANT: keep hints/domains/content types per-key here, NOT top-level duplicates.

type RequiredLevel = "identity" | "critical" | "required" | "expected" | "optional";
type FieldStatus = "accepted" | "conflict" | "unknown" | "weak";
type PanelIdentityState = "locked" | "provisional" | "conflict" | "unknown";

type EvidenceClass =
  | "manufacturer_html"
  | "manual_pdf"
  | "support_docs"
  | "review"
  | "benchmark"
  | "retailer"
  | "database"
  | "fallback_web"
  | "targeted_single";

type HostClass =
  | "official"
  | "support"
  | "review"
  | "benchmark"
  | "retailer"
  | "database"
  | "community"
  | "fallback";

type NeedSetStartInput = {
  schema_version: "needset_start_input.v2";

  run: {
    run_id: string;
    category: string;
    product_id: string;
    brand: string;
    model: string;
    base_model?: string | null;
    aliases?: string[];
    round: number;
    round_mode: "seed" | "carry_forward" | "repair";
  };

  identity: {
    // panel-facing readiness state
    state: PanelIdentityState;

    // source-label state from the Stage 1 refactor
    source_label_state: "matched" | "possible" | "different" | "unknown";

    confidence: number;
    manufacturer?: string | null;
    official_domain?: string | null;
    support_domain?: string | null;

    publishable?: boolean;
    review_required?: boolean;
  };

  settings: {
    discoveryEnabled: boolean;
    discoveryMaxQueries: number;
    discoveryMaxDiscovered: number;
    maxUrlsPerProduct: number;
    maxCandidateUrls: number;
    maxPagesPerDomain: number;
    maxRunSeconds: number;

    phase2LlmEnabled?: boolean;
    llmModelPlan?: string;
    llmPlanProvider?: string;
    llmPlanBaseUrl?: string;
    llmPlanApiKey?: string;

    // current live planner/query-profile caps
    searchProfileCapMapJson?: {
      deterministicAliasCap: number;
      llmAliasValidationCap: number;
      llmDocHintQueriesCap: number;
      llmFieldTargetQueriesCap: number;
      dedupeQueriesCap: number;
    };

    // informational needset thresholds that still exist
    needsetIdentityLockThreshold?: number;
    needsetIdentityProvisionalThreshold?: number;
  };

  fields: Array<{
    field_key: string;
    label: string;

    // current grouping primitive that you actually have
    group_key?: string | null;

    idx: {
      required_level: RequiredLevel;
      min_evidence_refs: number;

      // per-key search hints (do NOT duplicate these top-level)
      query_terms?: string[];
      domain_hints?: string[];
      preferred_content_types?: string[];
      tooltip_md?: string | null;
      aliases?: string[];
    };

    pass_target: number;
    exact_match_required: boolean;

    current: {
      status: FieldStatus;
      value: unknown | null;
      confidence: number;
      effective_confidence: number;
      refs_found: number;
      best_tier_seen: 0 | 1 | 2 | 3 | 4 | 5 | null;
      meets_pass_target: boolean;
      reasons: Array<
        | "missing"
        | "conflict"
        | "low_conf"
        | "min_refs_fail"
        | "tier_pref_unmet"
        | "publish_gate_block"
      >;
    };

    // field-level anti-repeat memory
    history: {
      existing_queries: string[];
      domains_tried: string[];
      host_classes_tried: HostClass[];
      evidence_classes_tried: EvidenceClass[];
      query_count: number;
      urls_examined_count: number;
      no_value_attempts: number;
      duplicate_attempts_suppressed: number;
    };
  }>;

  // debug only — badges, not planner logic
  debug?: {
    idx_runtime_present?: Array<
      | "idx.priority.required_level"
      | "idx.evidence.min_evidence_refs"
      | "idx.aliases"
      | "idx.search_hints.query_terms"
      | "idx.search_hints.domain_hints"
      | "idx.search_hints.preferred_content_types"
      | "idx.ui.tooltip_md"
    >;
  };
};





// SCHEMA 2 — NEEDSET OUTPUT
// Purpose: field-first artifact output from NeedSet.
// This remains field-first because NeedSet is the persisted artifact today.

type NeedSetOutput = {
  schema_version: "needset_output.v2";

  round: number;
  round_mode: "seed" | "carry_forward" | "repair";

  identity: {
    state: PanelIdentityState;
    source_label_state: "matched" | "possible" | "different" | "unknown";
    manufacturer?: string | null;
    model?: string | null;
    confidence: number;
    official_domain?: string | null;
    support_domain?: string | null;
  };

  summary: {
    total: number;
    resolved: number;
    core_total: number;
    core_unresolved: number;
    secondary_total: number;
    secondary_unresolved: number;
    optional_total: number;
    optional_unresolved: number;
    conflicts: number;
  };

  blockers: {
    missing: number;
    weak: number;
    conflict: number;
    needs_exact_match: number;
    search_exhausted: number;
  };

  fields: Array<{
    field_key: string;
    label: string;
    group_key?: string | null;

    required_level: RequiredLevel;

    idx: {
      min_evidence_refs: number;
      query_terms?: string[];
      domain_hints?: string[];
      preferred_content_types?: string[];
      tooltip_md?: string | null;
      aliases?: string[];
    };

    state: FieldStatus;
    value: unknown | null;
    confidence: number;
    effective_confidence: number;
    refs_found: number;
    min_refs: number;
    best_tier_seen: 0 | 1 | 2 | 3 | 4 | 5 | null;
    pass_target: number;
    meets_pass_target: boolean;
    exact_match_required: boolean;
    need_score: number;

    reasons: Array<
      | "missing"
      | "conflict"
      | "low_conf"
      | "min_refs_fail"
      | "tier_pref_unmet"
      | "publish_gate_block"
    >;

    history: {
      existing_queries: string[];
      domains_tried: string[];
      host_classes_tried: HostClass[];
      evidence_classes_tried: EvidenceClass[];
      query_count: number;
      urls_examined_count: number;
      no_value_attempts: number;
      duplicate_attempts_suppressed: number;
    };
  }>;

  // minimal deterministic handoff into planning
  planner_seed: {
    missing_critical_fields: string[];
    unresolved_fields: string[];
    existing_queries: string[];
    current_product_identity: {
      category: string;
      brand: string;
      model: string;
    };
  };

  debug?: {
    idx_runtime_present?: string[];
  };
};




// SCHEMA 3 — NEEDSET PLANNER CONTEXT
// Purpose: merged adapter that gives the planning LLM everything it needs.
// This is where we fix the "same garbage over and over" problem.
// Renamed from "Search Planning Context" — "search profile" belongs to stage 2, not here.

type GroupPriority = "core" | "secondary" | "optional";
type GroupPhase = "now" | "next" | "hold";

type SearchPlanningContext = {
  schema_version: "search_planning_context.v2";

  run: {
    run_id: string;
    category: string;
    product_id: string;
    brand: string;
    model: string;
    base_model: string;             // base model name for variant products
    aliases: string[];              // known product name aliases (GPX2, VV3P, etc.)
    round: number;
    round_mode: "seed" | "carry_forward" | "repair";
  };

  identity: NeedSetOutput["identity"];

  needset: {
    summary: NeedSetOutput["summary"];
    blockers: NeedSetOutput["blockers"];
    missing_critical_fields: string[];
    unresolved_fields: string[];
    fields: NeedSetOutput["fields"];
    existing_queries: string[];
  };

  planner_limits: {
    phase2LlmEnabled: boolean;
    llmModelPlan?: string;
    llmPlanProvider?: string;
    llmPlanBaseUrl?: string;
    // llmPlanApiKey removed — never serialized into schema output (security)

    discoveryMaxQueries: number;
    discoveryMaxDiscovered: number;
    maxUrlsPerProduct: number;
    maxCandidateUrls: number;
    maxPagesPerDomain: number;
    maxRunSeconds: number;

    searchProfileCapMapJson?: {
      deterministicAliasCap: number;
      llmAliasValidationCap: number;
      llmDocHintQueriesCap: number;
      llmFieldTargetQueriesCap: number;
      dedupeQueriesCap: number;
    };
  };

  // REQUIRED STATIC MAP to make the pretty panel truthful
  group_catalog: Record<string, {
    label: string;
    desc: string;
    source_target: string;
    content_target: string;
    search_intent: string;
    host_class: string;
  }>;

  // DERIVED GROUP ROLLUPS — this is what the planning step actually consumes
  focus_groups: Array<{
    key: string;                     // from group_key
    label: string;                   // from group_catalog
    desc: string;                    // from group_catalog
    source_target: string;           // from group_catalog
    content_target: string;          // from group_catalog
    search_intent: string;           // from group_catalog
    host_class: string;              // from group_catalog

    field_keys: string[];
    unresolved_field_keys: string[];
    satisfied_field_keys: string[];
    weak_field_keys: string[];
    conflict_field_keys: string[];
    search_exhausted_field_keys: string[];  // fields with no_value_attempts>=3 AND evidence_classes>=3
    search_exhausted_count: number;

    core_unresolved_count: number;
    secondary_unresolved_count: number;
    optional_unresolved_count: number;
    exact_match_count: number;

    // de-duplicated unions aggregated from non-accepted fields' idx/history
    query_terms_union: string[];
    domain_hints_union: string[];
    preferred_content_types_union: string[];
    existing_queries_union: string[];
    domains_tried_union: string[];
    host_classes_tried_union: HostClass[];
    evidence_classes_tried_union: EvidenceClass[];
    aliases_union: string[];               // product name variants (GPX2, G Pro X2, etc.)

    no_value_attempts: number;
    duplicate_attempts_suppressed: number;
    urls_examined_count: number;            // sum of per-field history.urls_examined_count
    query_count: number;                    // sum of per-field history.query_count

    // derived display/control fields
    priority: GroupPriority;
    phase: GroupPhase;                      // "hold" when all non-accepted fields are search-exhausted
  }>;

  // Flat lookup: field_key → required_level.
  // Enables Schema 4 to derive bundles[].fields[].bucket without carrying full fields array.
  field_priority_map: Record<string, RequiredLevel>;

  // optional if available — this is where "learning" belongs
  learning?: {
    query_index_hits?: Array<{
      query: string;
      query_hash: string;
      family?: string;
      yield_score?: number;
      last_success_at?: string | null;
    }>;
    url_index_hits?: Array<{
      url: string;
      host: string;
      yield_score?: number;
      last_success_at?: string | null;
    }>;
    dead_query_hashes?: string[];
    dead_domains?: string[];
  };

  // previous round snapshot — needed to compute meaningful deltas
  previous_round_fields?: Array<{
    field_key: string;
    state: "missing" | "weak" | "conflict" | "satisfied";
  }>;
};



// SCHEMA 4 — NEEDSET PLANNER OUTPUT
// Purpose: the final stage-1 artifact. Assembled from Schema 3 + LLM response.
// This BOTH:
//   1) feeds the downstream handoff deterministically (search queries to execute)
//   2) fills the NeedSetPlanner.jsx panel 100%
//
// Renamed from "Search Plan Output" — "search profile" belongs to stage 2, not here.
//
// DATA SOURCE LEGEND:
//   [S3]   = deterministic from Schema 3 (NeedSet Planner Context)
//   [LLM]  = from the planner LLM response
//   [POST] = computed post-LLM from the generated queries + Schema 3 data

type QueryFamily =
  | "manufacturer_html"
  | "manual_pdf"
  | "support_docs"
  | "review_lookup"
  | "benchmark_lookup"
  | "fallback_web"
  | "targeted_single";

type NeedSetPlannerOutput = {
  schema_version: "needset_planner_output.v2";

  run: {                                     // [S3] passthrough from Schema 3
    run_id: string;
    category: string;
    product_id: string;
    brand: string;
    model: string;
    round: number;
    round_mode: "seed" | "carry_forward" | "repair";
  };

  planner: {
    mode: "llm" | "disabled" | "error";     // [POST] which path was taken
    model: string;                           // [S3] resolved model name
    planner_complete: boolean;               // [POST] did LLM respond successfully
    planner_confidence: number;              // [LLM] overall plan confidence (0-1)
    queries_generated: number;               // [POST] count after dedup + caps
    duplicates_suppressed: number;           // [POST] queries dropped by dedup
    targeted_exceptions: number;             // [LLM] exceptional queries added outside normal rules
    error: string | null;                    // [POST] error message if mode='error'
  };

  // ─── PANEL PAYLOAD ─── (NeedSetPlanner.jsx consumes this object directly)
  panel: {
    round: number;                           // [S3] ctx.run.round
    round_mode: "seed" | "carry_forward" | "repair";  // [S3] ctx.run.round_mode

    identity: {                              // [S3] passthrough from Schema 3
      state: PanelIdentityState;
      manufacturer?: string | null;
      model?: string | null;
      confidence: number;
      official_domain?: string | null;
      support_domain?: string | null;
    };

    summary: {                               // [S3] passthrough from Schema 3 needset.summary
      total: number;
      resolved: number;
      core_total: number;
      core_unresolved: number;
      secondary_total: number;
      secondary_unresolved: number;
      optional_total: number;
      optional_unresolved: number;
      conflicts: number;
    };

    blockers: {                              // [S3] passthrough from Schema 3 needset.blockers
      missing: number;
      weak: number;
      conflict: number;
      needs_exact_match: number;
      search_exhausted: number;
    };

    profile_influence: {                     // [POST] computed from generated queries
      manufacturer_html: number;             // count of queries with this family
      manual_pdf: number;
      support_docs: number;
      review_lookup: number;
      benchmark_lookup: number;
      fallback_web: number;
      targeted_single: number;
      duplicates_suppressed: number;         // queries dropped by dedup (LLM + post-LLM)
      focused_bundles: number;               // bundles that have ≥1 query
      targeted_exceptions: number;           // exceptional queries (from LLM)
      total_queries: number;                 // total after dedup
      trusted_host_share: number;            // manufacturer_html + support_docs count
      docs_manual_share: number;             // manual_pdf count
    };

    bundles: Array<{
      key: string;                           // [S3] focus_groups[].key
      label: string;                         // [S3] focus_groups[].label (from group_catalog)
      desc: string;                          // [S3] focus_groups[].desc (from group_catalog)
      priority: "core" | "secondary" | "optional";  // [S3] focus_groups[].priority
      phase: "now" | "next" | "hold";        // [S3] focus_groups[].phase
      source_target: string;                 // [S3] focus_groups[].source_target
      content_target: string;                // [S3] focus_groups[].content_target
      search_intent: string | null;          // [S3] focus_groups[].search_intent
      host_class: string | null;             // [S3] focus_groups[].host_class
      query_family_mix: string | null;       // [LLM] human-readable strategy description
      reason_active: string | null;          // [LLM] why this group is being searched

      queries: Array<{                       // [LLM] + [POST] dedup/cap
        q: string;
        family: QueryFamily;
      }>;

      fields: Array<{                        // [POST] assembled from Schema 3 field breakdowns
        key: string;
        state: "satisfied" | "missing" | "weak" | "conflict";
        bucket: "core" | "secondary" | "expected" | "optional";
        // state mapping: accepted→satisfied, unknown→missing, weak→weak, conflict→conflict
        // bucket mapping: identity/critical→core, required→secondary, expected→expected, optional→optional
      }>;
    }>;

    deltas: Array<{                          // [POST] compare previous_round_fields vs current
      field: string;
      from: "missing" | "weak" | "conflict" | "satisfied";
      to: "missing" | "weak" | "conflict" | "satisfied";
    }>;
  };

  // ─── DOWNSTREAM HANDOFF ─── (feeds next pipeline stage deterministically)
  search_plan_handoff: {
    queries: Array<{                         // [POST] final deduped query list
      q: string;
      query_hash: string;
      family: QueryFamily;
      group_key: string;
      target_fields: string[];
      preferred_domains: string[];
      exact_match_required: boolean;
    }>;
    query_hashes: string[];                  // [POST] hash list for frontier dedup
    total: number;
  };

  // ─── LEARNING WRITEBACK ─── (feeds next round's Schema 1 history)
  learning_writeback: {
    query_hashes_generated: string[];
    queries_generated: string[];
    families_used: QueryFamily[];
    domains_targeted: string[];
    groups_activated: string[];
    duplicates_suppressed: number;
  };
};



## LOGIC BOX 1 — NeedSetStartInput → NeedSetOutput

1. Normalize every field row independently.
   - Lowercase and trim `query_terms`
   - Normalize `domain_hints` to canonical host form
   - Deduplicate `preferred_content_types`
   - Deduplicate `existing_queries`

2. Do NOT lift per-key hints to the top level.
   - `query_terms`, `domain_hints`, `preferred_content_types`, and `aliases` stay attached to the field row
   - The only top-level IDX list is `debug.idx_runtime_present`, and that is UI/debug only

3. Score each field.
   - NeedSet uses:
     - `required_level`
     - `min_evidence_refs`
     - `pass_target`
     - `exact_match_required`
     - current field state
     - current reasons
   - It computes:
     - `need_score`
     - summary counts
     - blockers
     - unresolved field list
     - missing critical fields

4. Preserve field history.
   - `existing_queries`
   - `domains_tried`
   - `host_classes_tried`
   - `evidence_classes_tried`
   - `no_value_attempts`
   - `duplicate_attempts_suppressed`

5. Emit a field-first NeedSet artifact.
   - No bundle magic here yet
   - Just real field truth + planner seed





   ## LOGIC BOX 2 — NeedSetOutput → NeedSetPlannerContext

1. Build `focus_groups` from `group_key`.
   - Group fields by `group_key`
   - Separate:
     - `unresolved_field_keys`
     - `satisfied_field_keys`
     - `weak_field_keys`
     - `conflict_field_keys`

2. Attach `group_catalog`.
   - This is the only static map needed to make the pretty bundle cards truthful
   - It supplies:
     - `label`
     - `desc`
     - `source_target`
     - `content_target`
     - `search_intent`
     - `host_class`

3. Derive group-level counts and phase.
   - `core_unresolved_count`
   - `secondary_unresolved_count`
   - `optional_unresolved_count`
   - `exact_match_count`
   - `priority`
   - `phase`

4. Aggregate hints and history with SET semantics.
   - `query_terms_union = union(all unresolved fields.query_terms)`
   - `domain_hints_union = union(all unresolved fields.domain_hints)`
   - `preferred_content_types_union = union(all unresolved fields.preferred_content_types)`
   - `existing_queries_union = union(all unresolved fields.history.existing_queries)`
   - `domains_tried_union = union(all unresolved fields.history.domains_tried)`

5. Merge learning if available.
   - Add `query_index_hits`
   - Add `url_index_hits`
   - Add `dead_query_hashes`
   - Add `dead_domains`

6. Result: planner sees structured groups, not a bag of repeated keys.



## LOGIC BOX 3 — NeedSetPlannerContext → LLM PLANNING STEP

Input: Schema 3 (`NeedSetPlannerContext`)
Output: raw LLM response (groups with queries, confidence, metadata)

### What the LLM provides (only these 4 things)
- `queries[]` per group (the actual search query text + family)
- `query_family_mix` per group (human-readable strategy description)
- `reason_active` per group (why this group is being searched)
- `planner_confidence` (overall plan confidence 0-1)

### What the LLM must NOT invent
- `label`, `desc`, `source_target`, `content_target`, `search_intent`, `host_class`
  — these come from `group_catalog` deterministically via Schema 3

### Hard anti-garbage rules before LLM call
1. Filter focus_groups to only `phase='now'` and `phase='next'`
2. Remove `dead_domains` from `domain_hints_union` per group
3. Remove `dead_query_hashes` from `existing_queries_union`
4. Remove any group with zero unresolved fields from `now`
5. Reject a query family if that same family was already used for the same unresolved field set and produced no value
6. Cap repeated host use with `maxPagesPerDomain`
7. Enforce:
   - max 2 query families per group by default
   - max 1 query per family unless prior attempt was no-value
8. If a field already has enough independent evidence classes, it must not be targeted again

### LLM payload projection
Send to LLM: identity (brand/model/category), round, missing_critical_fields, limits,
and per active group: key, phase, priority, field breakdowns (unresolved/weak/conflict),
search hints (query_terms/domain_hints/aliases/content_types), anti-garbage history
(domains_tried/host_classes_tried/evidence_classes_tried/no_value_attempts), and
catalog metadata (source_target/content_target/search_intent/host_class).

### Hard anti-garbage rules after LLM return
1. Normalize query text (trim, lowercase for hashing)
2. Compute `query_hash` per query
3. Deduplicate by `query_hash` (against existing queries + within batch)
4. Drop any output query that only paraphrases an existing query without adding a new family, host class, or content type
5. Enforce `discoveryMaxQueries` global cap
6. Enforce per-group cap (max 3 per group)

### Disabled/error paths
- If `phase2LlmEnabled=false` or no API key → mode='disabled', empty queries
- If LLM call throws → mode='error', empty queries, planner_complete=false


## LOGIC BOX 4 — LLM Response + NeedSetPlannerContext → NeedSetPlannerOutput

Input: Schema 3 (`NeedSetPlannerContext`) + LLM response + deduped query list
Output: Schema 4 (`NeedSetPlannerOutput`)

### Data source legend
- `[S3]` = deterministic from Schema 3
- `[LLM]` = from the planner LLM response
- `[POST]` = computed post-LLM from the generated queries + Schema 3 data

### 1. Build `planner` block
   - `mode` [POST]: 'llm' | 'disabled' | 'error'
   - `model` [S3]: resolved model name from planner_limits
   - `planner_complete` [POST]: did LLM respond successfully
   - `planner_confidence` [LLM]: from llmResult.planner_confidence
   - `queries_generated` [POST]: count of final deduped queries
   - `duplicates_suppressed` [POST]: total queries dropped during dedup
   - `targeted_exceptions` [LLM]: from llmResult.targeted_exceptions
   - `error` [POST]: error message if mode='error', null otherwise

### 2. Build `panel.profile_influence` [POST]
   - Initialize all 7 family keys to 0: `manufacturer_html`, `manual_pdf`, `support_docs`, `review_lookup`, `benchmark_lookup`, `fallback_web`, `targeted_single`
   - Count queries by family
   - Compute derived fields:
     - `duplicates_suppressed`: from dedup counter
     - `focused_bundles`: count of bundles with ≥1 query
     - `targeted_exceptions`: from LLM response
     - `total_queries`: queries.length after dedup
     - `trusted_host_share`: manufacturer_html + support_docs count
     - `docs_manual_share`: manual_pdf count

### 3. Build `panel.bundles` — one row per focus_group
   - `key` [S3]: focus_groups[].key
   - `label`, `desc`, `source_target`, `content_target`, `search_intent`, `host_class` [S3]: from focus_groups[] (originally from group_catalog)
   - `priority`, `phase` [S3]: from focus_groups[]
   - `query_family_mix` [LLM]: matched by group key from LLM response
   - `reason_active` [LLM]: matched by group key from LLM response
   - `queries` [LLM+POST]: projected to `{ q, family }` only for panel (full objects in handoff)
   - `fields[]` [POST]: derived from field breakdowns + `field_priority_map`:
     - `key`: field_key
     - `state`: satisfied (if in satisfied_field_keys), weak, conflict, or missing
     - `bucket`: from field_priority_map[key] → identity/critical→core, required→secondary, expected→expected, optional→optional

### 4. Build `panel.deltas` [POST]
   - Compare `previous_round_fields[]` states to current field states
   - Emit `{ field, from, to }` for each changed field
   - Round 0 → empty `[]`

### 5. Build `search_plan_handoff` [POST]
   - `queries`: final deduped query list with full objects (q, query_hash, family, group_key, target_fields, preferred_domains, exact_match_required)
   - `query_hashes`: hash list for frontier dedup
   - `total`: query count

### 6. Build `learning_writeback` [POST]
   - `query_hashes_generated`: hashes of all generated queries
   - `queries_generated`: raw query text strings
   - `families_used`: distinct query families
   - `domains_targeted`: distinct preferred domains
   - `groups_activated`: distinct group keys with ≥1 query
   - `duplicates_suppressed`: total dedup count

### 7. Stage 2 (Search Profile) consumes `search_plan_handoff` only
   - Search Profile is execution input — it compiles and runs the deterministic query list
   - It must not invent new searches
   - All "creative" planning finishes here in Stage 1



   {
  "gemini_request": {
    "model": "gemini-2.5-flash-lite",
    "generationConfig": {
      "temperature": 0.2,
      "responseMimeType": "application/json"
    },
    "system_instruction": {
      "parts": [
        {
          "text": "You are a search planning step. Use only the provided focus groups, history, limits, and learning context. Do not invent group labels or host classes. Return only distinct query families that increase evidence diversity. Never emit paraphrase duplicates."
        }
      ]
    },
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "{\n  \"run\": {\n    \"category\": \"mouse\",\n    \"brand\": \"Logitech\",\n    \"model\": \"G Pro X Superlight 2\",\n    \"round\": 0,\n    \"round_mode\": \"seed\"\n  },\n  \"missing_critical_fields\": [\"sensor_brand\", \"sensor_model\"],\n  \"focus_groups\": [\n    {\n      \"key\": \"core_specs\",\n      \"label\": \"Core Specs\",\n      \"unresolved_field_keys\": [\"sensor_brand\", \"sensor_model\", \"cable_type\"],\n      \"query_terms_union\": [\"sensor\", \"dpi\", \"polling rate\", \"specs\"],\n      \"domain_hints_union\": [\"logitechg.com\", \"support.logi.com\"],\n      \"preferred_content_types_union\": [\"html\", \"support\"],\n      \"existing_queries_union\": [\"logitech g pro x superlight 2 specs\"],\n      \"domains_tried_union\": [\"logitechg.com\"],\n      \"evidence_classes_tried_union\": [\"manufacturer_html\"],\n      \"priority\": \"core\",\n      \"phase\": \"now\"\n    },\n    {\n      \"key\": \"docs_manual\",\n      \"label\": \"Docs & Manuals\",\n      \"unresolved_field_keys\": [\"manual_link\", \"spec_sheet_url\", \"support_page\"],\n      \"query_terms_union\": [\"manual\", \"pdf\", \"support\"],\n      \"domain_hints_union\": [\"support.logi.com\"],\n      \"preferred_content_types_union\": [\"pdf\", \"support\"],\n      \"existing_queries_union\": [],\n      \"domains_tried_union\": [],\n      \"evidence_classes_tried_union\": [],\n      \"priority\": \"secondary\",\n      \"phase\": \"now\"\n    }\n  ],\n  \"planner_limits\": {\n    \"max_queries_total\": 4,\n    \"max_queries_per_group\": 2,\n    \"max_pages_per_domain\": 2\n  },\n  \"learning\": {\n    \"dead_query_hashes\": [],\n    \"dead_domains\": [],\n    \"query_index_hits\": [],\n    \"url_index_hits\": []\n  }\n}"
          }
        ]
      }
    ]
  }
}



{
  "gemini_response_example": {
    "planner_confidence": 0.87,
    "groups": [
      {
        "key": "core_specs",
        "phase": "now",
        "reason_active": "2 core fields still unresolved",
        "query_family_mix": "1 manufacturer_html, 1 support_docs",
        "queries": [
          {
            "family": "manufacturer_html",
            "q": "site:logitechg.com Logitech G Pro X Superlight 2 sensor specs"
          },
          {
            "family": "support_docs",
            "q": "site:support.logi.com Logitech G Pro X Superlight 2 sensor support"
          }
        ]
      },
      {
        "key": "docs_manual",
        "phase": "now",
        "reason_active": "3 secondary documentation fields missing",
        "query_family_mix": "1 manual_pdf, 1 support_docs",
        "queries": [
          {
            "family": "manual_pdf",
            "q": "Logitech G Pro X Superlight 2 manual pdf"
          },
          {
            "family": "support_docs",
            "q": "site:support.logi.com Logitech G Pro X Superlight 2"
          }
        ]
      }
    ],
    "duplicates_suppressed": 2,
    "targeted_exceptions": 0
  }
}



# WHAT IS STILL MISSING AFTER THE 4 SCHEMAS AND LOGIC BOXES?   CLAUD TO FIGURE OUT HOW TO GETTHIS DATA , BEST TO PROBABLY ADD TO THE LLM CALL ABOVE AND CHANGE THE LLM JSON TO ACHIVE EVERYTHING 
There are **0 blocking data gaps** left to fill the current NeedSet · Search Planner panel if you implement the schemas exactly as above.

What remains are **implementation notes**, not missing schema fields:

1. `group_catalog` must be populated
   - This is the only static truth source needed for:
     - `label`
     - `desc`
     - `source_target`
     - `content_target`
     - `search_intent`
     - `host_class`
   - Without it, the pretty bundle cards cannot be truthful.

2. `previous_round_fields` must be loaded for non-empty `deltas`
   - Round 0 can emit `[]`
   - Later rounds need previous field state to produce real deltas.

3. The panel currently uses `identity.confidence` in HeroBand
   - That fills today’s JSX
   - If you want a true planner confidence field in the hero later, add a new display key and update JSX copy.

4. Search Profile must remain deterministic
   - It should consume `search_profile_input`
   - It must not invent new searches
   - All “creative” planning must finish before that handoff.

5. Anti-garbage enforcement must be implemented exactly
   - per-field history stays per-field
   - focus-group aggregation uses set semantics
   - query dedupe uses `query_hash`
   - repeat family suppression uses:
     - same family
     - same target field set
     - same preferred domain set
   - no query may be emitted twice unless prior attempt was no-value and the new attempt changes family, host class, or content type

If you wire those 5 implementation notes correctly, the current panel can be filled end to end with no missing data points and without generating repeated garbage like 3 polling-rate searches that all say the same thing.