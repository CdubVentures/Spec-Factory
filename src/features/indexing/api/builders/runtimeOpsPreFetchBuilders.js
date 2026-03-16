import { toInt, toFloat, parseTsMs, eventType, payloadOf } from './runtimeOpsEventPrimitives.js';

function classifyPrefetchLlmReason(reason) {
  const r = String(reason || '').trim().toLowerCase();
  if (r === 'brand_resolution') return 'brand_resolver';
  if (r.startsWith('discovery_planner')) return 'search_planner';
  if (r.includes('triage') || r.includes('rerank') || r.includes('serp')) return 'serp_triage';
  if (r === 'domain_safety_classification') return 'domain_classifier';
  return null;
}

function buildCrossQueryUrlCounts(details) {
  const urlQueryCount = {};
  for (const detail of details) {
    if (!Array.isArray(detail.results)) continue;
    for (const r of detail.results) {
      const url = String(r?.url || '').trim();
      if (url) urlQueryCount[url] = (urlQueryCount[url] || 0) + 1;
    }
  }
  return urlQueryCount;
}

export function buildPreFetchPhases(events, meta, artifacts) {
  const safeArtifacts = artifacts && typeof artifacts === 'object' ? artifacts : {};

  const needsetSnapshots = [];
  let lastNeedset = null;
  // WHY: Schema 4 panel data (bundles with queries, profile_influence, deltas)
  // is emitted mid-run by runDiscoverySeedPlan. The finalization emits a second
  // needset_computed with Schema 2 data that lacks this. Preserve the best
  // Schema 4 panel data across events so the GUI always shows it.
  let bestSchema4Panel = null;

  const llmPending = {};
  const llmGroups = {
    brand_resolver: [],
    search_planner: [],
    serp_triage: [],
    domain_classifier: [],
  };

  const searchPending = {};
  const searchResults = [];
  const searchThrottleByQuery = {};

  let brandResolution = null;
  const searchPlans = [];
  const searchResultDetails = [];
  const serpTriage = [];
  const domainHealth = [];

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    if (type === 'needset_computed') {
      const identityState = payload.identity?.state || String(payload.identity_status || '').trim() || null;
      const snap = {
        needset_size: toInt(payload.needset_size, 0),
        total_fields: toInt(payload.total_fields, 0),
        identity_state: identityState,
        ts,
      };
      needsetSnapshots.push(snap);
      const eventBundles = Array.isArray(payload.bundles) ? payload.bundles : [];
      const eventPi = payload.profile_influence && typeof payload.profile_influence === 'object' ? payload.profile_influence : null;
      const eventDeltas = Array.isArray(payload.deltas) ? payload.deltas : [];
      const eventHasSchema4Queries = eventBundles.some((b) => Array.isArray(b.queries) && b.queries.length > 0);
      if (eventHasSchema4Queries) {
        bestSchema4Panel = { bundles: eventBundles, profile_influence: eventPi, deltas: eventDeltas };
      }
      lastNeedset = {
        needset_size: snap.needset_size,
        total_fields: snap.total_fields,
        identity_state: identityState,
        fields: Array.isArray(payload.fields) ? payload.fields : [],
        summary: payload.summary && typeof payload.summary === 'object' ? payload.summary : {},
        blockers: payload.blockers && typeof payload.blockers === 'object' ? payload.blockers : {},
        bundles: eventBundles,
        profile_influence: eventPi,
        deltas: eventDeltas,
        rows: Array.isArray(payload.rows) ? payload.rows : [],
        round: typeof payload.round === 'number' ? payload.round : 0,
        round_mode: String(payload.round_mode || 'seed').trim(),
        schema_version: payload.schema_version || null,
      };
    }

    if (type === 'llm_started') {
      const reason = String(payload.reason || '').trim();
      const group = classifyPrefetchLlmReason(reason);
      if (group) {
        const batchId = String(payload.batch_id || '').trim();
        llmPending[batchId] = {
          group,
          reason,
          model: String(payload.model || '').trim(),
          provider: String(payload.provider || '').trim(),
          prompt_preview: payload.prompt_preview != null ? String(payload.prompt_preview) : null,
          started_ts: ts,
        };
      }
    }

    if (type === 'llm_finished') {
      const reason = String(payload.reason || '').trim();
      const group = classifyPrefetchLlmReason(reason);
      if (group) {
        const batchId = String(payload.batch_id || '').trim();
        const pending = llmPending[batchId];
        const startedTs = pending ? pending.started_ts : '';
        const durationMs = startedTs ? parseTsMs(ts) - parseTsMs(startedTs) : 0;
        const tokens = payload.tokens && typeof payload.tokens === 'object' ? payload.tokens : {};

        llmGroups[group].push({
          status: 'finished',
          reason: pending ? pending.reason : reason,
          model: String(payload.model || (pending ? pending.model : '') || '').trim(),
          provider: String(payload.provider || (pending ? pending.provider : '') || '').trim(),
          tokens: { input: toInt(tokens.input, 0), output: toInt(tokens.output, 0) },
          duration_ms: Math.max(0, durationMs),
          prompt_preview: pending ? pending.prompt_preview : null,
          response_preview: payload.response_preview != null ? String(payload.response_preview) : null,
          error: null,
        });
        delete llmPending[batchId];
      }
    }

    if (type === 'llm_failed') {
      const reason = String(payload.reason || '').trim();
      const group = classifyPrefetchLlmReason(reason);
      if (group) {
        const batchId = String(payload.batch_id || '').trim();
        const pending = llmPending[batchId];
        const startedTs = pending ? pending.started_ts : '';
        const durationMs = startedTs ? parseTsMs(ts) - parseTsMs(startedTs) : 0;

        llmGroups[group].push({
          status: 'failed',
          reason: pending ? pending.reason : reason,
          model: String(payload.model || (pending ? pending.model : '') || '').trim(),
          provider: String(payload.provider || (pending ? pending.provider : '') || '').trim(),
          tokens: { input: 0, output: 0 },
          duration_ms: Math.max(0, durationMs),
          prompt_preview: pending ? pending.prompt_preview : null,
          response_preview: null,
          error: String(payload.message || payload.error || 'LLM call failed').trim(),
        });
        delete llmPending[batchId];
      }
    }

    if (type === 'search_started') {
      const scope = String(payload.scope || '').trim().toLowerCase();
      const query = String(payload.query || '').trim();
      if (!query && scope !== 'query') {
        continue;
      }
      searchPending[query] = {
        query,
        provider: String(payload.provider || '').trim(),
        worker_id: String(payload.worker_id || '').trim(),
        started_ts: ts,
      };
    }

    if (type === 'search_finished') {
      const scope = String(payload.scope || '').trim().toLowerCase();
      const query = String(payload.query || '').trim();
      if (!query && scope !== 'query') {
        continue;
      }
      const pending = searchPending[query];
      const startedTs = pending ? pending.started_ts : '';
      const durationMs = startedTs ? parseTsMs(ts) - parseTsMs(startedTs) : 0;

      searchResults.push({
        query,
        provider: String(payload.provider || (pending ? pending.provider : '') || '').trim(),
        result_count: toInt(payload.result_count, 0),
        duration_ms: Math.max(0, durationMs),
        worker_id: String(payload.worker_id || (pending ? pending.worker_id : '') || '').trim(),
        throttle_events: toInt(searchThrottleByQuery[query]?.count, 0),
        throttle_wait_ms: toInt(searchThrottleByQuery[query]?.waitMs, 0),
        ts,
      });
      delete searchPending[query];
    }

    if (type === 'search_request_throttled') {
      const query = String(payload.query || '').trim();
      if (!query) {
        continue;
      }
      if (!searchThrottleByQuery[query]) {
        searchThrottleByQuery[query] = { count: 0, waitMs: 0 };
      }
      searchThrottleByQuery[query].count += 1;
      searchThrottleByQuery[query].waitMs += toInt(payload.wait_ms, 0);
    }

    if (type === 'brand_resolved') {
      brandResolution = {
        brand: String(payload.brand || '').trim(),
        status: String(payload.status || 'resolved').trim(),
        skip_reason: String(payload.skip_reason || '').trim(),
        official_domain: String(payload.official_domain || '').trim(),
        aliases: Array.isArray(payload.aliases) ? payload.aliases : [],
        support_domain: String(payload.support_domain || '').trim(),
        confidence: toFloat(payload.confidence, 0),
        candidates: Array.isArray(payload.candidates) ? payload.candidates.map((c) => ({
          name: String(c?.name || '').trim(),
          confidence: toFloat(c?.confidence, 0),
          evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets : [],
          disambiguation_note: String(c?.disambiguation_note || '').trim(),
        })) : [],
        reasoning: Array.isArray(payload.reasoning) ? payload.reasoning : [],
      };
    }

    if (type === 'search_plan_generated') {
      searchPlans.push({
        pass_index: toInt(payload.pass_index, searchPlans.length),
        pass_name: String(payload.pass_name || '').trim(),
        queries_generated: Array.isArray(payload.queries_generated) ? payload.queries_generated : [],
        stop_condition: String(payload.stop_condition || '').trim(),
        plan_rationale: String(payload.plan_rationale || '').trim(),
        query_target_map: payload.query_target_map && typeof payload.query_target_map === 'object'
          ? payload.query_target_map : {},
        missing_critical_fields: Array.isArray(payload.missing_critical_fields) ? payload.missing_critical_fields : [],
        mode: String(payload.mode || '').trim(),
      });
    }

    if (type === 'search_results_collected') {
      searchResultDetails.push({
        query: String(payload.query || '').trim(),
        provider: String(payload.provider || '').trim(),
        dedupe_count: toInt(payload.dedupe_count, 0),
        results: Array.isArray(payload.results) ? payload.results.map((r) => {
          const rawUrl = String(r?.url || '').trim();
          let domain = String(r?.domain || '').trim();
          if (!domain && rawUrl) {
            try { domain = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
          }
          return {
            title: String(r?.title || '').trim(),
            url: rawUrl,
            domain,
            snippet: String(r?.snippet || '').trim(),
            rank: toInt(r?.rank, 0),
            relevance_score: toFloat(r?.relevance_score, 0),
            decision: String(r?.decision || '').trim(),
            reason: String(r?.reason || '').trim(),
            provider: String(r?.provider || '').trim(),
          };
        }) : [],
      });
    }

    if (type === 'serp_triage_completed') {
      serpTriage.push({
        query: String(payload.query || '').trim(),
        kept_count: toInt(payload.kept_count, 0),
        dropped_count: toInt(payload.dropped_count, 0),
        candidates: Array.isArray(payload.candidates) ? payload.candidates.map((c) => ({
          url: String(c?.url || '').trim(),
          title: String(c?.title || '').trim(),
          domain: String(c?.domain || '').trim(),
          snippet: String(c?.snippet || '').trim(),
          score: toFloat(c?.score, 0),
          decision: String(c?.decision || '').trim(),
          rationale: String(c?.rationale || '').trim(),
          score_components: c?.score_components && typeof c.score_components === 'object'
            ? {
                base_relevance: toFloat(c.score_components.base_relevance, 0),
                tier_boost: toFloat(c.score_components.tier_boost, 0),
                identity_match: toFloat(c.score_components.identity_match, 0),
                penalties: toFloat(c.score_components.penalties, 0),
              }
            : { base_relevance: 0, tier_boost: 0, identity_match: 0, penalties: 0 },
        })) : [],
      });
    }

    if (type === 'domains_classified') {
      const classifications = Array.isArray(payload.classifications) ? payload.classifications : [];
      for (const cls of classifications) {
        domainHealth.push({
          domain: String(cls?.domain || '').trim(),
          role: String(cls?.role || '').trim(),
          safety_class: String(cls?.safety_class || '').trim(),
          budget_score: toFloat(cls?.budget_score, 0),
          cooldown_remaining: toInt(cls?.cooldown_remaining, 0),
          success_rate: toFloat(cls?.success_rate, 0),
          avg_latency_ms: toInt(cls?.avg_latency_ms, 0),
          notes: String(cls?.notes || '').trim(),
        });
      }
    }
  }

  // WHY: If the last needset_computed event (finalization) lost Schema 4 panel
  // data, restore it from the best mid-run emission that had queries.
  if (lastNeedset && bestSchema4Panel) {
    const lastHasQueries = lastNeedset.bundles.some((b) => Array.isArray(b.queries) && b.queries.length > 0);
    if (!lastHasQueries) {
      lastNeedset.bundles = bestSchema4Panel.bundles;
      lastNeedset.profile_influence = bestSchema4Panel.profile_influence;
      lastNeedset.deltas = bestSchema4Panel.deltas;
    }
  }

  const artNeedset = safeArtifacts.needset && typeof safeArtifacts.needset === 'object' ? safeArtifacts.needset : null;
  const artProfile = safeArtifacts.search_profile && typeof safeArtifacts.search_profile === 'object' ? safeArtifacts.search_profile : null;
  const artBrand = safeArtifacts.brand_resolution && typeof safeArtifacts.brand_resolution === 'object' ? safeArtifacts.brand_resolution : null;

  const needset = lastNeedset
    ? {
        ...lastNeedset,
        snapshots: needsetSnapshots,
      }
    : artNeedset
      ? {
          needset_size: Array.isArray(artNeedset.fields)
            ? artNeedset.fields.filter((f) => f && f.state !== 'accepted').length
            : toInt(artNeedset.total_fields, 0),
          total_fields: toInt(artNeedset.total_fields, 0),
          identity_state: artNeedset.identity?.state || null,
          fields: Array.isArray(artNeedset.fields) ? artNeedset.fields : [],
          summary: artNeedset.summary && typeof artNeedset.summary === 'object' ? artNeedset.summary : {},
          blockers: artNeedset.blockers && typeof artNeedset.blockers === 'object' ? artNeedset.blockers : {},
          bundles: Array.isArray(artNeedset.bundles) ? artNeedset.bundles : [],
          profile_influence: artNeedset.profile_influence && typeof artNeedset.profile_influence === 'object' ? artNeedset.profile_influence : null,
          deltas: Array.isArray(artNeedset.deltas) ? artNeedset.deltas : [],
          rows: Array.isArray(artNeedset.rows) ? artNeedset.rows : [],
          round: typeof artNeedset.round === 'number' ? artNeedset.round : 0,
          round_mode: String(artNeedset.round_mode || 'seed').trim(),
          schema_version: artNeedset.schema_version || null,
          snapshots: needsetSnapshots,
        }
      : {
          needset_size: 0,
          total_fields: 0,
          identity_state: null,
          fields: [],
          summary: {},
          blockers: {},
          bundles: [],
          profile_influence: null,
          deltas: [],
          rows: [],
          round: 0,
          round_mode: 'seed',
          schema_version: null,
          snapshots: [],
        };

  const search_profile = artProfile
    ? {
        query_count: toInt(artProfile.query_count, Array.isArray(artProfile.query_rows) ? artProfile.query_rows.length : 0),
        selected_query_count: toInt(artProfile.selected_query_count, 0),
        provider: String(artProfile.provider || '').trim(),
        llm_query_planning: Boolean(artProfile.llm_query_planning),
        llm_query_model: String(artProfile.llm_query_model || '').trim(),
        llm_queries: Array.isArray(artProfile.llm_queries) ? artProfile.llm_queries : [],
        identity_aliases: Array.isArray(artProfile.identity_aliases) ? artProfile.identity_aliases : [],
        variant_guard_terms: Array.isArray(artProfile.variant_guard_terms) ? artProfile.variant_guard_terms : [],
        focus_fields: Array.isArray(artProfile.focus_fields) ? artProfile.focus_fields : [],
        query_rows: Array.isArray(artProfile.query_rows) ? artProfile.query_rows.filter((r) => !r?.frontier_cache) : [],
        query_guard: artProfile.query_guard && typeof artProfile.query_guard === 'object' ? artProfile.query_guard : {},
        hint_source_counts: artProfile.hint_source_counts && typeof artProfile.hint_source_counts === 'object' ? artProfile.hint_source_counts : {},
        field_rule_gate_counts: artProfile.field_rule_gate_counts && typeof artProfile.field_rule_gate_counts === 'object' ? artProfile.field_rule_gate_counts : {},
        field_rule_hint_counts_by_field: artProfile.field_rule_hint_counts_by_field && typeof artProfile.field_rule_hint_counts_by_field === 'object' ? artProfile.field_rule_hint_counts_by_field : {},
        generated_at: String(artProfile.generated_at || '').trim(),
        product_id: String(artProfile.product_id || '').trim(),
        source: String(artProfile.source || '').trim(),
        query_reject_log: Array.isArray(artProfile.query_reject_log) ? artProfile.query_reject_log : [],
        alias_reject_log: Array.isArray(artProfile.alias_reject_log) ? artProfile.alias_reject_log : [],
        effective_host_plan: artProfile.effective_host_plan && typeof artProfile.effective_host_plan === 'object' ? artProfile.effective_host_plan : null,
        brand_resolution: artProfile.brand_resolution && typeof artProfile.brand_resolution === 'object' ? artProfile.brand_resolution : null,
        schema4_planner: artProfile.schema4_planner && typeof artProfile.schema4_planner === 'object' ? artProfile.schema4_planner : null,
        schema4_learning: artProfile.schema4_learning && typeof artProfile.schema4_learning === 'object' ? artProfile.schema4_learning : null,
        schema4_panel: artProfile.schema4_panel && typeof artProfile.schema4_panel === 'object' ? artProfile.schema4_panel : null,
        base_model: String(artProfile.base_model || '').trim(),
        aliases: Array.isArray(artProfile.aliases) ? artProfile.aliases : [],
        discovered_count: toInt(artProfile.discovered_count, 0),
        approved_count: toInt(artProfile.approved_count, 0),
        candidate_count: toInt(artProfile.candidate_count, 0),
        llm_serp_triage: Boolean(artProfile.llm_serp_triage),
        serp_explorer: artProfile.serp_explorer && typeof artProfile.serp_explorer === 'object' ? artProfile.serp_explorer : null,
      }
    : {
        query_count: 0,
        selected_query_count: 0,
        provider: '',
        llm_query_planning: false,
        llm_query_model: '',
        llm_queries: [],
        identity_aliases: [],
        variant_guard_terms: [],
        focus_fields: [],
        query_rows: [],
        query_guard: {},
        hint_source_counts: {},
        field_rule_gate_counts: {},
        field_rule_hint_counts_by_field: {},
        generated_at: '',
        product_id: '',
        source: '',
        query_reject_log: [],
        alias_reject_log: [],
        effective_host_plan: null,
        brand_resolution: null,
        schema4_planner: null,
        schema4_learning: null,
        schema4_panel: null,
        base_model: '',
        aliases: [],
        discovered_count: 0,
        approved_count: 0,
        candidate_count: 0,
        llm_serp_triage: false,
        serp_explorer: null,
      };

  // Enrich searchResultDetails with triage decisions from serp_triage_completed
  // where URLs overlap between raw SERP results and triage candidates.
  if (serpTriage.length > 0 && searchResultDetails.length > 0) {
    const triageLookup = {};
    for (const t of serpTriage) {
      for (const c of t.candidates) {
        if (c.url) {
          triageLookup[c.url] = { decision: c.decision, score: c.score, rationale: c.rationale };
        }
      }
    }
    for (const detail of searchResultDetails) {
      for (const r of detail.results) {
        const match = triageLookup[r.url];
        if (match) {
          if (!r.decision) r.decision = match.decision;
          if (!r.relevance_score) r.relevance_score = match.score;
          if (!r.reason) r.reason = match.rationale;
        }
      }
    }
  }

  // Reconcile searchResults (from search_finished) with searchResultDetails
  // (from search_results_collected). These can be different query populations —
  // search_finished may only capture site-scoped queries while
  // search_results_collected captures broad queries that returned results.
  const searchResultQuerySet = new Set(searchResults.map((r) => r.query));
  for (const detail of searchResultDetails) {
    const detailQuery = String(detail.query || '').trim();
    if (detailQuery && !searchResultQuerySet.has(detailQuery)) {
      searchResults.push({
        query: detailQuery,
        provider: String(detail.provider || '').trim(),
        result_count: Array.isArray(detail.results) ? detail.results.length : 0,
        duration_ms: 0,
        worker_id: '',
        throttle_events: 0,
        throttle_wait_ms: 0,
        ts: '',
      });
    }
  }

  return {
    needset,
    search_profile,
    llm_calls: llmGroups,
    search_results: searchResults,
    brand_resolution: brandResolution || (artBrand ? {
      brand: String(artBrand.brand || '').trim(),
      status: String(artBrand.status || 'resolved').trim(),
      skip_reason: String(artBrand.skip_reason || '').trim(),
      official_domain: String(artBrand.official_domain || '').trim(),
      aliases: Array.isArray(artBrand.aliases) ? artBrand.aliases : [],
      support_domain: String(artBrand.support_domain || '').trim(),
      confidence: toFloat(artBrand.confidence, 0),
      candidates: Array.isArray(artBrand.candidates) ? artBrand.candidates.map((c) => ({
        name: String(c?.name || '').trim(),
        confidence: toFloat(c?.confidence, 0),
        evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets : [],
        disambiguation_note: String(c?.disambiguation_note || '').trim(),
      })) : [],
      reasoning: Array.isArray(artBrand.reasoning) ? artBrand.reasoning : [],
    } : null),
    search_plans: searchPlans,
    search_result_details: searchResultDetails,
    cross_query_url_counts: buildCrossQueryUrlCounts(searchResultDetails),
    serp_triage: serpTriage,
    domain_health: domainHealth,
  };
}
