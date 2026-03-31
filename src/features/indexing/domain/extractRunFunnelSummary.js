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
    candidates_triaged: 0,
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
      funnel.candidates_triaged = candidates;
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
  const allHosts = new Set([...classMap.keys(), ...hostStats.keys()]);
  const result = [];
  for (const host of allHosts) {
    const cls = classMap.get(host) || { role: 'unknown', safety: 'unknown' };
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
