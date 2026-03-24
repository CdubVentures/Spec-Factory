## Purpose
Source planning, URL queuing, and crawl prioritization. Manages multi-tier queue (manufacturer > priority > general > candidate), brand/model tokenization for slug matching, manufacturer host selection, URL deduplication, and discovery callback integration.

## Public API (The Contract)
- `sourcePlanner.js`: `SourcePlanner` class — stateful planner with queue management (`.enqueue()`, `.dequeue()`, `.isEmpty()`, `.size()`), manufacturer host selection, and discovery integration.
- `sourcePlanner.js`: `.updateBrandHints(brandResolution)` — called after Stage 02 (Brand Resolver) to wire LLM-resolved brand aliases into manufacturer host filtering.
- `sourcePlannerDiscovery.js`: `createSourceDiscovery(options)` — factory returning discovery object with `.discoverFromHtml()`, `.discoverFromSitemap()` for extracting URLs from fetched pages.
- `sourcePlannerScoring.js`: `scoreRequiredFieldBoost()`, `scoreFieldRewardBoost()`, `computePathHeuristicBoost()`, `computeSourcePriority()`, `computeDomainPriority()` — URL/source priority scoring.
- `sourcePlannerValidation.js`: `checkShouldUseApprovedQueue()`, `checkIsResumeSeed()`, `checkMatchesAllowedLockedProductSlug()`, `checkHasQueuedOrVisitedComparableUrl()` — URL qualification gates.
- `sourcePlannerUrlUtils.js`: `normalizeHost()`, `getHost()`, `canonicalizeQueueUrl()`, `tokenize()`, `slug()`, `slugIdentityTokens()`, `urlPath()`, `extractCategoryProductSlug()`, `stripLocalePrefix()`, `isSitemapLikePath()`, `CATEGORY_PRODUCT_PATH_RE` — URL normalization and tokenization utilities.

## Dependencies
- Allowed: `src/categories/` (category loader for approved hosts), `src/pipeline/` (urlQualityGate), `src/shared/`, `src/utils/` (transitional).
- Forbidden: `src/features/`, `src/api/`, `src/db/`.

## Domain Invariants
- No URL is fetched twice per run (`visitedUrls` dedup enforced at enqueue time).
- Manufacturer queue is always drained before general queue. Priority queue sits between.
- Host count caps are enforced — no single host dominates the crawl.
- Blocked hosts and denied hosts are never enqueued regardless of source.
- Brand tokenization is deterministic: same brand string always produces same token set.
- Discovery callbacks are registered once and invoked per fetched page. No re-registration during a run.
