/**
 * Lightweight pipeline funnel extraction from run_summary telemetry events.
 * Single O(n) pass — no heavyweight builder dependencies.
 *
 * @param {Array} events - telemetry.events[] from run_artifacts.run_summary
 * @param {object} counters - runs.counters JSON (fetched_ok, fetched_error, etc.)
 * @returns {object} Funnel summary with counts at each pipeline stage
 */
export function extractRunFunnelSummary(events = [], counters = {}) {
  const funnel = {
    queries_executed: 0,
    results_found: 0,
    candidates_unique: 0,
    llm_kept: 0,
    llm_dropped: 0,
    urls_selected: 0,
    urls_ok: Number(counters.fetched_ok ?? 0),
    urls_blocked: Number(counters.fetched_blocked ?? 0) + Number(counters.fetched_404 ?? 0),
    urls_error: Number(counters.fetched_error ?? 0),
    docs_parsed: Number(counters.parse_completed ?? 0),
    domains_total: 0,
    domains_safe: 0,
    domains_caution: 0,
  };

  for (const evt of events) {
    const type = String(evt?.event || '');
    const payload = evt?.payload || {};

    if (type === 'search_finished') {
      funnel.queries_executed += 1;
      funnel.results_found += Number(payload.result_count ?? 0);
    } else if (type === 'fetch_queued') {
      funnel.urls_selected += 1;
    } else if (type === 'serp_selector_completed') {
      const candidates = Array.isArray(payload.candidates) ? payload.candidates.length : 0;
      funnel.candidates_unique = candidates;
      funnel.llm_kept = Number(payload.kept_count ?? 0);
      funnel.llm_dropped = Number(payload.dropped_count ?? 0);
    } else if (type === 'domains_classified') {
      const classifications = Array.isArray(payload.classifications) ? payload.classifications : [];
      funnel.domains_total = classifications.length;
      funnel.domains_safe = classifications.filter((c) => c.safety_class === 'safe').length;
      funnel.domains_caution = classifications.filter((c) => c.safety_class === 'caution').length;
    }
  }

  return funnel;
}

/**
 * Combine domain classification events with crawl_sources to produce per-domain summary.
 *
 * @param {Array} events - telemetry.events[] from run_summary
 * @param {Array} crawlSources - rows from crawl_sources table
 * @returns {Array} Per-domain breakdown with role, safety, URL counts, errors
 */
export function extractDomainBreakdown(events = [], crawlSources = []) {
  // WHY: Build classification lookup from the domains_classified event.
  const classMap = new Map();
  for (const evt of events) {
    if (evt?.event !== 'domains_classified') continue;
    const classifications = Array.isArray(evt.payload?.classifications) ? evt.payload.classifications : [];
    for (const c of classifications) {
      classMap.set(String(c.domain || '').toLowerCase(), {
        role: c.role || 'unknown',
        safety: c.safety_class || 'unknown',
      });
    }
  }

  // WHY: Aggregate crawl results by host.
  const hostStats = new Map();
  for (const cs of crawlSources) {
    const host = String(cs.host || '').toLowerCase();
    if (!host) continue;
    const entry = hostStats.get(host) || { urls: 0, ok: 0, errors: 0, totalSize: 0 };
    entry.urls += 1;
    const status = Number(cs.http_status) || 0;
    if (status >= 200 && status < 400) entry.ok += 1;
    else entry.errors += 1;
    entry.totalSize += Number(cs.size_bytes) || 0;
    hostStats.set(host, entry);
  }

  // WHY: Merge classification + stats for every host seen.
  // Classifications use bare domains (amazon.com) but crawl_sources uses
  // full hostnames (www.amazon.com). Try: exact → www-stripped → parent domain.
  const allHosts = new Set([...classMap.keys(), ...hostStats.keys()]);
  const result = [];
  for (const host of allHosts) {
    const cls = resolveClassification(classMap, host);
    const stats = hostStats.get(host) || { urls: 0, ok: 0, errors: 0, totalSize: 0 };
    result.push({
      domain: host,
      role: cls.role,
      safety: cls.safety,
      urls: stats.urls,
      ok: stats.ok,
      errors: stats.errors,
      avg_size: stats.urls > 0 ? Math.round(stats.totalSize / stats.urls) : 0,
    });
  }

  return result.sort((a, b) => b.urls - a.urls);
}

/**
 * Extract fetch errors/issues from telemetry events.
 * Captures HTTP 4xx/5xx, timeouts, and other fetch failures.
 *
 * @param {Array} events - telemetry.events[] from run_summary
 * @param {Map} domainClassMap - domain → { role, safety } lookup (optional)
 * @returns {Array} Error records with url, host, error_type, http_status, response_ms, domain_safety
 */
export function extractFetchErrors(events = [], domainClassMap = new Map()) {
  // WHY: Build domain classification if not provided.
  const classLookup = domainClassMap.size > 0 ? domainClassMap : buildClassMap(events);

  const errors = [];
  for (const evt of events) {
    if (evt?.event !== 'fetch_finished') continue;
    const p = evt?.payload || {};
    const statusClass = String(p.status_class || '');
    const status = Number(p.status) || 0;
    const isError = statusClass === 'blocked' || statusClass === '404' || statusClass === 'error'
      || status >= 400 || String(p.error || '').includes('timed out');

    if (!isError) continue;

    const host = extractHost(String(p.url || p.final_url || ''));
    const cls = classLookup.get(host) || { role: 'unknown', safety: 'unknown' };
    const isTimeout = String(p.error || '').includes('timed out');

    errors.push({
      url: String(p.url || p.final_url || ''),
      host,
      error_type: isTimeout ? 'timeout' : status >= 500 ? 'http_5xx' : status >= 400 ? `http_${status}` : 'fetch_error',
      http_status: status,
      response_ms: Number(p.ms) || 0,
      domain_role: cls.role,
      domain_safety: cls.safety,
    });
  }

  return errors;
}

/**
 * Extract extraction summary from telemetry events.
 * Aggregates plugin artifacts (O(1) per plugin — auto-discovers new plugins)
 * and parse quality metrics.
 *
 * @param {Array} events - telemetry.events[] from run_summary
 * @returns {object} Extraction summary with per-plugin artifacts + parse quality
 */
export function extractExtractionSummary(events = []) {
  const plugins = {};
  let totalArtifacts = 0;
  let totalBytes = 0;
  let urlsParsed = 0;
  let totalCandidates = 0;
  let structuredDataFound = 0;
  let articlesExtracted = 0;
  let lowQualityArticles = 0;

  for (const evt of events) {
    const type = String(evt?.event || '');
    const p = evt?.payload || {};

    if (type === 'extraction_plugin_completed') {
      const name = String(p.plugin || 'unknown');
      if (!plugins[name]) plugins[name] = { urls: 0, artifacts: 0, total_bytes: 0 };
      plugins[name].urls += 1;
      plugins[name].total_bytes += Number(p.result?.total_bytes ?? 0);
      totalBytes += Number(p.result?.total_bytes ?? 0);
    } else if (type === 'extraction_artifacts_persisted') {
      const name = String(p.plugin || 'unknown');
      if (!plugins[name]) plugins[name] = { urls: 0, artifacts: 0, total_bytes: 0 };
      const fileCount = Array.isArray(p.filenames) ? p.filenames.length : 0;
      plugins[name].artifacts += fileCount;
      totalArtifacts += fileCount;
    } else if (type === 'parse_finished') {
      urlsParsed += 1;
      totalCandidates += Number(p.candidate_count ?? 0);
      const hasStructured = (Number(p.structured_json_ld_count ?? 0) + Number(p.structured_microdata_count ?? 0) + Number(p.structured_opengraph_count ?? 0)) > 0;
      if (hasStructured) structuredDataFound += 1;
      if (Number(p.article_char_count ?? 0) > 0) articlesExtracted += 1;
      if (p.article_low_quality === true) lowQualityArticles += 1;
    }
  }

  return {
    plugins,
    total_artifacts: totalArtifacts,
    total_bytes: totalBytes,
    urls_parsed: urlsParsed,
    total_candidates: totalCandidates,
    structured_data_found: structuredDataFound,
    articles_extracted: articlesExtracted,
    low_quality_articles: lowQualityArticles,
  };
}

// WHY: crawl_sources hosts are full (www.amazon.com), classifications use bare (amazon.com).
function resolveClassification(classMap, host) {
  const fallback = { role: 'unknown', safety: 'unknown' };
  if (classMap.has(host)) return classMap.get(host);
  const stripped = host.replace(/^www\./, '');
  if (classMap.has(stripped)) return classMap.get(stripped);
  // WHY: Try parent domain (help.endgamegear.com → endgamegear.com)
  const parts = stripped.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (classMap.has(parent)) return classMap.get(parent);
  }
  return fallback;
}

function buildClassMap(events) {
  const map = new Map();
  for (const evt of events) {
    if (evt?.event !== 'domains_classified') continue;
    for (const c of (evt.payload?.classifications || [])) {
      map.set(String(c.domain || '').toLowerCase(), { role: c.role || 'unknown', safety: c.safety_class || 'unknown' });
    }
  }
  return map;
}

function extractHost(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
