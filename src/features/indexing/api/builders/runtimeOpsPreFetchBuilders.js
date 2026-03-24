import { toInt, toFloat, parseTsMs, eventType, payloadOf, projectShape, buildDefaults } from './runtimeOpsEventPrimitives.js';
// WHY: O(1) — LLM reason classification + shape descriptors from contract SSOT.
import {
  classifyPrefetchLlmReason,
  PREFETCH_LLM_GROUP_KEYS,
  SEARCH_RESULT_ENTRY_SHAPE,
  SEARCH_RESULT_DETAIL_SHAPE,
  SERP_SCORE_COMPONENTS_SHAPE,
  SERP_TRIAGE_CANDIDATE_SHAPE,
  SERP_TRIAGE_ENVELOPE_SHAPE,
  SERP_TRIAGE_FUNNEL_SHAPE,
  SEARCH_PROFILE_SHAPE,
  SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE,
} from '../contracts/prefetchContract.js';

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
  // WHY: Search plan panel data (bundles with queries, profile_influence, deltas)
  // is emitted mid-run by runDiscoverySeedPlan. The finalization emits a second
  // needset_computed with NeedSet assessment data that lacks this. Preserve the best
  // search plan panel data across events so the GUI always shows it.
  let bestPlannerPanel = null;

  const llmPending = {};
  // WHY: O(1) — group keys derived from contract SSOT, not hardcoded.
  const llmGroups = Object.fromEntries(PREFETCH_LLM_GROUP_KEYS.map((k) => [k, []]));

  const searchPending = {};
  const searchResults = [];
  const searchThrottleByQuery = {};

  let brandResolution = null;
  let queryJourney = null;
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
      const eventHasPlannerQueries = eventBundles.some((b) => Array.isArray(b.queries) && b.queries.length > 0);
      if (eventHasPlannerQueries) {
        bestPlannerPanel = { bundles: eventBundles, profile_influence: eventPi, deltas: eventDeltas };
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
        confidence: payload.confidence != null ? toFloat(payload.confidence, 0) : null,
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
        source: String(payload.source || '').trim(),
        enhancement_rows: Array.isArray(payload.enhancement_rows)
          ? payload.enhancement_rows.map((r) => projectShape(r, SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE))
          : [],
      });
    }

    if (type === 'query_journey_completed') {
      queryJourney = {
        selected_query_count: toInt(payload.selected_query_count, 0),
        selected_queries: Array.isArray(payload.selected_queries) ? payload.selected_queries : [],
        search_plan_query_count: toInt(payload.search_plan_query_count, 0),
        deterministic_query_count: toInt(payload.deterministic_query_count, 0),
        rejected_count: toInt(payload.rejected_count, 0),
      };
    }

    if (type === 'search_results_collected') {
      const _screenshotFilename = String(payload.screenshot_filename || '').trim();
      const envelope = projectShape(payload, SEARCH_RESULT_DETAIL_SHAPE);
      searchResultDetails.push({
        ...envelope,
        ...(_screenshotFilename ? { screenshot_filename: _screenshotFilename } : {}),
        results: Array.isArray(payload.results) ? payload.results.map((r) => {
          const projected = projectShape(r, SEARCH_RESULT_ENTRY_SHAPE);
          // WHY: Domain fallback — derive from URL when event omits domain.
          if (!projected.domain && projected.url) {
            try { projected.domain = new URL(projected.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
          }
          return projected;
        }) : [],
      });
    }

    if (type === 'serp_selector_completed') {
      const envelope = projectShape(payload, SERP_TRIAGE_ENVELOPE_SHAPE);
      const funnel = payload.funnel && typeof payload.funnel === 'object'
        ? projectShape(payload.funnel, SERP_TRIAGE_FUNNEL_SHAPE)
        : null;
      serpTriage.push({
        ...envelope,
        funnel,
        candidates: Array.isArray(payload.candidates) ? payload.candidates.map((c) => ({
          ...projectShape(c, SERP_TRIAGE_CANDIDATE_SHAPE),
          score_components: projectShape(
            c?.score_components && typeof c.score_components === 'object' ? c.score_components : {},
            SERP_SCORE_COMPONENTS_SHAPE,
          ),
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
          fetch_count: toInt(cls?.fetch_count, 0),
          blocked_count: toInt(cls?.blocked_count, 0),
          timeout_count: toInt(cls?.timeout_count, 0),
          last_blocked_ts: cls?.last_blocked_ts ? String(cls.last_blocked_ts).trim() : null,
          notes: String(cls?.notes || '').trim(),
        });
      }
    }
  }

  // WHY: If the last needset_computed event (finalization) lost search plan panel
  // data, restore it from the best mid-run emission that had queries.
  if (lastNeedset && bestPlannerPanel) {
    const lastHasQueries = lastNeedset.bundles.some((b) => Array.isArray(b.queries) && b.queries.length > 0);
    if (!lastHasQueries) {
      lastNeedset.bundles = bestPlannerPanel.bundles;
      lastNeedset.profile_influence = bestPlannerPanel.profile_influence;
      lastNeedset.deltas = bestPlannerPanel.deltas;
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
          schema_version: null,
          snapshots: [],
        };

  const search_profile = artProfile
    ? (() => {
        const projected = projectShape(artProfile, SEARCH_PROFILE_SHAPE);
        // WHY: query_count fallback — use query_rows length when query_count is missing.
        if (!artProfile.query_count && Array.isArray(artProfile.query_rows)) {
          projected.query_count = artProfile.query_rows.length;
        }
        // WHY: Filter frontier_cache rows from query_rows before sending to UI.
        if (Array.isArray(projected.query_rows)) {
          projected.query_rows = projected.query_rows.filter((r) => !r?.frontier_cache);
        }
        return projected;
      })()
    : buildDefaults(SEARCH_PROFILE_SHAPE);

  // Enrich searchResultDetails with triage decisions from serp_selector_completed
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
      reasoning: Array.isArray(artBrand.reasoning) ? artBrand.reasoning : [],
    } : null),
    search_plans: searchPlans,
    query_journey: queryJourney,
    search_result_details: searchResultDetails,
    cross_query_url_counts: buildCrossQueryUrlCounts(searchResultDetails),
    serp_selector: serpTriage,
    domain_health: domainHealth,
  };
}
