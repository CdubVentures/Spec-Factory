import {
  toInt, parseTsMs, normalizeDomainToken, domainFromUrl, urlPathToken,
} from '../../../../shared/valueNormalizers.js';
import {
  clampAutomationPriority, automationPriorityForRequiredLevel, automationPriorityForJobType,
  toStringList, addUniqueStrings, buildAutomationJobId,
  normalizeAutomationStatus, normalizeAutomationQuery, buildSearchProfileQueryMaps,
} from './automationQueueHelpers.js';

export function createAutomationQueueBuilder({
  resolveContext,
  readEvents,
  readNeedSet,
  readSearchProfile,
}) {
  async function readIndexLabRunAutomationQueue(runId) {
    const context = await resolveContext(runId);
    if (!context) return null;

    const eventRows = await readEvents(context.token, 8000);
    const needset = await readNeedSet(context.token);
    const searchProfile = await readSearchProfile(context.token);
    const { queryToFields, fieldStats } = buildSearchProfileQueryMaps(searchProfile || {});

    const jobsById = new Map();
    const actions = [];
    const repairJobIdByQuery = new Map();
    const deficitJobIdByField = new Map();
    const contentHashSeen = new Map();

    const sortedEvents = [...eventRows]
      .filter((row) => row && typeof row === 'object')
      .sort((a, b) => {
        const aMs = parseTsMs(a.ts);
        const bMs = parseTsMs(b.ts);
        if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
          return aMs - bMs;
        }
        return String(a.event || '').localeCompare(String(b.event || ''));
      });

    const ensureJob = ({
      jobType = 'deficit_rediscovery',
      dedupeKey = '',
      sourceSignal = 'manual',
      scheduledAt = '',
      priority = null,
      category = context.category,
      productId = context.productId,
      runId: resolvedRunId = context.resolvedRunId,
      fieldTargets = [],
      reasonTags = [],
      domain = '',
      url = '',
      query = '',
      provider = '',
      docHint = '',
      status = 'queued'
    } = {}) => {
      const normalizedJobType = String(jobType || '').trim().toLowerCase() || 'deficit_rediscovery';
      const normalizedDedupe = String(dedupeKey || '').trim() || `${normalizedJobType}:${sourceSignal}`;
      const jobId = buildAutomationJobId(normalizedJobType, normalizedDedupe);
      const normalizedStatus = normalizeAutomationStatus(status);
      if (!jobsById.has(jobId)) {
        jobsById.set(jobId, {
          job_id: jobId,
          job_type: normalizedJobType,
          priority: clampAutomationPriority(
            priority === null || priority === undefined
              ? automationPriorityForJobType(normalizedJobType)
              : priority,
            automationPriorityForJobType(normalizedJobType)
          ),
          status: normalizedStatus,
          category: String(category || '').trim(),
          product_id: String(productId || '').trim(),
          run_id: String(resolvedRunId || '').trim(),
          field_targets: toStringList(fieldTargets, 20),
          url: String(url || '').trim() || null,
          domain: String(domain || '').trim() || null,
          query: String(query || '').trim() || null,
          provider: String(provider || '').trim() || null,
          doc_hint: String(docHint || '').trim() || null,
          dedupe_key: normalizedDedupe,
          source_signal: String(sourceSignal || '').trim() || 'manual',
          scheduled_at: String(scheduledAt || '').trim() || null,
          started_at: null,
          finished_at: null,
          next_run_at: null,
          attempt_count: 0,
          reason_tags: toStringList(reasonTags, 24),
          last_error: null,
          notes: []
        });
      }
      const job = jobsById.get(jobId);
      if (fieldTargets?.length) {
        job.field_targets = addUniqueStrings(job.field_targets, fieldTargets, 20);
      }
      if (reasonTags?.length) {
        job.reason_tags = addUniqueStrings(job.reason_tags, reasonTags, 24);
      }
      if (!job.url && url) job.url = String(url).trim();
      if (!job.domain && domain) job.domain = String(domain).trim();
      if (!job.query && query) job.query = String(query).trim();
      if (!job.provider && provider) job.provider = String(provider).trim();
      if (!job.doc_hint && docHint) job.doc_hint = String(docHint).trim();
      if (!job.scheduled_at && scheduledAt) job.scheduled_at = String(scheduledAt).trim();
      return job;
    };

    const pushAction = ({
      ts = '',
      event = '',
      job = null,
      status = '',
      detail = '',
      reasonTags = []
    } = {}) => {
      if (!job) return;
      actions.push({
        ts: String(ts || '').trim() || null,
        event: String(event || '').trim() || null,
        job_id: job.job_id,
        job_type: job.job_type,
        status: normalizeAutomationStatus(status || job.status),
        source_signal: job.source_signal,
        priority: clampAutomationPriority(job.priority, 50),
        detail: String(detail || '').trim() || null,
        domain: job.domain || null,
        url: job.url || null,
        query: job.query || null,
        field_targets: toStringList(job.field_targets, 20),
        reason_tags: addUniqueStrings(job.reason_tags || [], reasonTags, 24)
      });
    };

    const transitionJob = ({
      job = null,
      status = 'queued',
      ts = '',
      detail = '',
      nextRunAt = '',
      reasonTags = [],
      error = ''
    } = {}) => {
      if (!job) return;
      const normalizedStatus = normalizeAutomationStatus(status);
      job.status = normalizedStatus;
      const safeTs = String(ts || '').trim();
      if (normalizedStatus === 'queued') {
        if (safeTs) job.scheduled_at = safeTs;
        job.finished_at = null;
        job.last_error = null;
      }
      if (normalizedStatus === 'running') {
        if (safeTs) job.started_at = safeTs;
        job.finished_at = null;
        job.attempt_count = Math.max(0, toInt(job.attempt_count, 0)) + 1;
        job.last_error = null;
      }
      if (normalizedStatus === 'done') {
        if (safeTs && !job.started_at) {
          job.started_at = safeTs;
          job.attempt_count = Math.max(0, toInt(job.attempt_count, 0)) + 1;
        }
        if (safeTs) job.finished_at = safeTs;
        job.last_error = null;
      }
      if (normalizedStatus === 'failed') {
        if (safeTs && !job.started_at) {
          job.started_at = safeTs;
          job.attempt_count = Math.max(0, toInt(job.attempt_count, 0)) + 1;
        }
        if (safeTs) job.finished_at = safeTs;
        job.last_error = String(error || detail || 'job_failed').trim() || 'job_failed';
      }
      if (normalizedStatus === 'cooldown') {
        if (safeTs && !job.started_at) {
          job.started_at = safeTs;
        }
        if (safeTs) job.finished_at = safeTs;
      }
      const nextRun = String(nextRunAt || '').trim();
      if (nextRun) {
        job.next_run_at = nextRun;
      }
      if (reasonTags?.length) {
        job.reason_tags = addUniqueStrings(job.reason_tags, reasonTags, 24);
      }
      const detailToken = String(detail || '').trim();
      if (detailToken) {
        job.notes = addUniqueStrings(job.notes, [detailToken], 20);
      }
    };

    const setRepairJobByQuery = (query = '', job = null) => {
      const token = normalizeAutomationQuery(query);
      if (!token || !job) return;
      repairJobIdByQuery.set(token, job.job_id);
    };

    const getRepairJobByQuery = (query = '') => {
      const token = normalizeAutomationQuery(query);
      if (!token) return null;
      const jobId = repairJobIdByQuery.get(token);
      if (!jobId) return null;
      return jobsById.get(jobId) || null;
    };

    const setDeficitJobByField = (fieldKey = '', job = null) => {
      const token = String(fieldKey || '').trim();
      if (!token || !job) return;
      deficitJobIdByField.set(token, job.job_id);
    };

    const getDeficitJobsForQuery = (query = '') => {
      const token = normalizeAutomationQuery(query);
      if (!token) return [];
      const fields = queryToFields.get(token) || [];
      return fields
        .map((field) => jobsById.get(deficitJobIdByField.get(field)))
        .filter(Boolean);
    };

    for (const evt of sortedEvents) {
      const eventName = String(evt?.event || '').trim().toLowerCase();
      if (!eventName) continue;
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload
        : {};
      const ts = String(evt?.ts || payload.ts || '').trim();
      const query = String(payload.query || evt.query || '').trim();
      const url = String(payload.url || payload.source_url || evt.url || evt.source_url || '').trim();
      const domain = normalizeDomainToken(
        payload.domain || payload.host || evt.domain || evt.host || domainFromUrl(url)
      );
      const provider = String(payload.provider || evt.provider || '').trim();

      if (eventName === 'repair_query_enqueued') {
        const reason = String(payload.reason || evt.reason || '').trim();
        const docHint = String(payload.doc_hint || evt.doc_hint || '').trim();
        const fieldTargets = toStringList(payload.field_targets || evt.field_targets, 16);
        const dedupeKey = [
          'repair',
          domain,
          query.toLowerCase(),
          fieldTargets.join('|').toLowerCase(),
          reason.toLowerCase()
        ].join('::');
        const job = ensureJob({
          jobType: 'repair_search',
          dedupeKey,
          sourceSignal: 'url_health',
          scheduledAt: ts,
          priority: 20,
          fieldTargets,
          reasonTags: [reason || 'repair_signal', 'phase_04_signal'],
          domain,
          url,
          query,
          provider,
          docHint,
          status: 'queued'
        });
        transitionJob({
          job,
          status: 'queued',
          ts,
          detail: reason || 'repair_query_enqueued',
          reasonTags: [reason || 'repair_signal']
        });
        setRepairJobByQuery(query, job);
        pushAction({
          ts,
          event: eventName,
          job,
          status: 'queued',
          detail: reason || 'repair_query_enqueued',
          reasonTags: [reason || 'repair_signal']
        });
        continue;
      }

      if (eventName === 'repair_search_started') {
        const repairQuery = String(payload.query || evt.query || '').trim();
        const job = getRepairJobByQuery(repairQuery);
        if (job) {
          transitionJob({
            job,
            status: 'running',
            ts,
            detail: 'repair_search_started',
            reasonTags: ['worker_pickup']
          });
          pushAction({
            ts,
            event: eventName,
            job,
            status: 'running',
            detail: 'repair_search_started',
            reasonTags: ['worker_pickup']
          });
        }
        continue;
      }

      if (eventName === 'repair_search_completed') {
        const repairQuery = String(payload.query || evt.query || '').trim();
        const job = getRepairJobByQuery(repairQuery);
        if (job) {
          const urlsFound = toInt(payload.urls_found, 0);
          const urlsSeeded = toInt(payload.urls_seeded, 0);
          transitionJob({
            job,
            status: 'done',
            ts,
            detail: `completed: ${urlsFound} found, ${urlsSeeded} seeded`,
            reasonTags: ['repair_completed']
          });
          pushAction({
            ts,
            event: eventName,
            job,
            status: 'done',
            detail: `completed: ${urlsFound} found, ${urlsSeeded} seeded`,
            reasonTags: ['repair_completed']
          });
        }
        continue;
      }

      if (eventName === 'repair_search_failed') {
        const repairQuery = String(payload.query || evt.query || '').trim();
        const job = getRepairJobByQuery(repairQuery);
        if (job) {
          const errorMsg = String(payload.error || evt.error || 'repair_failed').trim();
          transitionJob({
            job,
            status: 'failed',
            ts,
            detail: errorMsg,
            error: errorMsg,
            reasonTags: ['repair_failed']
          });
          pushAction({
            ts,
            event: eventName,
            job,
            status: 'failed',
            detail: errorMsg,
            reasonTags: ['repair_failed']
          });
        }
        continue;
      }

      if (eventName === 'blocked_domain_cooldown_applied') {
        const reason = toInt(payload.status, toInt(evt.status, 0)) === 429
          ? 'status_429_backoff'
          : 'status_403_backoff';
        const dedupeKey = `domain_backoff::${domain}::${reason}`;
        const job = ensureJob({
          jobType: 'domain_backoff',
          dedupeKey,
          sourceSignal: 'url_health',
          scheduledAt: ts,
          priority: 65,
          reasonTags: [reason, 'blocked_domain_threshold'],
          domain,
          status: 'cooldown'
        });
        transitionJob({
          job,
          status: 'cooldown',
          ts,
          detail: `blocked domain threshold reached (${toInt(payload.blocked_count, 0)})`,
          reasonTags: [reason]
        });
        pushAction({
          ts,
          event: eventName,
          job,
          status: 'cooldown',
          detail: `blocked domain threshold reached (${toInt(payload.blocked_count, 0)})`,
          reasonTags: [reason]
        });
        continue;
      }

      if (eventName === 'url_cooldown_applied') {
        const reason = String(payload.reason || evt.reason || '').trim().toLowerCase() || 'cooldown';
        const nextRetryAt = String(payload.next_retry_ts || payload.next_retry_at || payload.cooldown_until || evt.next_retry_ts || '').trim();
        const isPathDead = reason === 'path_dead_pattern';
        const jobType = isPathDead ? 'repair_search' : 'domain_backoff';
        const dedupeKey = `${jobType}::${domain}::${reason}::${urlPathToken(url || '/')}`;
        const job = ensureJob({
          jobType,
          dedupeKey,
          sourceSignal: 'url_health',
          scheduledAt: ts,
          priority: isPathDead ? 22 : 68,
          reasonTags: [reason],
          domain,
          url,
          status: 'cooldown'
        });
        transitionJob({
          job,
          status: 'cooldown',
          ts,
          detail: reason,
          nextRunAt: nextRetryAt,
          reasonTags: [reason]
        });
        pushAction({
          ts,
          event: eventName,
          job,
          status: 'cooldown',
          detail: reason,
          reasonTags: [reason]
        });
        continue;
      }

      if (eventName === 'source_fetch_skipped') {
        const skipReason = String(payload.skip_reason || payload.reason || evt.skip_reason || evt.reason || '').trim().toLowerCase();
        if (skipReason === 'retry_later' || skipReason === 'blocked_budget' || skipReason === 'cooldown') {
          const nextRetryAt = String(payload.next_retry_ts || payload.next_retry_at || evt.next_retry_ts || '').trim();
          const dedupeKey = `domain_backoff::${domain}::${skipReason}::${urlPathToken(url || '/')}`;
          const job = ensureJob({
            jobType: 'domain_backoff',
            dedupeKey,
            sourceSignal: 'url_health',
            scheduledAt: ts,
            priority: 70,
            reasonTags: [skipReason],
            domain,
            url,
            status: 'cooldown'
          });
          transitionJob({
            job,
            status: 'cooldown',
            ts,
            detail: skipReason,
            nextRunAt: nextRetryAt,
            reasonTags: [skipReason]
          });
          pushAction({
            ts,
            event: eventName,
            job,
            status: 'cooldown',
            detail: skipReason,
            reasonTags: [skipReason]
          });
        }
        continue;
      }

      if (eventName === 'source_processed' || eventName === 'fetch_finished') {
        const statusCode = toInt(payload.status, toInt(evt.status, 0));
        const contentHash = String(payload.content_hash || payload.contentHash || evt.content_hash || '').trim();
        if (statusCode >= 200 && statusCode < 300 && contentHash) {
          const seen = contentHashSeen.get(contentHash);
          if (!seen) {
            contentHashSeen.set(contentHash, {
              ts,
              url,
              host: domain
            });
          } else {
            const dedupeKey = `staleness_refresh::${contentHash}`;
            const job = ensureJob({
              jobType: 'staleness_refresh',
              dedupeKey,
              sourceSignal: 'staleness',
              scheduledAt: ts,
              priority: 55,
              reasonTags: ['content_hash_duplicate'],
              domain,
              url,
              status: 'done'
            });
            transitionJob({
              job,
              status: 'done',
              ts,
              detail: `content hash repeated (first ${seen.ts || '-'})`,
              reasonTags: ['content_hash_duplicate']
            });
            pushAction({
              ts,
              event: 'staleness_hash_duplicate',
              job,
              status: 'done',
              detail: `content hash repeated (first ${seen.ts || '-'})`,
              reasonTags: ['content_hash_duplicate']
            });
          }
        }
        continue;
      }

      if (eventName === 'discovery_query_started' || eventName === 'search_started') {
        const repairJob = getRepairJobByQuery(query);
        if (repairJob) {
          transitionJob({
            job: repairJob,
            status: 'running',
            ts,
            detail: 'repair query execution started'
          });
          pushAction({
            ts,
            event: eventName,
            job: repairJob,
            status: 'running',
            detail: 'repair query execution started'
          });
        }
        for (const deficitJob of getDeficitJobsForQuery(query)) {
          transitionJob({
            job: deficitJob,
            status: 'running',
            ts,
            detail: 'deficit rediscovery query started'
          });
          pushAction({
            ts,
            event: eventName,
            job: deficitJob,
            status: 'running',
            detail: 'deficit rediscovery query started'
          });
        }
        continue;
      }

      if (eventName === 'discovery_query_completed' || eventName === 'search_finished') {
        const resultCount = Math.max(0, toInt(payload.result_count, toInt(evt.result_count, 0)));
        const repairJob = getRepairJobByQuery(query);
        if (repairJob) {
          const done = resultCount > 0;
          transitionJob({
            job: repairJob,
            status: done ? 'done' : 'failed',
            ts,
            detail: done ? `repair query completed with ${resultCount} results` : 'repair query returned no results',
            error: done ? '' : 'repair_no_results'
          });
          pushAction({
            ts,
            event: eventName,
            job: repairJob,
            status: done ? 'done' : 'failed',
            detail: done ? `repair query completed with ${resultCount} results` : 'repair query returned no results',
            reasonTags: [done ? 'results_found' : 'no_results']
          });
        }
        for (const deficitJob of getDeficitJobsForQuery(query)) {
          const done = resultCount > 0;
          transitionJob({
            job: deficitJob,
            status: done ? 'done' : 'failed',
            ts,
            detail: done ? `deficit query completed with ${resultCount} results` : 'deficit query returned no results',
            error: done ? '' : 'deficit_no_results'
          });
          pushAction({
            ts,
            event: eventName,
            job: deficitJob,
            status: done ? 'done' : 'failed',
            detail: done ? `deficit query completed with ${resultCount} results` : 'deficit query returned no results',
            reasonTags: [done ? 'results_found' : 'no_results']
          });
        }
        continue;
      }
    }

    const BUCKET_PRIORITY = { core: 0, secondary: 1, optional: 2 };
    const plannerRows = Array.isArray(needset?.rows) ? needset.rows : [];
    const deficitCandidates = plannerRows
      .filter((row) => row && String(row.field_key || '').trim())
      .filter((row) => row.state === 'missing' || row.state === 'weak' || row.state === 'conflict')
      .sort((a, b) => {
        const bucketDiff = (BUCKET_PRIORITY[a.priority_bucket] ?? 3) - (BUCKET_PRIORITY[b.priority_bucket] ?? 3);
        if (bucketDiff !== 0) return bucketDiff;
        return String(a.field_key || '').localeCompare(String(b.field_key || ''));
      })
      .slice(0, 16);

    for (const row of deficitCandidates) {
      const field = String(row.field_key || '').trim();
      const stats = fieldStats.get(field) || { attempts: 0, results: 0, queries: [] };
      const querySample = Array.isArray(stats.queries) ? stats.queries[0] : '';
      const dedupeKey = `deficit_rediscovery::${field}`;
      const reasonTags = [row.state || 'missing'];
      const job = ensureJob({
        jobType: 'deficit_rediscovery',
        dedupeKey,
        sourceSignal: 'needset_deficit',
        scheduledAt: String(needset?.generated_at || '').trim() || context.meta?.started_at || '',
        priority: automationPriorityForRequiredLevel(row.required_level),
        fieldTargets: [field],
        reasonTags,
        query: String(querySample || '').trim(),
        provider: String(searchProfile?.provider || '').trim(),
        status: 'queued'
      });
      setDeficitJobByField(field, job);
      if (toInt(stats.attempts, 0) > 0) {
        const hasResults = toInt(stats.results, 0) > 0;
        transitionJob({
          job,
          status: hasResults ? 'done' : 'failed',
          ts: String(needset?.generated_at || context.meta?.ended_at || context.meta?.started_at || '').trim(),
          detail: hasResults
            ? `searchprofile queries returned ${toInt(stats.results, 0)} results`
            : 'searchprofile queries executed with no results',
          error: hasResults ? '' : 'searchprofile_no_results'
        });
        pushAction({
          ts: String(needset?.generated_at || context.meta?.ended_at || context.meta?.started_at || '').trim(),
          event: 'needset_deficit_resolved_from_searchprofile',
          job,
          status: hasResults ? 'done' : 'failed',
          detail: hasResults
            ? `searchprofile queries returned ${toInt(stats.results, 0)} results`
            : 'searchprofile queries executed with no results',
          reasonTags: [hasResults ? 'results_found' : 'no_results']
        });
      } else {
        transitionJob({
          job,
          status: 'queued',
          ts: String(needset?.generated_at || context.meta?.started_at || '').trim(),
          detail: 'needset deficit queued for rediscovery',
          reasonTags
        });
        pushAction({
          ts: String(needset?.generated_at || context.meta?.started_at || '').trim(),
          event: 'needset_deficit_enqueued',
          job,
          status: 'queued',
          detail: 'needset deficit queued for rediscovery',
          reasonTags
        });
      }
    }

    const jobs = [...jobsById.values()];
    const statusCounts = {
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      cooldown: 0
    };
    const typeCounts = {
      repair_search: 0,
      staleness_refresh: 0,
      deficit_rediscovery: 0,
      domain_backoff: 0
    };
    for (const job of jobs) {
      const status = normalizeAutomationStatus(job.status);
      statusCounts[status] += 1;
      const jobType = String(job.job_type || '').trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(typeCounts, jobType)) {
        typeCounts[jobType] += 1;
      }
    }

    const statusOrder = {
      running: 0,
      queued: 1,
      cooldown: 2,
      failed: 3,
      done: 4
    };
    const sortedJobs = jobs
      .sort((a, b) => {
        const aRank = statusOrder[normalizeAutomationStatus(a.status)] ?? 99;
        const bRank = statusOrder[normalizeAutomationStatus(b.status)] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        if (a.priority !== b.priority) return a.priority - b.priority;
        const aTs = parseTsMs(a.scheduled_at || a.started_at || a.finished_at || '');
        const bTs = parseTsMs(b.scheduled_at || b.started_at || b.finished_at || '');
        if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;
        return String(a.job_id || '').localeCompare(String(b.job_id || ''));
      })
      .slice(0, 300);

    const sortedActions = actions
      .sort((a, b) => parseTsMs(String(b.ts || '')) - parseTsMs(String(a.ts || '')))
      .slice(0, 120);

    return {
      generated_at: new Date().toISOString(),
      run_id: context.resolvedRunId,
      category: context.category,
      product_id: context.productId,
      summary: {
        total_jobs: sortedJobs.length,
        queue_depth: statusCounts.queued + statusCounts.running + statusCounts.failed,
        active_jobs: statusCounts.queued + statusCounts.running,
        ...statusCounts,
        ...typeCounts
      },
      policies: {
        owner: 'phase_06b',
        loops: {
          repair_search: true,
          staleness_refresh: true,
          deficit_rediscovery: true
        }
      },
      jobs: sortedJobs,
      actions: sortedActions
    };
  }

  return { readIndexLabRunAutomationQueue };
}
