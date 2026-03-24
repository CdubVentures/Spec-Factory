// WHY: Thin priority queue for the fetch loop. Routes URLs into 4 queues
// (priority, manufacturer, approved, candidate) with per-domain capping only.
// Discovery, scoring, validation, yield policy, and comparator modules removed —
// enqueue routing is now score-passthrough from upstream triage metadata.

import { extractRootDomain } from '../utils/common.js';
import { configInt } from '../shared/settingsAccessor.js';
import {
  inferRoleForHost,
  isDeniedHost,
  resolveTierForHost,
  resolveTierNameForHost
} from '../categories/loader.js';
import { isLowValueHost } from '../pipeline/urlQualityGate.js';
import {
  normalizeHost,
  getHost,
  canonicalizeQueueUrl,
  hostInSet,
  tokenize,
  countQueueHost,
  lookupTriageMeta,
} from './sourcePlannerUrlUtils.js';

export class SourcePlanner {
  constructor(job, config, categoryConfig, options = {}) {
    this.job = job;
    this.config = config;
    this.categoryConfig = categoryConfig;

    // WHY: brandHostHints starts empty — populated dynamically via updateBrandHints()
    // after Brand Resolver phase provides LLM-resolved aliases and domains.
    this.brandHostHints = [];

    // WHY: Runtime overrides no longer mutate this cap, but legacy consumers still
    // read the exposed contract fields on the planner and stats payload.
    this.maxUrls = 50;
    this.maxPagesPerDomain = configInt(config, 'maxPagesPerDomain');

    // Queues — dequeue order: priority → manufacturer → approved → candidate
    this.priorityQueue = [];
    this.manufacturerQueue = [];
    this.queue = [];
    this.candidateQueue = [];

    this.visitedUrls = new Set();
    this.blockedHosts = new Set();

    // Host counts (per-queue family)
    this.hostCounts = new Map();
    this.manufacturerHostCounts = new Map();
    this.candidateHostCounts = new Map();

    // Visited counts
    this.manufacturerVisitedCount = 0;
    this.nonManufacturerVisitedCount = 0;
    this.candidateVisitedCount = 0;

    // Allowlist from category config sourceHosts
    this.allowlistHosts = new Set();
    for (const sourceHost of categoryConfig.sourceHosts || []) {
      this.allowlistHosts.add(normalizeHost(sourceHost.host));
    }
    const preferred = job.preferredSources || {};
    for (const arr of [
      preferred.manufacturerHosts || [],
      preferred.reviewHosts || [],
      preferred.retailerHosts || []
    ]) {
      for (const host of arr) {
        this.allowlistHosts.add(normalizeHost(host));
      }
    }

    // Manufacturer host selection
    this.brandManufacturerHostSet = this._selectManufacturerHostsForBrand();

    // Identity tokens for seedLearning relevance filtering
    this.brandTokens = [...new Set(tokenize(job.identityLock?.brand))];
    const genericModelTokens = new Set([
      'gaming', 'mouse', 'wireless', 'wired', 'edition',
      'black', 'white', 'mini', 'ultra', 'pro', 'plus', 'max'
    ]);
    this.modelTokens = [...new Set([
      ...tokenize(job.identityLock?.model),
      ...tokenize(job.identityLock?.variant),
      ...tokenize(job.productId)
    ])].filter((token) => !this.brandTokens.includes(token) && !genericModelTokens.has(token));

    // Rejection/acceptance counters
    this._rejectCounters = {
      empty_url: 0,
      invalid_url: 0,
      bad_protocol: 0,
      already_visited: 0,
      already_queued: 0,
      denied_host: 0,
      blocked_host: 0,
      low_value_host: 0,
      domain_cap: 0,
      candidate_domain_cap: 0,
    };
    this._acceptCount = 0;
    this._enqueueMetaCounters = {
      downgraded: 0,
      evictions: 0,
      duplicate_upgrades: 0,
      locale_replacements: 0,
      triage_routed: 0,
      triage_missing: 0,
    };

    // Bootstrap: seed initial URLs and manufacturer deep URLs
    this.seed(job.seedUrls || []);
    this.seedManufacturerDeepUrls();
  }

  // ── Manufacturer host selection ──

  _manufacturerHostsFromConfig() {
    const hosts = new Set();
    for (const sourceHost of this.categoryConfig.sourceHosts || []) {
      if (sourceHost.tierName === 'manufacturer') {
        hosts.add(normalizeHost(sourceHost.host));
      }
    }
    const preferred = this.job.preferredSources || {};
    for (const host of preferred.manufacturerHosts || []) {
      hosts.add(normalizeHost(host));
    }
    return hosts;
  }

  _selectManufacturerHostsForBrand() {
    const candidates = [...this._manufacturerHostsFromConfig()].filter(Boolean);
    if (!candidates.length) return new Set();
    if (!this.brandHostHints.length) return new Set(candidates);

    const strictMatches = candidates.filter((host) =>
      this.brandHostHints.some((hint) => hint && host.includes(hint))
    );
    if (strictMatches.length > 0) return new Set(strictMatches);

    // No strict matches and hints exist → no manufacturer hosts qualify
    return new Set();
  }

  updateBrandHints(brandResolution) {
    if (!brandResolution) return;
    const hints = new Set();
    for (const alias of brandResolution.aliases || []) {
      const token = String(alias || '').trim().toLowerCase();
      if (token) hints.add(token);
    }
    const official = normalizeHost(String(brandResolution.officialDomain || ''));
    if (official) {
      hints.add(official);
      const domainSlug = official.split('.')[0];
      if (domainSlug) hints.add(domainSlug);
    }
    const support = normalizeHost(String(brandResolution.supportDomain || ''));
    if (support) {
      hints.add(support);
      const supportSlug = support.split('.')[0];
      if (supportSlug) hints.add(supportSlug);
    }
    this.brandHostHints = [...hints];
    this.brandManufacturerHostSet = this._selectManufacturerHostsForBrand();
  }

  seedManufacturerDeepUrls() {
    const queryText = [
      this.job.identityLock?.brand || '',
      this.job.identityLock?.model || '',
      this.job.identityLock?.variant || ''
    ].join(' ').replace(/\s+/g, ' ').trim();

    if (!queryText) return;

    const manufacturerHosts = new Set(
      this.brandManufacturerHostSet.size
        ? [...this.brandManufacturerHostSet]
        : [...this._manufacturerHostsFromConfig()]
    );
    for (const seedUrl of this.job.seedUrls || []) {
      const host = getHost(seedUrl);
      if (host && resolveTierNameForHost(host, this.categoryConfig) === 'manufacturer') {
        if (!this.brandManufacturerHostSet.size || hostInSet(host, this.brandManufacturerHostSet)) {
          manufacturerHosts.add(host);
        }
      }
    }

    for (const host of manufacturerHosts) {
      if (!host) continue;
      this.enqueue(`https://${host}/robots.txt`, 'manufacturer_deep_seed', { forceApproved: true });
    }
  }

  // ── Seeding methods ──

  seed(urls, options = {}) {
    for (const url of urls) {
      const host = getHost(url);
      if (host) this.allowlistHosts.add(host);
      this.enqueue(url, 'seed', { forceApproved: true });
    }
  }

  seedLearning(urls) {
    for (const url of urls || []) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }

      const haystack = `${parsed.hostname || ''} ${parsed.pathname || ''} ${parsed.search || ''}`.toLowerCase();
      const modelHits = this.modelTokens.reduce(
        (acc, t) => acc + (haystack.includes(t.toLowerCase()) ? 1 : 0), 0
      );
      const brandHits = this.brandTokens.reduce(
        (acc, t) => acc + (haystack.includes(t.toLowerCase()) ? 1 : 0), 0
      );

      const modelThreshold = this.modelTokens.length >= 3 ? 2 : 1;
      const modelMatch = this.modelTokens.length > 0 && modelHits >= modelThreshold;
      const brandMatch = this.brandTokens.length > 0 && brandHits >= 1;

      if (this.modelTokens.length > 0) {
        if (!modelMatch || (this.brandTokens.length > 0 && !brandMatch)) continue;
      } else if (!brandMatch) {
        continue;
      }
      this.enqueue(url, 'learning_seed', { forceApproved: true });
    }
  }

  seedCandidates(urls, { triageMetaMap = null } = {}) {
    for (const url of urls || []) {
      const meta = triageMetaMap ? lookupTriageMeta(url, triageMetaMap) : null;
      this.enqueue(url, 'discovery', { forceCandidate: true, triageMeta: meta });
    }
  }

  // ── Core enqueue logic ──

  enqueue(url, discoveredFrom = 'unknown', options = {}) {
    const { forceApproved = false, forceCandidate = false, triageMeta = null } = options;

    // 1. Validate URL: not empty, parseable, has http/https protocol
    if (!url) {
      this._rejectCounters.empty_url += 1;
      return false;
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      this._rejectCounters.invalid_url += 1;
      return false;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      this._rejectCounters.bad_protocol += 1;
      return false;
    }

    // 2. Normalize
    const normalizedUrl = canonicalizeQueueUrl(parsed);
    const host = normalizeHost(parsed.hostname);

    // 3. Dedup: check visitedUrls Set
    if (this.visitedUrls.has(normalizedUrl)) {
      this._rejectCounters.already_visited += 1;
      return false;
    }

    // 3b. Dedup: check all queues
    if (this._isQueued(normalizedUrl)) {
      this._rejectCounters.already_queued += 1;
      return false;
    }

    // 4. Blocked host
    if (hostInSet(host, this.blockedHosts)) {
      this._rejectCounters.blocked_host += 1;
      return false;
    }

    // 5. Denied host
    if (!host || isDeniedHost(host, this.categoryConfig)) {
      this._rejectCounters.denied_host += 1;
      return false;
    }

    // 6. Low value host (skip for seeds/learning seeds)
    const seededBypass = forceApproved && (discoveredFrom === 'seed' || discoveredFrom === 'learning_seed');
    if (!seededBypass && isLowValueHost(parsed.hostname)) {
      this._rejectCounters.low_value_host += 1;
      return false;
    }

    // Resolve host metadata
    const rootDomain = extractRootDomain(host);
    const tier = resolveTierForHost(host, this.categoryConfig);
    const tierName = resolveTierNameForHost(host, this.categoryConfig);
    const role = inferRoleForHost(host, this.categoryConfig);

    // 7-8. Route to queue and enforce per-domain cap
    let targetQueue;
    let isCandidateTarget = false;

    if (forceApproved || discoveredFrom === 'seed' || discoveredFrom === 'learning_seed' ||
        String(discoveredFrom || '').includes('resume')) {
      targetQueue = 'priority';
    } else if (forceCandidate) {
      targetQueue = 'candidate';
      isCandidateTarget = true;
    } else if (host && hostInSet(host, this.brandManufacturerHostSet)) {
      targetQueue = 'manufacturer';
    } else if (host && (this.allowlistHosts.has(host) || discoveredFrom === 'discovery_approved')) {
      targetQueue = 'general';
    } else {
      targetQueue = 'candidate';
      isCandidateTarget = true;
    }

    // Per-domain cap (the ONLY cap)
    if (isCandidateTarget) {
      const domainCount = this.candidateHostCounts.get(host) || 0;
      if (domainCount >= this.maxPagesPerDomain) {
        this._rejectCounters.candidate_domain_cap += 1;
        return false;
      }
    } else {
      const relevantQueue = targetQueue === 'manufacturer' ? this.manufacturerQueue : this.queue;
      const relevantHostCounts = targetQueue === 'manufacturer' ? this.manufacturerHostCounts : this.hostCounts;
      // For priority queue items, check against the general hostCounts
      const hostCountMap = targetQueue === 'priority' ? this.hostCounts : relevantHostCounts;
      const relevantQ = targetQueue === 'priority' ? this.priorityQueue : relevantQueue;
      const plannedCount = countQueueHost(relevantQ, host) + (hostCountMap.get(host) || 0);
      if (plannedCount >= this.maxPagesPerDomain) {
        this._rejectCounters.domain_cap += 1;
        return false;
      }
    }

    // 9. Build row object
    const score = triageMeta?.triage_score || 0;
    const candidateSource = isCandidateTarget;
    const row = {
      url: normalizedUrl,
      normalizedUrl,
      host,
      rootDomain,
      discoveredFrom,
      candidateSource,
      triageMeta: triageMeta || null,
      tier: candidateSource ? 4 : tier,
      tierName: candidateSource ? 'candidate' : tierName,
      role: candidateSource ? 'other' : role,
      score,
      // Backward-compatible fields
      priorityScore: score,
      approvedDomain: !candidateSource,
      enqueue_decision: 'accepted',
      enqueue_reason_codes: [targetQueue],
      queue_selected: targetQueue,
      host_yield_state: 'normal',
      triage_passthrough: triageMeta || null,
    };

    // Queue placement
    if (targetQueue === 'priority') {
      this.priorityQueue.push(row);
      this.priorityQueue.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (targetQueue === 'manufacturer') {
      this.manufacturerQueue.push(row);
      this.manufacturerQueue.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (targetQueue === 'candidate') {
      this.candidateQueue.push(row);
      this.candidateQueue.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else {
      this.queue.push(row);
      this.queue.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    this._acceptCount += 1;

    if (triageMeta) {
      this._enqueueMetaCounters.triage_routed += 1;
    } else {
      this._enqueueMetaCounters.triage_missing += 1;
    }

    // 10. Return true
    return true;
  }

  _isQueued(normalizedUrl) {
    for (const q of [this.priorityQueue, this.manufacturerQueue, this.queue, this.candidateQueue]) {
      if (q.some((item) => item.url === normalizedUrl)) return true;
    }
    return false;
  }

  // ── Queue ops ──

  hasNext() {
    return (
      this.priorityQueue.length > 0 ||
      this.manufacturerQueue.length > 0 ||
      this.queue.length > 0 ||
      this.candidateQueue.length > 0
    );
  }

  next() {
    const source =
      this.priorityQueue.length > 0
        ? this.priorityQueue.shift()
        : this.manufacturerQueue.length > 0
          ? this.manufacturerQueue.shift()
          : this.queue.length > 0
            ? this.queue.shift()
            : this.candidateQueue.shift();
    if (!source) return null;

    this.visitedUrls.add(source.url);
    if (source.candidateSource) {
      this.candidateVisitedCount += 1;
      this.candidateHostCounts.set(
        source.host,
        (this.candidateHostCounts.get(source.host) || 0) + 1
      );
    } else if (source.role === 'manufacturer') {
      this.manufacturerVisitedCount += 1;
      this.manufacturerHostCounts.set(
        source.host,
        (this.manufacturerHostCounts.get(source.host) || 0) + 1
      );
    } else {
      this.nonManufacturerVisitedCount += 1;
      this.hostCounts.set(source.host, (this.hostCounts.get(source.host) || 0) + 1);
    }
    return source;
  }

  // ── Control ──

  blockHost(host, reason = 'blocked') {
    const normalized = normalizeHost(host);
    if (!normalized) return 0;

    this.blockedHosts.add(normalized);

    let removed = 0;
    const filterFn = (row) => {
      const shouldKeep = !hostInSet(row.host, this.blockedHosts);
      if (!shouldKeep) removed += 1;
      return shouldKeep;
    };

    this.priorityQueue = this.priorityQueue.filter(filterFn);
    this.manufacturerQueue = this.manufacturerQueue.filter(filterFn);
    this.queue = this.queue.filter(filterFn);
    this.candidateQueue = this.candidateQueue.filter(filterFn);
    return removed;
  }

  // ── State (read-only) ──

  get enqueueCounters() {
    return {
      accepted: this._acceptCount,
      rejected: { ...this._rejectCounters },
      total_rejected: Object.values(this._rejectCounters).reduce((sum, v) => sum + v, 0),
      downgraded: this._enqueueMetaCounters.downgraded,
      evictions: this._enqueueMetaCounters.evictions,
      duplicate_upgrades: this._enqueueMetaCounters.duplicate_upgrades,
      locale_replacements: this._enqueueMetaCounters.locale_replacements,
      triage_routed: this._enqueueMetaCounters.triage_routed,
      triage_missing: this._enqueueMetaCounters.triage_missing,
    };
  }

  getStats() {
    return {
      priority_queue_count: this.priorityQueue.length,
      manufacturer_queue_count: this.manufacturerQueue.length,
      non_manufacturer_queue_count: this.queue.length,
      candidate_queue_count: this.candidateQueue.length,
      manufacturer_visited_count: this.manufacturerVisitedCount,
      non_manufacturer_visited_count: this.nonManufacturerVisitedCount,
      candidate_visited_count: this.candidateVisitedCount,
      blocked_host_count: this.blockedHosts.size,
      blocked_hosts: [...this.blockedHosts].slice(0, 50),
      brand_manufacturer_hosts: [...this.brandManufacturerHostSet].slice(0, 20),
      max_urls: this.maxUrls,
    };
  }
}

// WHY: Secondary export used by pipeline consumers.
export function buildSourceSummary(sources) {
  return {
    urls: sources.map((source) => source.url),
    used: sources.map((source) => ({
      url: source.url,
      host: source.host,
      source_id: source.sourceId || '',
      tier: source.tier,
      tier_name: source.tierName,
      role: source.role,
      approved_domain: Boolean(source.approvedDomain),
      candidate_source: Boolean(source.candidateSource),
      anchor_check_status: source.anchorStatus,
      identity: source.identity
    }))
  };
}
