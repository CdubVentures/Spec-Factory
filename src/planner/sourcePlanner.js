import { extractRootDomain } from '../utils/common.js';
import { toRawFieldKey } from '../utils/fieldKeys.js';
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
  isObject,
  getHost,
  canonicalizeQueueUrl,
  hostInSet,
  tokenize,
  slug,
  slugIdentityTokens,
  countTokenHits,
  countQueueHost,
  urlPath
} from './sourcePlannerUrlUtils.js';
import { revalidateUrl } from './sourcePlannerRevalidation.js';
import { resolveHostYieldState } from './sourcePlannerYieldPolicy.js';
import { compareDiscoveryPriority } from './sourcePlannerComparator.js';
// WHY: buildAllowedCategoryProductSlugs inlined — no brand map dependency.
function buildAllowedCategoryProductSlugs({ brand = '', modelSlug = '' }) {
  if (!modelSlug) return [];
  const variants = [modelSlug];
  const brandSlug = slug(brand);
  if (brandSlug && !modelSlug.startsWith(`${brandSlug}-`)) {
    variants.push(`${brandSlug}-${modelSlug}`);
  }
  return [...new Set(variants)];
}
import {
  computeSourcePriority,
  computePathHeuristicBoost,
  computeDomainPriority,
  resolveIntelBundle,
  scoreRequiredFieldBoost as _scoreRequiredFieldBoost,
  readRewardScoreFromMethodMap as _readRewardScoreFromMethodMap,
  scoreFieldRewardBoost as _scoreFieldRewardBoost
} from './sourcePlannerScoring.js';
import {
  checkShouldUseApprovedQueue,
  checkIsResumeSeed,
  checkMatchesAllowedLockedProductSlug,
  checkShouldRejectLockedManufacturerUrl,
  checkShouldRejectLockedManufacturerLocaleDuplicateUrl,
  checkHasQueuedOrVisitedComparableUrl,
  checkIsRelevantDiscoveredUrl
} from './sourcePlannerValidation.js';
import { createSourceDiscovery } from './sourcePlannerDiscovery.js';

export class SourcePlanner {
  constructor(job, config, categoryConfig, options = {}) {
    this.job = job;
    this.config = config;
    this.categoryConfig = categoryConfig;
    this.preferred = job.preferredSources || {};
    // WHY: fetchCandidateSources retired — always true (trust the process).
    this.fetchCandidateSources = true;

    const requiredFieldsRaw = options.requiredFields || [];
    this.requiredFields = requiredFieldsRaw
      .map((field) => toRawFieldKey(field, { fieldOrder: categoryConfig.fieldOrder || [] }))
      .filter(Boolean);
    this.sourceIntelDomains = options.sourceIntel?.domains || {};
    this.brandKey = slug(job.identityLock?.brand || '');
    // WHY: brandHostHints starts empty — populated dynamically via updateBrandHints()
    // after Brand Resolver phase provides LLM-resolved aliases and domains.
    this.brandHostHints = [];

    this.maxUrls = configInt(config, 'maxUrlsPerProduct');
    this.maxCandidateUrls = configInt(config, 'maxCandidateUrls');
    this.maxPagesPerDomain = configInt(config, 'maxPagesPerDomain');

    this.manufacturerQueue = [];
    this.priorityQueue = [];
    this.queue = [];
    this.candidateQueue = [];

    this.visitedUrls = new Set();
    this.blockedHosts = new Set();
    this.blockedHostReasons = {};
    this.approvedVisitedCount = 0;
    this.manufacturerVisitedCount = 0;
    this.nonManufacturerVisitedCount = 0;
    this.candidateVisitedCount = 0;
    this.filledFields = new Set();
    this.hostCounts = new Map();
    this.manufacturerHostCounts = new Map();
    this.candidateHostCounts = new Map();

    this.allowlistHosts = new Set();
    this.sourceHostMap =
      categoryConfig.sourceHostMap instanceof Map
        ? categoryConfig.sourceHostMap
        : new Map((categoryConfig.sourceHosts || []).map((row) => [normalizeHost(row.host), row]));
    for (const sourceHost of categoryConfig.sourceHosts || []) {
      this.allowlistHosts.add(normalizeHost(sourceHost.host));
    }
    for (const arr of [
      this.preferred.manufacturerHosts || [],
      this.preferred.reviewHosts || [],
      this.preferred.retailerHosts || []
    ]) {
      for (const host of arr) {
        this.allowlistHosts.add(normalizeHost(host));
      }
    }

    this.brandManufacturerHostSet = this.selectManufacturerHostsForBrand();

    this.brandTokens = [...new Set(tokenize(job.identityLock?.brand))];
    const genericModelTokens = new Set([
      'gaming',
      'mouse',
      'wireless',
      'wired',
      'edition',
      'black',
      'white',
      'mini',
      'ultra',
      'pro',
      'plus',
      'max'
    ]);
    this.modelTokens = [...new Set([
      ...tokenize(job.identityLock?.model),
      ...tokenize(job.identityLock?.variant),
      ...tokenize(job.productId)
    ])].filter((token) => !this.brandTokens.includes(token) && !genericModelTokens.has(token));
    this.modelSlug = slug(job.identityLock?.model || job.productId || '');
    this.modelSlugIdentityTokens = [...new Set([
      ...slugIdentityTokens(job.identityLock?.model || ''),
      ...slugIdentityTokens(job.identityLock?.variant || '')
    ])];
    this.allowedCategoryProductSlugs = new Set(
      buildAllowedCategoryProductSlugs({
        brand: job.identityLock?.brand || '',
        modelSlug: this.modelSlug
      })
    );

    this._rejectCounters = {
      empty_url: 0,
      invalid_url: 0,
      bad_protocol: 0,
      already_visited: 0,
      already_queued: 0,
      denied_host: 0,
      blocked_host: 0,
      low_value_host: 0,
      url_quality_gate: 0,
      manufacturer_brand_restricted: 0,
      manufacturer_locale_duplicate: 0,
      manufacturer_locked_reject: 0,
      max_urls_reached: 0,
      domain_cap: 0,
      candidate_sources_disabled: 0,
      max_candidate_urls: 0,
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
    this._discoveryCounters = {
      robotsSitemapsDiscovered: 0,
      sitemapUrlsDiscovered: 0
    };
    this._discovery = createSourceDiscovery({
      categoryConfig: this.categoryConfig,
      allowlistHosts: this.allowlistHosts,
      allowedCategoryProductSlugs: this.allowedCategoryProductSlugs,
      enqueue: (url, from, opts) => this.enqueue(url, from, opts),
      isRelevantDiscoveredUrl: (parsed, ctx) =>
        checkIsRelevantDiscoveredUrl(parsed, ctx, this._validationCtx()),
      hasQueuedOrVisitedComparableUrl: (parsed, opts) =>
        checkHasQueuedOrVisitedComparableUrl(parsed, opts, this._queueState()),
      counters: this._discoveryCounters
    });

    this.seed(job.seedUrls || []);
    this.seedManufacturerDeepUrls();
  }

  manufacturerHostsFromConfig() {
    const hosts = new Set();
    for (const sourceHost of this.categoryConfig.sourceHosts || []) {
      if (sourceHost.tierName === 'manufacturer') {
        hosts.add(normalizeHost(sourceHost.host));
      }
    }
    for (const host of this.preferred.manufacturerHosts || []) {
      hosts.add(normalizeHost(host));
    }
    return hosts;
  }

  manufacturerHostScore(host) {
    const normalizedHost = normalizeHost(host);
    if (!normalizedHost) {
      return 0;
    }

    let score = 0;
    for (const hint of this.brandHostHints || []) {
      if (!hint) {
        continue;
      }
      if (normalizedHost.includes(hint)) {
        score += 1.2;
      }
    }

    const rootDomain = extractRootDomain(normalizedHost);
    const domainIntel = this.sourceIntelDomains[rootDomain];
    const brandIntel =
      this.brandKey && domainIntel?.per_brand?.[this.brandKey]
        ? domainIntel.per_brand[this.brandKey]
        : null;
    if (brandIntel) {
      score += Math.max(0, Number.parseFloat(String(brandIntel.identity_match_rate || 0)) * 1.5);
      score += Math.max(0, Number.parseFloat(String(brandIntel.fields_accepted_count || 0)) / 30);
    }
    return score;
  }

  selectManufacturerHostsForBrand() {
    const candidates = [...this.manufacturerHostsFromConfig()].filter(Boolean);
    if (!candidates.length) {
      return new Set();
    }
    if (!this.brandHostHints.length) {
      return new Set(candidates);
    }

    const strictMatches = candidates.filter((host) =>
      this.brandHostHints.some((hint) => hint && host.includes(hint))
    );
    if (strictMatches.length > 0) {
      return new Set(strictMatches);
    }

    const scored = candidates
      .map((host) => ({ host, score: this.manufacturerHostScore(host) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));

    if (!scored.length) {
      return new Set();
    }

    const topScore = scored[0].score;
    const selected = scored
      .filter((row) => row.score >= Math.max(0.1, topScore * 0.45))
      .slice(0, 5)
      .map((row) => row.host);
    return new Set(selected);
  }

  seedManufacturerDeepUrls() {
    const queryText = [
      this.job.identityLock?.brand || '',
      this.job.identityLock?.model || '',
      this.job.identityLock?.variant || ''
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!queryText) {
      return;
    }

    const manufacturerHosts = new Set(
      this.brandManufacturerHostSet.size
        ? [...this.brandManufacturerHostSet]
        : [...this.manufacturerHostsFromConfig()]
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
      if (!host) {
        continue;
      }

      const seeds = [
        `https://${host}/robots.txt`,
      ];

      for (const url of seeds) {
        this.enqueue(url, 'manufacturer_deep_seed', { forceApproved: true });
      }
    }
  }

  // WHY: Called after Brand Resolver phase provides LLM-resolved brand data.
  // Replaces the old hardcoded BRAND_HOST_HINTS with dynamic resolution.
  updateBrandHints(brandResolution) {
    if (!brandResolution) return;
    const hints = new Set();
    for (const alias of (brandResolution.aliases || [])) {
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
    this.brandManufacturerHostSet = this.selectManufacturerHostsForBrand();
  }

  seed(urls, options = {}) {
    const { forceBrandBypass = false } = options;
    for (const url of urls) {
      const host = getHost(url);
      if (host) {
        this.allowlistHosts.add(host);
      }
      this.enqueue(url, 'seed', { forceApproved: true, forceBrandBypass });
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
      const modelHits = countTokenHits(haystack, this.modelTokens);
      const brandHits = countTokenHits(haystack, this.brandTokens);

      const modelThreshold = this.modelTokens.length >= 3 ? 2 : 1;
      const modelMatch = this.modelTokens.length > 0 && modelHits >= modelThreshold;
      const brandMatch = this.brandTokens.length > 0 && brandHits >= 1;

      if (this.modelTokens.length > 0) {
        // When model tokens exist, avoid broad cross-brand URLs.
        if (!modelMatch || (this.brandTokens.length > 0 && !brandMatch)) {
          continue;
        }
      } else if (!brandMatch) {
        continue;
      }
      this.enqueue(url, 'learning_seed', { forceApproved: true, forceBrandBypass: false });
    }
  }

  seedCandidates(urls, { triageMetaMap = null } = {}) {
    if (!this.fetchCandidateSources) {
      return;
    }
    for (const url of urls || []) {
      const meta = triageMetaMap ? this._lookupTriageMeta(url, triageMetaMap) : null;
      this.enqueue(url, 'discovery', { forceCandidate: true, triageMeta: meta });
    }
  }

  _lookupTriageMeta(url, triageMetaMap) {
    if (!triageMetaMap || triageMetaMap.size === 0) return null;
    // Canonical lookup first
    try {
      const parsed = new URL(url);
      const canonical = canonicalizeQueueUrl(parsed);
      if (triageMetaMap.has(canonical)) return triageMetaMap.get(canonical);
      // Normalized URL fallback
      const normalized = parsed.toString();
      if (triageMetaMap.has(normalized)) return triageMetaMap.get(normalized);
    } catch {
      // Fall through to raw lookup
    }
    // Raw URL fallback
    if (triageMetaMap.has(url)) return triageMetaMap.get(url);
    return null;
  }

  enqueueCandidate(url, discoveredFrom = 'candidate') {
    this.enqueue(url, discoveredFrom, { forceCandidate: true });
  }

  _validationCtx() {
    return {
      categoryConfig: this.categoryConfig,
      allowlistHosts: this.allowlistHosts,
      allowedCategoryProductSlugs: this.allowedCategoryProductSlugs,
      modelSlugIdentityTokens: this.modelSlugIdentityTokens,
      modelTokens: this.modelTokens,
      brandTokens: this.brandTokens,
      brandKey: this.brandKey,
      sourceHostMap: this.sourceHostMap,
      modelSlug: this.modelSlug
    };
  }

  _queueState() {
    return {
      visitedUrls: this.visitedUrls,
      priorityQueue: this.priorityQueue,
      manufacturerQueue: this.manufacturerQueue,
      queue: this.queue,
      candidateQueue: this.candidateQueue
    };
  }

  _revalidationCtx() {
    return {
      categoryConfig: this.categoryConfig,
      blockedHosts: this.blockedHosts,
    };
  }

  _findQueuedRow(normalizedUrl) {
    for (const q of [this.priorityQueue, this.manufacturerQueue, this.queue, this.candidateQueue]) {
      const found = q.find((item) => item.url === normalizedUrl);
      if (found) return { row: found, queue: q };
    }
    return null;
  }

  _findWeakestSameDomainRow(host, excludeUrl) {
    let weakest = null;
    let weakestQueue = null;
    // WHY: Eviction priority order — prefer removing from candidateQueue first,
    // then general queue low-priority rows. Never evict stronger approved/high-priority.
    const searchOrder = [
      { queue: this.candidateQueue, name: 'candidate' },
      { queue: this.queue, name: 'general' },
    ];
    for (const { queue, name } of searchOrder) {
      for (const row of queue) {
        if (row.host !== host || row.url === excludeUrl) continue;
        if (!weakest || compareDiscoveryPriority(row, weakest) > 0) {
          weakest = row;
          weakestQueue = { queue, name };
        }
      }
    }
    return weakest ? { row: weakest, ...weakestQueue } : null;
  }

  _evictRow(row, queue) {
    const idx = queue.indexOf(row);
    if (idx >= 0) queue.splice(idx, 1);
  }

  _resolveQueueRoute({ host, role, triageMeta, forceApproved, forceCandidate, discoveredFrom, yieldState }) {
    const reason_codes = [];
    const tm = triageMeta || null;
    const approvalBucket = tm?.approval_bucket || (forceApproved ? 'approved' : 'candidate');
    const selectionPriority = tm?.selection_priority || 'low';
    const primaryLane = tm?.primary_lane || 6;

    // 1. Seeds/learning seeds → priorityQueue
    if (discoveredFrom === 'seed' || discoveredFrom === 'learning_seed') {
      reason_codes.push('seed_frontload');
      return { queue: 'priority', reason_codes };
    }

    // If no triageMeta, fall back to existing shouldUseApprovedQueue logic
    if (!tm) {
      this._enqueueMetaCounters.triage_missing += 1;
      if (forceCandidate) {
        reason_codes.push('force_candidate');
        return { queue: 'candidate', reason_codes };
      }
      const approved = this.shouldUseApprovedQueue(host, forceApproved, forceCandidate);
      if (approved) {
        if (role === 'manufacturer') {
          reason_codes.push('fallback_manufacturer');
          return { queue: 'manufacturer', reason_codes };
        }
        reason_codes.push('fallback_approved');
        return { queue: 'general', reason_codes };
      }
      reason_codes.push('fallback_candidate');
      return { queue: 'candidate', reason_codes };
    }

    this._enqueueMetaCounters.triage_routed += 1;

    // 2. approved + high → priorityQueue
    if (approvalBucket === 'approved' && selectionPriority === 'high') {
      reason_codes.push('approved_high');
      return { queue: 'priority', reason_codes };
    }

    // 3. lane 2 (manual/specsheet) → priorityQueue with conditions
    if (primaryLane === 2) {
      const qualifies =
        selectionPriority === 'high' ||
        selectionPriority === 'medium' ||
        approvalBucket === 'approved' ||
        yieldState === 'promoted';
      if (qualifies) {
        reason_codes.push('lane2_qualified');
        return { queue: 'priority', reason_codes };
      }
      reason_codes.push('lane2_unqualified');
      return { queue: approvalBucket === 'approved' ? 'general' : 'candidate', reason_codes };
    }

    // 4. lane 1 (official/support) → manufacturerQueue or priorityQueue
    if (primaryLane === 1) {
      if (role === 'manufacturer') {
        reason_codes.push('lane1_manufacturer');
        return { queue: 'manufacturer', reason_codes };
      }
      reason_codes.push('lane1_official_non_manufacturer');
      return { queue: 'priority', reason_codes };
    }

    // 5. lanes 3-4 (trusted review/specdb) → general queue
    if (primaryLane === 3 || primaryLane === 4) {
      reason_codes.push(`lane${primaryLane}_trusted`);
      return { queue: 'general', reason_codes };
    }

    // 6. Retailer / long_tail / community → queue or candidateQueue based on bucket
    if (approvalBucket === 'approved') {
      reason_codes.push('approved_lower_lane');
      return { queue: 'general', reason_codes };
    }
    reason_codes.push('candidate_lower_lane');
    return { queue: 'candidate', reason_codes };
  }

  shouldUseApprovedQueue(host, forceApproved = false, forceCandidate = false) {
    return checkShouldUseApprovedQueue(host, forceApproved, forceCandidate, this._validationCtx());
  }

  isResumeSeed(discoveredFrom = '') {
    return checkIsResumeSeed(discoveredFrom);
  }

  matchesAllowedLockedProductSlug(productSlug = '') {
    return checkMatchesAllowedLockedProductSlug(productSlug, this._validationCtx());
  }

  shouldRejectLockedManufacturerUrl(parsed) {
    return checkShouldRejectLockedManufacturerUrl(parsed, this._validationCtx());
  }

  shouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, { allowResume = false } = {}) {
    return checkShouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, { allowResume }, this._validationCtx());
  }

  enqueue(url, discoveredFrom = 'unknown', options = {}) {
    const { forceApproved = false, forceCandidate = false, forceBrandBypass = false, triageMeta = null } = options;

    // ── Stage A: Revalidation (transport + safety) ──
    const reval = revalidateUrl({ url, revalidationCtx: this._revalidationCtx() });
    if (reval.rejected) {
      this._rejectCounters[reval.reason] = (this._rejectCounters[reval.reason] || 0) + 1;
      return false;
    }
    const { parsed, normalizedUrl, host } = reval;

    // ── Stage B: Dedup with upgrade/merge ──
    if (this.visitedUrls.has(normalizedUrl)) {
      this._rejectCounters.already_visited += 1;
      return false;
    }

    const existing = this._findQueuedRow(normalizedUrl);
    if (existing) {
      // WHY: Upgrade if incoming has better triage metadata than existing.
      if (triageMeta && existing.row.triage_passthrough) {
        const incomingPrio = {
          approval_bucket: triageMeta.approval_bucket || 'candidate',
          selection_priority: triageMeta.selection_priority || 'low',
          primary_lane: triageMeta.primary_lane || 6,
          triage_score: triageMeta.triage_score || 0,
          host_yield_state: 'normal',
          discovered_from: discoveredFrom,
          canonical_url: normalizedUrl,
        };
        const existingPrio = {
          approval_bucket: existing.row.triage_passthrough?.approval_bucket || 'candidate',
          selection_priority: existing.row.triage_passthrough?.selection_priority || 'low',
          primary_lane: existing.row.triage_passthrough?.primary_lane || 6,
          triage_score: existing.row.triage_passthrough?.triage_score || 0,
          host_yield_state: existing.row.host_yield_state || 'normal',
          discovered_from: existing.row.discoveredFrom || 'unknown',
          canonical_url: existing.row.url,
        };
        if (compareDiscoveryPriority(incomingPrio, existingPrio) < 0) {
          existing.row.triage_passthrough = triageMeta;
          existing.row.enqueue_decision = 'upgraded';
          existing.row.enqueue_reason_codes = [...(existing.row.enqueue_reason_codes || []), 'duplicate_upgraded'];
          this._enqueueMetaCounters.duplicate_upgrades += 1;
          return true;
        }
      }
      this._rejectCounters.already_queued += 1;
      return false;
    }

    // ── Resolve host metadata ──
    const rootDomain = extractRootDomain(host);
    const hostMeta = this.sourceHostMap.get(host) || null;
    const tier = Number.isFinite(Number(hostMeta?.tier))
      ? Number(hostMeta.tier)
      : resolveTierForHost(host, this.categoryConfig);
    const tierName = String(hostMeta?.tierName || resolveTierNameForHost(host, this.categoryConfig));
    const role = String(hostMeta?.role || inferRoleForHost(host, this.categoryConfig));

    // ── Manufacturer checks (narrowed) ──
    const manufacturerBrandRestricted =
      role === 'manufacturer' &&
      this.brandManufacturerHostSet.size > 0 &&
      !hostInSet(host, this.brandManufacturerHostSet);
    // WHY: manufacturer_brand_restricted becomes routing demotion, not hard reject.
    // Only forceBrandBypass skips the demotion entirely.
    const brandRestrictionDemotion = manufacturerBrandRestricted && !forceBrandBypass;

    const isResumeSeed = this.isResumeSeed(discoveredFrom);
    if (role === 'manufacturer') {
      if (this.shouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, { allowResume: isResumeSeed })) {
        this._rejectCounters.manufacturer_locale_duplicate += 1;
        return false;
      }
      // WHY: Narrowed manufacturer_locked_reject — support/manual/spec/pdf paths always survive.
      if (this._shouldHardRejectLockedManufacturer(parsed)) {
        this._rejectCounters.manufacturer_locked_reject += 1;
        return false;
      }
    }

    // ── Yield state resolution ──
    const allHostCounts = new Map([...this.hostCounts, ...this.manufacturerHostCounts, ...this.candidateHostCounts]);
    const yieldState = resolveHostYieldState({
      host,
      rootDomain,
      fieldYieldMap: this._fieldYieldMap || {},
      blockedHosts: this.blockedHosts,
      hostCounts: allHostCounts,
      maxPagesPerDomain: this.maxPagesPerDomain,
    }).state;

    // ── Stage C: Queue route resolution ──
    const route = this._resolveQueueRoute({
      host, role, triageMeta, forceApproved, forceCandidate, discoveredFrom, yieldState,
    });
    const enqueueReasonCodes = [...route.reason_codes];
    let targetQueue = route.queue;
    let enqueueDecision = 'accepted';

    // isLowValueHost demotion — only when no stronger triage routing
    const seededApprovedBypass = forceApproved && (discoveredFrom === 'seed' || discoveredFrom === 'learning_seed');
    if (
      !seededApprovedBypass &&
      isLowValueHost(parsed.hostname) &&
      !triageMeta?.primary_lane &&
      targetQueue !== 'candidate'
    ) {
      targetQueue = 'candidate';
      enqueueDecision = 'downgraded';
      enqueueReasonCodes.push('low_value_demoted');
      this._enqueueMetaCounters.downgraded += 1;
    }
    // isLowValueHost demotion does NOT override triage lane 1-4 routing
    if (
      !seededApprovedBypass &&
      isLowValueHost(parsed.hostname) &&
      triageMeta?.primary_lane &&
      triageMeta.primary_lane <= 4
    ) {
      // Triage lane 1-4 overrides low-value heuristic — do not demote
      enqueueReasonCodes.push('low_value_triage_override');
    }

    // manufacturer_brand_restricted demotion
    if (brandRestrictionDemotion && targetQueue !== 'candidate') {
      if (targetQueue === 'priority' || targetQueue === 'manufacturer') {
        targetQueue = 'general';
      }
      enqueueDecision = 'downgraded';
      enqueueReasonCodes.push('brand_restricted_demoted');
      this._enqueueMetaCounters.downgraded += 1;
    }

    // ── Stage D: Cap enforcement with domain-level eviction ──
    const isApprovedTarget = targetQueue === 'priority' || targetQueue === 'manufacturer' || targetQueue === 'general';
    const isCandidateTarget = targetQueue === 'candidate';

    if (isApprovedTarget) {
      const totalApprovedPlanned =
        this.priorityQueue.length +
        this.manufacturerQueue.length +
        this.queue.length +
        this.manufacturerVisitedCount +
        this.nonManufacturerVisitedCount;

      if (totalApprovedPlanned >= this.maxUrls) {
        this._rejectCounters.max_urls_reached += 1;
        return false;
      }

      // Domain-level cap with eviction
      const relevantQueue = targetQueue === 'manufacturer' ? this.manufacturerQueue : this.queue;
      const relevantHostCounts = targetQueue === 'manufacturer' ? this.manufacturerHostCounts : this.hostCounts;
      const plannedCount = countQueueHost(relevantQueue, host) + (relevantHostCounts.get(host) || 0);
      if (plannedCount >= this.maxPagesPerDomain) {
        // WHY: Try eviction before hard-rejecting — incoming may be stronger
        const incomingPrio = {
          approval_bucket: triageMeta?.approval_bucket || (forceApproved ? 'approved' : 'candidate'),
          selection_priority: triageMeta?.selection_priority || 'low',
          primary_lane: triageMeta?.primary_lane || 6,
          triage_score: triageMeta?.triage_score || 0,
          host_yield_state: yieldState,
          discovered_from: discoveredFrom,
          canonical_url: normalizedUrl,
        };
        const weakest = this._findWeakestSameDomainRow(host, normalizedUrl);
        if (weakest) {
          const weakestPrio = {
            approval_bucket: weakest.row.triage_passthrough?.approval_bucket || (weakest.row.approvedDomain ? 'approved' : 'candidate'),
            selection_priority: weakest.row.triage_passthrough?.selection_priority || 'low',
            primary_lane: weakest.row.triage_passthrough?.primary_lane || 6,
            triage_score: weakest.row.triage_passthrough?.triage_score || 0,
            host_yield_state: weakest.row.host_yield_state || 'normal',
            discovered_from: weakest.row.discoveredFrom || 'unknown',
            canonical_url: weakest.row.url,
          };
          if (compareDiscoveryPriority(incomingPrio, weakestPrio) < 0) {
            this._evictRow(weakest.row, weakest.queue);
            this._enqueueMetaCounters.evictions += 1;
            enqueueReasonCodes.push('cap_eviction');
            // Fall through to placement
          } else {
            this._rejectCounters.domain_cap += 1;
            return false;
          }
        } else {
          this._rejectCounters.domain_cap += 1;
          return false;
        }
      }
    }

    if (isCandidateTarget) {
      if (!this.fetchCandidateSources) {
        this._rejectCounters.candidate_sources_disabled += 1;
        return false;
      }
      if (this.candidateQueue.length + this.candidateVisitedCount >= this.maxCandidateUrls) {
        this._rejectCounters.max_candidate_urls += 1;
        return false;
      }
      const domainCount = this.candidateHostCounts.get(host) || 0;
      if (domainCount >= this.maxPagesPerDomain) {
        this._rejectCounters.candidate_domain_cap += 1;
        return false;
      }
    }

    // ── Queue placement ──
    const row = {
      url: normalizedUrl,
      host,
      rootDomain,
      tier: isCandidateTarget ? 4 : tier,
      tierName: isCandidateTarget ? 'candidate' : tierName,
      role: isCandidateTarget ? 'other' : role,
      priorityScore: 0,
      approvedDomain: isApprovedTarget,
      discoveredFrom,
      candidateSource: isCandidateTarget,
      sourceId: String(hostMeta?.sourceId || ''),
      displayName: String(hostMeta?.displayName || ''),
      crawlConfig: isObject(hostMeta?.crawlConfig) ? hostMeta.crawlConfig : null,
      fieldCoverage: isObject(hostMeta?.fieldCoverage) ? hostMeta.fieldCoverage : null,
      robotsTxtCompliant: hostMeta?.robotsTxtCompliant === null || hostMeta?.robotsTxtCompliant === undefined
        ? null
        : Boolean(hostMeta.robotsTxtCompliant),
      requires_js: Boolean(hostMeta?.requires_js),
      // Enqueue metadata (Phase 5)
      enqueue_decision: enqueueDecision,
      enqueue_reason_codes: enqueueReasonCodes,
      queue_selected: targetQueue,
      host_yield_state: yieldState,
      seed_source: discoveredFrom,
      triage_passthrough: triageMeta || null,
      revalidation_level: null,
      cap_state: null,
      duplicate_of: null,
    };
    row.priorityScore = this.sourcePriority(row);

    if (targetQueue === 'priority') {
      this.priorityQueue.push(row);
      this.sortPriorityQueue();
    } else if (targetQueue === 'manufacturer') {
      this.manufacturerQueue.push(row);
      this.sortManufacturerQueue();
    } else if (targetQueue === 'candidate') {
      this.candidateQueue.push(row);
      this.sortCandidateQueue();
    } else {
      this.queue.push(row);
    }
    if (isApprovedTarget) {
      this.sortApprovedQueue();
    }
    this._acceptCount += 1;
    return true;
  }

  _shouldHardRejectLockedManufacturer(parsed) {
    // WHY: Narrowed — support/manual/spec/pdf paths always survive.
    // Only reject when URL contains a product slug with ZERO identity overlap
    // AND is NOT a support/manual/spec/download/pdf page.
    if (this.allowedCategoryProductSlugs.size === 0) {
      return false;
    }
    const pathname = (parsed.pathname || '').toLowerCase();
    // Support/manual/spec/pdf paths always survive
    const supportPatterns = ['/support', '/manual', '/spec', '/download', '/pdf', '/drivers'];
    if (supportPatterns.some((p) => pathname.includes(p))) {
      return false;
    }
    if (pathname.endsWith('.pdf')) {
      return false;
    }
    // Delegate to existing validation for the narrowed check
    return checkShouldRejectLockedManufacturerUrl(parsed, this._validationCtx());
  }

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

  hasNext() {
    return (
      this.priorityQueue.length > 0 ||
      this.manufacturerQueue.length > 0 ||
      this.queue.length > 0 ||
      this.candidateQueue.length > 0
    );
  }

  // WHY: Read-only peek of all queued URLs for pre-populating GUI worker rows.
  peekAll() {
    return [
      ...this.priorityQueue,
      ...this.manufacturerQueue,
      ...this.queue,
      ...this.candidateQueue,
    ];
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
    if (!source) {
      return null;
    }

    this.visitedUrls.add(source.url);
    if (source.candidateSource) {
      this.candidateVisitedCount += 1;
      this.candidateHostCounts.set(
        source.host,
        (this.candidateHostCounts.get(source.host) || 0) + 1
      );
    } else {
      this.approvedVisitedCount += 1;
      if (source.role === 'manufacturer') {
        this.manufacturerVisitedCount += 1;
        this.manufacturerHostCounts.set(
          source.host,
          (this.manufacturerHostCounts.get(source.host) || 0) + 1
        );
      } else {
        this.nonManufacturerVisitedCount += 1;
        this.hostCounts.set(source.host, (this.hostCounts.get(source.host) || 0) + 1);
      }
    }
    return source;
  }

  discoverFromHtml(baseUrl, html) {
    return this._discovery.discoverFromHtml(baseUrl, html);
  }

  discoverFromRobots(baseUrl, body) {
    return this._discovery.discoverFromRobots(baseUrl, body);
  }

  discoverFromSitemap(baseUrl, body) {
    return this._discovery.discoverFromSitemap(baseUrl, body);
  }

  hasQueuedOrVisitedComparableUrl(parsed, options = {}) {
    return checkHasQueuedOrVisitedComparableUrl(parsed, options, this._queueState());
  }

  shouldFrontloadApprovedSource(row) {
    if (!row?.approvedDomain) {
      return false;
    }
    return row.discoveredFrom === 'seed' || row.discoveredFrom === 'learning_seed';
  }

  isRelevantDiscoveredUrl(parsed, context = {}) {
    return checkIsRelevantDiscoveredUrl(parsed, context, this._validationCtx());
  }

  markFieldsFilled(fields) {
    let changed = false;
    for (const field of fields || []) {
      if (!field) {
        continue;
      }
      if (!this.filledFields.has(field)) {
        this.filledFields.add(field);
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    for (const row of this.queue) {
      row.priorityScore = this.sourcePriority(row);
    }
    for (const row of this.priorityQueue) {
      row.priorityScore = this.sourcePriority(row);
    }
    for (const row of this.manufacturerQueue) {
      row.priorityScore = this.sourcePriority(row);
    }
    for (const row of this.candidateQueue) {
      row.priorityScore = this.sourcePriority(row);
    }
    this.sortManufacturerQueue();
    this.sortApprovedQueue();
    this.sortCandidateQueue();
  }

  sortPriorityQueue() {
    this.priorityQueue.sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        a.tier - b.tier ||
        a.url.localeCompare(b.url)
    );
  }

  sortManufacturerQueue() {
    this.manufacturerQueue.sort(
      (a, b) =>
        b.priorityScore - a.priorityScore ||
        urlPath(a.url).localeCompare(urlPath(b.url)) ||
        a.url.localeCompare(b.url)
    );
  }

  sortApprovedQueue() {
    this.queue.sort((a, b) => a.tier - b.tier || b.priorityScore - a.priorityScore || a.url.localeCompare(b.url));
  }

  sortCandidateQueue() {
    this.candidateQueue.sort((a, b) => b.priorityScore - a.priorityScore || a.url.localeCompare(b.url));
  }

  blockHost(host, reason = 'blocked') {
    const normalized = normalizeHost(host);
    if (!normalized) {
      return 0;
    }

    this.blockedHosts.add(normalized);
    this.blockedHostReasons[normalized] = reason;

    let removed = 0;
    const filterFn = (row) => {
      const shouldKeep = !hostInSet(row.host, this.blockedHosts);
      if (!shouldKeep) {
        removed += 1;
      }
      return shouldKeep;
    };

    this.manufacturerQueue = this.manufacturerQueue.filter(filterFn);
    this.priorityQueue = this.priorityQueue.filter(filterFn);
    this.queue = this.queue.filter(filterFn);
    this.candidateQueue = this.candidateQueue.filter(filterFn);
    return removed;
  }

  _scoringCtx() {
    return {
      sourceIntelDomains: this.sourceIntelDomains,
      brandKey: this.brandKey,
      requiredFields: this.requiredFields,
      filledFields: this.filledFields
    };
  }

  getIntelBundle(rootDomain) {
    return resolveIntelBundle(rootDomain, this._scoringCtx());
  }

  scoreRequiredFieldBoost(activeIntel, domainIntel, missingRequiredFields) {
    return _scoreRequiredFieldBoost(activeIntel, domainIntel, missingRequiredFields);
  }

  readRewardScoreFromMethodMap(map, field) {
    return _readRewardScoreFromMethodMap(map, field);
  }

  scoreFieldRewardBoost(row, domainIntel, activeIntel, missingRequiredFields) {
    return _scoreFieldRewardBoost(row, domainIntel, activeIntel, missingRequiredFields);
  }

  sourcePathHeuristicBoost(row) {
    return computePathHeuristicBoost(row, this._scoringCtx());
  }

  sourcePriority(row) {
    return computeSourcePriority(row, this._scoringCtx());
  }

  domainPriority(rootDomain) {
    return computeDomainPriority(rootDomain, this._scoringCtx());
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
      robots_sitemaps_discovered: this._discoveryCounters.robotsSitemapsDiscovered,
      sitemap_urls_discovered: this._discoveryCounters.sitemapUrlsDiscovered,
      max_urls: this.maxUrls
    };
  }
}

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
