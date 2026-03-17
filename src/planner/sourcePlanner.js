import { extractRootDomain } from '../utils/common.js';
import { toRawFieldKey } from '../utils/fieldKeys.js';
import {
  inferRoleForHost,
  isDeniedHost,
  resolveTierForHost,
  resolveTierNameForHost
} from '../categories/loader.js';
import { isLowValueHost, validateFetchUrl } from '../pipeline/urlQualityGate.js';
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
import {
  BRAND_PREFIXED_CATEGORY_HOSTS,
  manufacturerHostHintsForBrand,
  manufacturerSeedHostsForBrand,
  buildAllowedCategoryProductSlugs
} from './sourcePlannerBrandConfig.js';
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
    this.fetchCandidateSources = Boolean(config.fetchCandidateSources);

    const requiredFieldsRaw = options.requiredFields || [];
    this.requiredFields = requiredFieldsRaw
      .map((field) => toRawFieldKey(field, { fieldOrder: categoryConfig.fieldOrder || [] }))
      .filter(Boolean);
    this.sourceIntelDomains = options.sourceIntel?.domains || {};
    this.brandKey = slug(job.identityLock?.brand || '');
    this.brandHostHints = manufacturerHostHintsForBrand(job.identityLock?.brand || '');

    this.maxUrls = config.maxUrlsPerProduct;
    this.maxCandidateUrls = config.maxCandidateUrls;
    this.maxPagesPerDomain = config.maxPagesPerDomain;

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

    const encodedQuery = encodeURIComponent(queryText);
    const fallbackBrandSeeds = manufacturerSeedHostsForBrand(
      this.job.identityLock?.brand || '',
      this.brandHostHints
    );
    const manufacturerHosts = new Set(
      this.brandManufacturerHostSet.size
        ? [...this.brandManufacturerHostSet]
        : (this.brandHostHints.length > 0
          ? fallbackBrandSeeds
          : [...this.manufacturerHostsFromConfig()])
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

  seedCandidates(urls) {
    if (!this.fetchCandidateSources) {
      return;
    }
    for (const url of urls || []) {
      this.enqueueCandidate(url, 'discovery');
    }
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
    const { forceApproved = false, forceCandidate = false, forceBrandBypass = false } = options;

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

    const normalizedUrl = canonicalizeQueueUrl(parsed);
    if (this.visitedUrls.has(normalizedUrl)) {
      this._rejectCounters.already_visited += 1;
      return false;
    }

    if (this.queue.find((item) => item.url === normalizedUrl)) {
      this._rejectCounters.already_queued += 1;
      return false;
    }

    if (this.manufacturerQueue.find((item) => item.url === normalizedUrl)) {
      this._rejectCounters.already_queued += 1;
      return false;
    }

    if (this.priorityQueue.find((item) => item.url === normalizedUrl)) {
      this._rejectCounters.already_queued += 1;
      return false;
    }

    if (this.candidateQueue.find((item) => item.url === normalizedUrl)) {
      this._rejectCounters.already_queued += 1;
      return false;
    }

    const host = normalizeHost(parsed.hostname);
    if (!host || isDeniedHost(host, this.categoryConfig)) {
      this._rejectCounters.denied_host += 1;
      return false;
    }
    if (hostInSet(host, this.blockedHosts)) {
      this._rejectCounters.blocked_host += 1;
      return false;
    }
    const seededApprovedLowValueBypass =
      forceApproved && (discoveredFrom === 'seed' || discoveredFrom === 'learning_seed');
    if (isLowValueHost(parsed.hostname) && !seededApprovedLowValueBypass) {
      this._rejectCounters.low_value_host += 1;
      return false;
    }
    // Full URL quality gate check (search page rejection, etc.)
    // Seed URLs bypass the gate — they were explicitly provided.
    if (!seededApprovedLowValueBypass) {
      const urlGate = validateFetchUrl(normalizedUrl);
      if (!urlGate.valid) {
        this._rejectCounters.url_quality_gate += 1;
        return false;
      }
    }

    const approvedDomain = this.shouldUseApprovedQueue(host, forceApproved, forceCandidate);
    const rootDomain = extractRootDomain(host);
    const hostMeta = this.sourceHostMap.get(host) || null;
    const tier = Number.isFinite(Number(hostMeta?.tier))
      ? Number(hostMeta.tier)
      : resolveTierForHost(host, this.categoryConfig);
    const tierName = String(hostMeta?.tierName || resolveTierNameForHost(host, this.categoryConfig));
    const role = String(hostMeta?.role || inferRoleForHost(host, this.categoryConfig));
    const manufacturerBrandRestricted =
      role === 'manufacturer' &&
      this.brandManufacturerHostSet.size > 0 &&
      !hostInSet(host, this.brandManufacturerHostSet);
    if (manufacturerBrandRestricted && !forceBrandBypass) {
      this._rejectCounters.manufacturer_brand_restricted += 1;
      return false;
    }
    const isResumeSeed = this.isResumeSeed(discoveredFrom);
    if (role === 'manufacturer') {
      if (this.shouldRejectLockedManufacturerLocaleDuplicateUrl(parsed, { allowResume: isResumeSeed })) {
        this._rejectCounters.manufacturer_locale_duplicate += 1;
        return false;
      }
      if (this.shouldRejectLockedManufacturerUrl(parsed)) {
        this._rejectCounters.manufacturer_locked_reject += 1;
        return false;
      }
    }
    const totalApprovedPlanned =
      this.priorityQueue.length +
      this.manufacturerQueue.length +
      this.queue.length +
      this.manufacturerVisitedCount +
      this.nonManufacturerVisitedCount;
    const isManufacturerSource = role === 'manufacturer';

    if (approvedDomain) {
      if (totalApprovedPlanned >= this.maxUrls) {
        this._rejectCounters.max_urls_reached += 1;
        return false;
      }

      if (isManufacturerSource) {
        const plannedCount =
          countQueueHost(this.manufacturerQueue, host) + (this.manufacturerHostCounts.get(host) || 0);
        if (plannedCount >= this.maxPagesPerDomain) {
          this._rejectCounters.domain_cap += 1;
          return false;
        }
        const manufacturerPlanned = this.manufacturerQueue.length + this.manufacturerVisitedCount;
        if (manufacturerPlanned >= this.maxUrls) {
          this._rejectCounters.max_urls_reached += 1;
          return false;
        }
      } else {
        const plannedCount = countQueueHost(this.queue, host) + (this.hostCounts.get(host) || 0);
        if (plannedCount >= this.maxPagesPerDomain) {
          this._rejectCounters.domain_cap += 1;
          return false;
        }
      }

      const row = {
        url: normalizedUrl,
        host,
        rootDomain,
        tier,
        tierName,
        role,
        priorityScore: 0,
        approvedDomain: true,
        discoveredFrom,
        candidateSource: false,
        sourceId: String(hostMeta?.sourceId || ''),
        displayName: String(hostMeta?.displayName || ''),
        crawlConfig: isObject(hostMeta?.crawlConfig) ? hostMeta.crawlConfig : null,
        fieldCoverage: isObject(hostMeta?.fieldCoverage) ? hostMeta.fieldCoverage : null,
        robotsTxtCompliant: hostMeta?.robotsTxtCompliant === null || hostMeta?.robotsTxtCompliant === undefined
          ? null
          : Boolean(hostMeta.robotsTxtCompliant),
        requires_js: Boolean(hostMeta?.requires_js)
      };
      row.priorityScore = this.sourcePriority(row);

      if (this.shouldFrontloadApprovedSource(row)) {
        this.priorityQueue.push(row);
        this.sortPriorityQueue();
      } else if (isManufacturerSource) {
        this.manufacturerQueue.push(row);
        this.sortManufacturerQueue();
      } else {
        this.queue.push(row);
      }
      this.sortApprovedQueue();
      this._acceptCount += 1;
      return true;
    }

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

    this.candidateQueue.push({
      url: normalizedUrl,
      host,
      rootDomain,
      tier: 4,
      tierName: 'candidate',
      role: 'other',
      priorityScore: this.sourcePriority({
        url: normalizedUrl,
        host,
        rootDomain,
        tier: 4,
        tierName: 'candidate',
        role: 'other',
        approvedDomain: false,
        discoveredFrom,
        candidateSource: true
      }),
      approvedDomain: false,
      discoveredFrom,
      candidateSource: true
    });

    this.sortCandidateQueue();
    this._acceptCount += 1;
    return true;
  }

  get enqueueCounters() {
    return {
      accepted: this._acceptCount,
      rejected: { ...this._rejectCounters },
      total_rejected: Object.values(this._rejectCounters).reduce((sum, v) => sum + v, 0),
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
