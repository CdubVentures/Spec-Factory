import path from 'node:path';
import {
  toInt, toFloat, parseTsMs, normalizeDomainToken, domainFromUrl, urlPathToken,
  addTokensFromText, incrementMapCounter, countMapValuesAbove, percentileFromSorted,
  hasKnownValue,
} from '../../../../shared/valueNormalizers.js';
import {
  classifySiteKind, isHelperPseudoDomain, createDomainBucket, createUrlStat,
  ensureUrlStat, bumpUrlStatEvent, choosePreferredSiteKind, cooldownSecondsRemaining,
  resolveHostBudget, resolveDomainChecklistStatus, classifyFetchOutcomeFromEvent,
  SITE_KIND_RANK, inferSiteKindByDomain,
} from '../../../../api/helpers/domainBucketHelpers.js';

export function createDomainChecklistBuilder({
  readGzipJsonlEvents,
  readJsonlEvents,
  loadProductCatalog,
}) {
  async function buildIndexingDomainChecklist({
    storage,
    config,
    outputRoot,
    category,
    productId = '',
    runId = '',
    windowMinutes = 120,
    includeUrls = false
  } = {}) {
    const normalizedCategory = String(category || '').trim().toLowerCase();
    const resolvedProductId = String(productId || '').trim();
    let resolvedRunId = String(runId || '').trim();
    const brandTokens = new Set();
    const notes = [];

    if (!normalizedCategory) {
      return {
        category: null,
        productId: resolvedProductId || null,
        runId: resolvedRunId || null,
        window_minutes: windowMinutes,
        rows: [],
        milestones: {
          manufacturer_domain: null,
          manufacturer: null,
          primary_domains: []
        },
        domain_field_yield: [],
        repair_queries: [],
        bad_url_patterns: [],
        notes: ['category_required']
      };
    }

    if (resolvedProductId) {
      const pidParts = resolvedProductId.split('-').filter(Boolean);
      if (pidParts.length >= 2) {
        addTokensFromText(brandTokens, pidParts[1]);
        addTokensFromText(brandTokens, `${pidParts[1]} ${pidParts[2] || ''}`.trim());
      }
      try {
        const catalog = await loadProductCatalog(config, normalizedCategory);
        const entry = catalog?.products?.[resolvedProductId] || null;
        if (entry?.brand) {
          addTokensFromText(brandTokens, entry.brand);
        }
      } catch {
        // ignore optional catalog lookup failures
      }
    }

    if (!resolvedRunId && resolvedProductId) {
      const latestBase = storage.resolveOutputKey(normalizedCategory, resolvedProductId, 'latest');
      const latestSummary = await storage.readJsonOrNull(`${latestBase}/summary.json`).catch(() => null);
      resolvedRunId = String(latestSummary?.runId || '').trim();
    }

    let events = [];
    if (resolvedProductId && resolvedRunId) {
      const runEventsKey = storage.resolveOutputKey(
        normalizedCategory,
        resolvedProductId,
        'runs',
        resolvedRunId,
        'logs',
        'events.jsonl.gz'
      );
      const runEventsPath = path.join(outputRoot, ...runEventsKey.split('/'));
      events = await readGzipJsonlEvents(runEventsPath);
    }
    if (events.length === 0) {
      const runtimeEventsPath = path.join(outputRoot, '_runtime', 'events.jsonl');
      events = await readJsonlEvents(runtimeEventsPath);
    }

    events = events.filter((evt) => {
      const evtCategory = String(evt.category || evt.cat || '').trim().toLowerCase();
      if (evtCategory) return evtCategory === normalizedCategory;
      const pid = String(evt.productId || evt.product_id || '').trim().toLowerCase();
      return pid.startsWith(`${normalizedCategory}-`);
    });

    if (resolvedProductId) {
      events = events.filter((evt) => String(evt.productId || evt.product_id || '').trim() === resolvedProductId);
    }

    if (!resolvedRunId) {
      let latestTs = -1;
      for (const evt of events) {
        const evtRunId = String(evt.runId || '').trim();
        if (!evtRunId) continue;
        const ts = parseTsMs(evt.ts);
        if (!Number.isFinite(ts)) continue;
        if (ts > latestTs) {
          latestTs = ts;
          resolvedRunId = evtRunId;
        }
      }
    }

    if (resolvedRunId) {
      events = events.filter((evt) => String(evt.runId || '').trim() === resolvedRunId);
    } else {
      const sinceMs = Date.now() - (Math.max(5, toInt(windowMinutes, 120)) * 60 * 1000);
      events = events.filter((evt) => {
        const ts = parseTsMs(evt.ts);
        return Number.isFinite(ts) && ts >= sinceMs;
      });
      notes.push('no_run_id_resolved_using_time_window');
    }

    const buckets = new Map();
    const startTimesByKey = new Map();
    const repairQueryRows = [];
    const repairQueryDedup = new Set();
    const badUrlPatterns = new Map();
    const ensureBucket = (domain, siteKind = 'other') => {
      const host = normalizeDomainToken(domain);
      if (!host) return null;
      if (!buckets.has(host)) {
        buckets.set(host, createDomainBucket(host, siteKind));
      } else {
        const existing = buckets.get(host);
        existing.site_kind = choosePreferredSiteKind(existing.site_kind, siteKind);
      }
      return buckets.get(host);
    };

    for (const evt of events) {
      const eventName = String(evt.event || '').trim();
      const urlRaw = String(evt.url || evt.finalUrl || evt.source_url || '').trim();
      const domain = domainFromUrl(urlRaw || evt.domain || evt.host || '');
      if (!domain) continue;
      if (isHelperPseudoDomain(domain)) continue;
      const siteKind = classifySiteKind({
        domain,
        role: evt.role,
        tierName: evt.tierName,
        brandTokens
      });
      const bucket = ensureBucket(domain, siteKind);
      if (!bucket) continue;
      if (urlRaw) bucket.seen_urls.add(urlRaw);

      const normalizedRole = String(evt.role || '').trim().toLowerCase();
      if (normalizedRole) {
        bucket.roles_seen.add(normalizedRole);
        bucket.site_kind = choosePreferredSiteKind(bucket.site_kind, classifySiteKind({
          domain,
          role: normalizedRole,
          tierName: evt.tierName,
          brandTokens
        }));
      }

      const normalizedUrl = urlRaw || '';
      const fetchKey = `${String(evt.runId || resolvedRunId || '').trim()}|${normalizedUrl}`;
      if (eventName === 'source_fetch_started') {
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        if (normalizedUrl) {
          bucket.candidates_checked_urls.add(normalizedUrl);
          bucket.urls_selected_urls.add(normalizedUrl);
          if (urlStat) {
            urlStat.checked_count += 1;
            urlStat.selected_count += 1;
            urlStat.fetch_started_count += 1;
            bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts });
          }
        }
        bucket.started_count += 1;
        const startTs = parseTsMs(evt.ts);
        if (Number.isFinite(startTs) && normalizedUrl) {
          const arr = startTimesByKey.get(fetchKey) || [];
          arr.push(startTs);
          startTimesByKey.set(fetchKey, arr);
        }
        continue;
      }

      if (eventName === 'source_discovery_only') {
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        if (normalizedUrl) {
          bucket.candidates_checked_urls.add(normalizedUrl);
          if (urlStat) {
            urlStat.checked_count += 1;
            bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts });
          }
        }
        continue;
      }

      if (eventName === 'source_fetch_skipped') {
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        const skipReason = String(evt.skip_reason || evt.reason || '').trim().toLowerCase();
        if (normalizedUrl) {
          bucket.candidates_checked_urls.add(normalizedUrl);
          if (urlStat) {
            urlStat.checked_count += 1;
            bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts });
          }
        }
        if (skipReason === 'cooldown') {
          bucket.dedupe_hits += 1;
        }
        if (skipReason === 'blocked_budget') {
          bucket.blocked_count += 1;
          if (normalizedUrl) incrementMapCounter(bucket.blocked_by_url, normalizedUrl);
          if (urlStat) {
            urlStat.blocked_count += 1;
          }
        }
        const nextRetry = String(evt.next_retry_ts || evt.next_retry_at || '').trim();
        if (nextRetry) {
          if (!bucket.next_retry_at) {
            bucket.next_retry_at = nextRetry;
          } else {
            const currentMs = parseTsMs(bucket.next_retry_at);
            const nextMs = parseTsMs(nextRetry);
            if (Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs < currentMs)) {
              bucket.next_retry_at = nextRetry;
            }
          }
        }
        continue;
      }

      if (eventName === 'fields_filled_from_source') {
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        const count = Math.max(
          0,
          toInt(evt.count, Array.isArray(evt.filled_fields) ? evt.filled_fields.length : 0)
        );
        bucket.fields_filled_count += count;
        if (normalizedUrl) {
          bucket.indexed_urls.add(normalizedUrl);
          if (urlStat) {
            urlStat.indexed = true;
            bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts });
          }
        }
        continue;
      }

      if (eventName === 'url_cooldown_applied') {
        bucket.dedupe_hits += 1;
        const nextRetry = String(
          evt.next_retry_ts || evt.next_retry_at || evt.cooldown_until || ''
        ).trim();
        const cooldownReason = String(evt.reason || '').trim();
        if (cooldownReason === 'path_dead_pattern') {
          const urlPath = String(urlPathToken(normalizedUrl || evt.url || evt.source_url || '') || '').trim() || '/';
          const patternKey = `${domain}|${urlPath}`;
          const existingPattern = badUrlPatterns.get(patternKey) || {
            domain,
            path: urlPath,
            reason: cooldownReason,
            count: 0,
            last_ts: ''
          };
          existingPattern.count += 1;
          const eventTs = String(evt.ts || '').trim();
          if (eventTs && (!existingPattern.last_ts || parseTsMs(eventTs) >= parseTsMs(existingPattern.last_ts))) {
            existingPattern.last_ts = eventTs;
          }
          badUrlPatterns.set(patternKey, existingPattern);
        }
        if (nextRetry) {
          if (!bucket.next_retry_at) {
            bucket.next_retry_at = nextRetry;
          } else {
            const currentMs = parseTsMs(bucket.next_retry_at);
            const nextMs = parseTsMs(nextRetry);
            if (Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs < currentMs)) {
              bucket.next_retry_at = nextRetry;
            }
          }
        }
        continue;
      }

      if (eventName === 'repair_query_enqueued') {
        const query = String(evt.query || '').trim();
        if (query) {
          const sourceUrl = String(evt.source_url || normalizedUrl || '').trim();
          const reason = String(evt.reason || '').trim();
          const dedupeKey = `${domain}|${query}|${reason}|${sourceUrl}`;
          if (!repairQueryDedup.has(dedupeKey)) {
            repairQueryDedup.add(dedupeKey);
            repairQueryRows.push({
              ts: String(evt.ts || '').trim() || null,
              domain,
              query,
              status: toInt(evt.status, 0),
              reason: reason || null,
              source_url: sourceUrl || null,
              cooldown_until: String(evt.cooldown_until || evt.next_retry_ts || '').trim() || null,
              doc_hint: String(evt.doc_hint || '').trim() || null,
              field_targets: Array.isArray(evt.field_targets)
                ? evt.field_targets.map((row) => String(row || '').trim()).filter(Boolean).slice(0, 20)
                : []
            });
          }
        }
        continue;
      }

      if (eventName === 'source_processed' || eventName === 'source_fetch_failed') {
        const statusCode = toInt(evt.status, 0);
        const fetchOutcome = classifyFetchOutcomeFromEvent(evt);
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        bucket.completed_count += 1;
        if (fetchOutcome && Object.prototype.hasOwnProperty.call(bucket.outcome_counts, fetchOutcome)) {
          bucket.outcome_counts[fetchOutcome] += 1;
        }
        if (urlStat) {
          urlStat.processed_count += 1;
          urlStat.last_outcome = fetchOutcome || urlStat.last_outcome;
          bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts, status: statusCode });
        }
        const startArr = startTimesByKey.get(fetchKey) || [];
        if (startArr.length > 0) {
          const startTs = startArr.shift();
          if (startArr.length > 0) {
            startTimesByKey.set(fetchKey, startArr);
          } else {
            startTimesByKey.delete(fetchKey);
          }
          const endTs = parseTsMs(evt.ts);
          if (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs >= startTs) {
            bucket.fetch_durations.push(endTs - startTs);
          }
        }
      }

      if (eventName === 'source_processed') {
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        const status = toInt(evt.status, 0);
        const fetchOutcome = classifyFetchOutcomeFromEvent(evt);
        if (normalizedUrl) {
          bucket.candidates_checked_urls.add(normalizedUrl);
          if (urlStat) {
            urlStat.checked_count += 1;
          }
        }
        if (fetchOutcome === 'ok') {
          if (normalizedUrl) bucket.fetched_ok_urls.add(normalizedUrl);
          if (urlStat) {
            urlStat.fetched_ok = true;
          }
          const ts = String(evt.ts || '').trim();
          if (ts && (!bucket.last_success_at || parseTsMs(ts) > parseTsMs(bucket.last_success_at))) {
            bucket.last_success_at = ts;
          }
        }
        if (fetchOutcome === 'not_found' || status === 404 || status === 410) {
          bucket.err_404 += 1;
          if (normalizedUrl) incrementMapCounter(bucket.err_404_by_url, normalizedUrl);
          if (urlStat) {
            urlStat.err_404_count += 1;
          }
        }
        if (
          fetchOutcome === 'blocked'
          || fetchOutcome === 'rate_limited'
          || fetchOutcome === 'login_wall'
          || fetchOutcome === 'bot_challenge'
        ) {
          bucket.blocked_count += 1;
          if (normalizedUrl) incrementMapCounter(bucket.blocked_by_url, normalizedUrl);
          if (urlStat) {
            urlStat.blocked_count += 1;
          }
        }
        if (fetchOutcome === 'bad_content') {
          bucket.parse_fail_count += 1;
          if (urlStat) {
            urlStat.parse_fail_count += 1;
          }
        }
        if (normalizedUrl) {
          const candidateCount = toInt(evt.candidate_count, 0);
          const llmCandidateCount = toInt(evt.llm_candidate_count, 0);
          if (candidateCount > 0 || llmCandidateCount > 0) {
            bucket.indexed_urls.add(normalizedUrl);
            if (urlStat) {
              urlStat.indexed = true;
            }
          }
        }
        if (urlStat) {
          bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts, status });
        }
        continue;
      }

      if (eventName === 'source_fetch_failed') {
        const urlStat = ensureUrlStat(bucket, normalizedUrl);
        const fetchOutcome = classifyFetchOutcomeFromEvent(evt);
        if (fetchOutcome === 'not_found') {
          bucket.err_404 += 1;
          if (normalizedUrl) incrementMapCounter(bucket.err_404_by_url, normalizedUrl);
          if (urlStat) {
            urlStat.err_404_count += 1;
          }
        }
        if (
          fetchOutcome === 'blocked'
          || fetchOutcome === 'rate_limited'
          || fetchOutcome === 'login_wall'
          || fetchOutcome === 'bot_challenge'
        ) {
          bucket.blocked_count += 1;
          if (normalizedUrl) incrementMapCounter(bucket.blocked_by_url, normalizedUrl);
          if (urlStat) {
            urlStat.blocked_count += 1;
          }
        }
        if (fetchOutcome === 'bad_content') {
          bucket.parse_fail_count += 1;
          if (urlStat) {
            urlStat.parse_fail_count += 1;
          }
        }
        if (urlStat) {
          bumpUrlStatEvent(urlStat, { eventName, ts: evt.ts });
        }
      }
    }

    const domainFieldYield = new Map();
    const incrementDomainFieldYield = (domain, field) => {
      const key = `${domain}|${field}`;
      domainFieldYield.set(key, (domainFieldYield.get(key) || 0) + 1);
    };

    if (resolvedProductId) {
      const latestBase = storage.resolveOutputKey(normalizedCategory, resolvedProductId, 'latest');
      const runBase = resolvedRunId
        ? storage.resolveOutputKey(normalizedCategory, resolvedProductId, 'runs', resolvedRunId)
        : null;
      const provenance =
        (runBase && await storage.readJsonOrNull(`${runBase}/provenance/fields.provenance.json`).catch(() => null))
        || await storage.readJsonOrNull(`${latestBase}/provenance.json`).catch(() => null);

      const fieldMap = provenance && typeof provenance === 'object'
        ? (provenance.fields && typeof provenance.fields === 'object' ? provenance.fields : provenance)
        : {};

      for (const [field, row] of Object.entries(fieldMap || {})) {
        if (!row || typeof row !== 'object') continue;
        const evidence = Array.isArray(row.evidence) ? row.evidence : [];
        if (evidence.length === 0) continue;
        const known = hasKnownValue(row.value);
        const passTarget = toInt(row.pass_target, 0);
        const meetsTarget = row.meets_pass_target === true;
        const used = known && (meetsTarget || passTarget > 0 || Number(row.confidence || 0) > 0);

        for (const ev of evidence) {
          const evidenceDomain = normalizeDomainToken(
            ev?.rootDomain || ev?.host || domainFromUrl(ev?.url || '')
          );
          if (!evidenceDomain) continue;
          if (isHelperPseudoDomain(evidenceDomain)) continue;
          const evidenceSiteKind = classifySiteKind({
            domain: evidenceDomain,
            role: ev?.role,
            tierName: ev?.tierName,
            brandTokens
          });
          const bucket = ensureBucket(evidenceDomain, evidenceSiteKind);
          if (!bucket) continue;
          bucket.evidence_hits += 1;
          if (used) {
            bucket.evidence_used += 1;
            bucket.fields_covered.add(field);
            incrementDomainFieldYield(evidenceDomain, field);
            if (passTarget > 0) {
              bucket.publish_gated_fields.add(field);
            }
          }
        }
      }
    } else {
      notes.push('select_product_for_evidence_contribution_metrics');
    }

    const nowMs = Date.now();
    const rows = [...buckets.values()].map((bucket) => {
      const durations = [...bucket.fetch_durations].filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
      const avgFetch = durations.length > 0
        ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length
        : 0;
      const cooldownSeconds = cooldownSecondsRemaining(bucket.next_retry_at, nowMs);
      const hostBudget = resolveHostBudget(bucket, cooldownSeconds);
      return {
        domain: bucket.domain,
        site_kind: bucket.site_kind,
        candidates_checked: bucket.candidates_checked_urls.size,
        urls_selected: bucket.urls_selected_urls.size,
        pages_fetched_ok: bucket.fetched_ok_urls.size,
        pages_indexed: bucket.indexed_urls.size,
        dedupe_hits: bucket.dedupe_hits,
        err_404: bucket.err_404,
        repeat_404_urls: countMapValuesAbove(bucket.err_404_by_url, 1),
        blocked_count: bucket.blocked_count,
        repeat_blocked_urls: countMapValuesAbove(bucket.blocked_by_url, 1),
        parse_fail_count: bucket.parse_fail_count,
        avg_fetch_ms: Number(avgFetch.toFixed(2)),
        p95_fetch_ms: Number(percentileFromSorted(durations, 0.95).toFixed(2)),
        evidence_hits: bucket.evidence_hits,
        evidence_used: bucket.evidence_used,
        fields_covered: bucket.fields_covered.size,
        status: resolveDomainChecklistStatus(bucket),
        host_budget_score: hostBudget.score,
        host_budget_state: hostBudget.state,
        cooldown_seconds_remaining: cooldownSeconds,
        outcome_counts: { ...bucket.outcome_counts },
        last_success_at: bucket.last_success_at || null,
        next_retry_at: bucket.next_retry_at || null,
        url_count: bucket.url_stats.size,
        urls: includeUrls
          ? [...bucket.url_stats.values()]
            .map((urlRow) => ({
              url: urlRow.url,
              checked_count: urlRow.checked_count,
              selected_count: urlRow.selected_count,
              fetch_started_count: urlRow.fetch_started_count,
              processed_count: urlRow.processed_count,
              fetched_ok: urlRow.fetched_ok,
              indexed: urlRow.indexed,
              err_404_count: urlRow.err_404_count,
              blocked_count: urlRow.blocked_count,
              parse_fail_count: urlRow.parse_fail_count,
              last_outcome: urlRow.last_outcome || null,
              last_status: urlRow.last_status || null,
              last_event: urlRow.last_event || null,
              last_ts: urlRow.last_ts || null
            }))
            .sort((a, b) => {
              const riskA = (a.err_404_count * 5) + (a.blocked_count * 5) + (a.parse_fail_count * 2);
              const riskB = (b.err_404_count * 5) + (b.blocked_count * 5) + (b.parse_fail_count * 2);
              if (riskB !== riskA) return riskB - riskA;
              const tsA = parseTsMs(a.last_ts || '');
              const tsB = parseTsMs(b.last_ts || '');
              if (Number.isFinite(tsA) && Number.isFinite(tsB) && tsB !== tsA) return tsB - tsA;
              return String(a.url || '').localeCompare(String(b.url || ''));
            })
          : []
      };
    }).sort((a, b) => {
      const kindRank = (SITE_KIND_RANK[a.site_kind] ?? 99) - (SITE_KIND_RANK[b.site_kind] ?? 99);
      if (kindRank !== 0) return kindRank;
      if (b.evidence_used !== a.evidence_used) return b.evidence_used - a.evidence_used;
      if (b.pages_fetched_ok !== a.pages_fetched_ok) return b.pages_fetched_ok - a.pages_fetched_ok;
      if (b.urls_selected !== a.urls_selected) return b.urls_selected - a.urls_selected;
      return a.domain.localeCompare(b.domain);
    });

    const bucketByDomain = new Map([...buckets.entries()]);
    const topDomains = [...rows]
      .sort((a, b) => {
        const scoreA = (a.pages_fetched_ok * 3) + (a.pages_indexed * 2) + a.urls_selected;
        const scoreB = (b.pages_fetched_ok * 3) + (b.pages_indexed * 2) + b.urls_selected;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.domain.localeCompare(b.domain);
      });

    const manufacturerRow = rows.find((row) => row.site_kind === 'manufacturer') || null;
    const primaryDomainList = [];
    if (manufacturerRow) primaryDomainList.push(manufacturerRow.domain);
    for (const row of topDomains) {
      if (primaryDomainList.includes(row.domain)) continue;
      primaryDomainList.push(row.domain);
      if (primaryDomainList.length >= 3) break;
    }

    const buildMilestonesForBucket = (bucket) => {
      if (!bucket) {
        return {
          product_page_found: false,
          support_page_found: false,
          manual_pdf_found: false,
          spec_table_extracted: false,
          firmware_driver_found: false,
          publish_gated_fields_supported: false
        };
      }
      const urls = [...bucket.seen_urls];
      const hasPathMatch = (pattern) => urls.some((url) => pattern.test(urlPathToken(url)));
      return {
        product_page_found: hasPathMatch(/\/(product|products|gaming-mice|mice|mouse)\b/),
        support_page_found: hasPathMatch(/(support|help|faq|kb|docs?|manual|download)/),
        manual_pdf_found: hasPathMatch(/(manual|datasheet|user[-_ ]guide|owner[-_ ]manual|\.pdf($|\?))/),
        spec_table_extracted: bucket.indexed_urls.size > 0 || bucket.fields_filled_count > 0,
        firmware_driver_found: hasPathMatch(/(firmware|driver|software|download)/),
        publish_gated_fields_supported: bucket.publish_gated_fields.size > 0
      };
    };

    const primaryDomainMilestones = primaryDomainList.map((domain) => {
      const bucket = bucketByDomain.get(domain);
      const milestones = buildMilestonesForBucket(bucket);
      return {
        domain,
        site_kind: bucket?.site_kind || inferSiteKindByDomain(domain),
        ...milestones
      };
    });

    const manufacturerDomain = manufacturerRow?.domain || null;
    const manufacturerMilestones = manufacturerDomain
      ? primaryDomainMilestones.find((row) => row.domain === manufacturerDomain) || null
      : null;

    const domainFieldYieldRows = [...domainFieldYield.entries()]
      .map(([key, count]) => {
        const [domain, field] = key.split('|');
        return {
          domain,
          field,
          evidence_used_count: count
        };
      })
      .sort((a, b) => b.evidence_used_count - a.evidence_used_count || a.domain.localeCompare(b.domain) || a.field.localeCompare(b.field))
      .slice(0, 120);
    repairQueryRows.sort((a, b) => parseTsMs(String(b.ts || '')) - parseTsMs(String(a.ts || '')));
    const badUrlPatternRows = [...badUrlPatterns.values()]
      .sort((a, b) => b.count - a.count || parseTsMs(b.last_ts) - parseTsMs(a.last_ts) || a.domain.localeCompare(b.domain))
      .slice(0, 120);

    if (!manufacturerDomain) {
      notes.push('no_manufacturer_domain_detected_for_scope');
    }
    if (rows.some((row) => String(row.status || '').startsWith('dead'))) {
      notes.push('dead_status_is_url_level_not_domain_outage');
    }

    return {
      category: normalizedCategory,
      productId: resolvedProductId || null,
      runId: resolvedRunId || null,
      window_minutes: Math.max(5, toInt(windowMinutes, 120)),
      generated_at: new Date().toISOString(),
      rows,
      milestones: {
        manufacturer_domain: manufacturerDomain,
        manufacturer: manufacturerMilestones,
        primary_domains: primaryDomainMilestones
      },
      domain_field_yield: domainFieldYieldRows,
      repair_queries: repairQueryRows,
      bad_url_patterns: badUrlPatternRows,
      notes
    };
  }

  return { buildIndexingDomainChecklist };
}
