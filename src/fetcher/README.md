## Purpose
HTTP and browser-based page fetching with multiple strategy backends. Handles static HTTP fetch, dynamic Playwright rendering, Crawlee-based crawling, robots.txt compliance, network recording, stealth profiles, and runtime screencast capture.

## Public API (The Contract)
- `playwrightFetcher.js`: `PlaywrightFetcher` class — browser-based fetch with auto-scroll, stealth, screenshot capture, network interception. Primary dynamic fetch strategy.
- `fetchResult.js`: `buildFetchResult()`, `buildFetchError()`, `isFetchResultDead()`, `shouldExtract()`, `summarizeFetchResult()` — standardized fetch result construction and classification.
- `fetcherMode.js`: `selectFetcherMode(config, url, policy)` — selects fetch strategy (http/playwright/crawlee/dryrun/replay).
- `dynamicFetchPolicy.js`: `resolveDynamicFetchPolicy(url, policyMap)`, `normalizeDynamicFetchPolicyMap(raw)` — per-domain fetch strategy policy resolution.
- `dynamicCrawlerService.js`: `DynamicCrawlerService` class — Crawlee-based crawling with configurable handlers.
- `robotsPolicy.js`: `RobotsPolicyCache` class — robots.txt parsing, caching, and compliance checking.
- `networkRecorder.js`: `NetworkRecorder` class — captures network requests/responses during browser fetch for replay and debugging.
- `graphqlReplay.js`: `replayGraphqlRequests()` — replays captured GraphQL requests for data extraction.
- `replayFetcher.js`: `ReplayFetcher` class — replays previously captured fetch results from disk.
- `runtimeScreencast.js`: `attachRuntimeScreencast(page, config)` — captures live browser screencast frames.
- `stealthProfile.js`: `buildStealthContextOptions()`, `STEALTH_USER_AGENT`, `STEALTH_VIEWPORT` — anti-detection browser context configuration.

## Dependencies
- Allowed: `src/features/indexing/extraction/` (extraction interface), `src/replay/` (replay manifests), `src/shared/`, `src/utils/`.
- External: `playwright` (browser automation).
- Forbidden: `src/api/`, `src/db/`, `src/core/` (fetcher is a leaf module — it should not depend on infrastructure).

## Domain Invariants
- Every fetch produces a standardized `FetchResult` regardless of backend strategy.
- Robots.txt compliance is enforced when `robotsTxtCompliant` is enabled. Disallowed URLs return a blocked result, never a fetch attempt.
- Playwright contexts use stealth profiles by default. No raw browser fingerprint is exposed.
- Fetch results carry status codes, content, timing, and error metadata. Missing fields default to safe values, never undefined.
- Dynamic fetch policy is resolved per-domain before fetch. No fetch bypasses policy resolution.
