# Crawl Pipeline Overview

> Replaces the old stages 09–13 (extraction, identity evaluation, consensus, finalization, export).
> Validated: 2026-03-26. Sources: `src/features/crawl/`, `src/pipeline/runCrawlProcessingLifecycle.js`, `src/pipeline/runProduct.js`.

## Architecture

The pipeline after domain classification is now a single phase: **Crawl**.

```
Discovery (stages 01–08, unchanged)
  └─ Planner queue seeded with approved URLs
       └─ runCrawlProcessingLifecycle
            ├─ Batch drain: collect URLs from planner
            ├─ session.processBatch(urls)
            │    └─ ONE PlaywrightCrawler, N concurrent pages (maxConcurrency)
            │         ├─ Plugin lifecycle per page:
            │         │    beforeNavigate → navigate → afterNavigate → onInteract → onCapture → onComplete
            │         ├─ Block detection in requestHandler (classifyBlockStatus)
            │         │    ├─ Blocked → session.retire() → throw → Crawlee retries with new session
            │         │    ├─ Non-retryable (timeout/DNS/download) → request.noRetry → fail fast
            │         │    └─ robots_blocked → request.noRetry (respects robots.txt)
            │         ├─ Stealth plugin: hides webdriver, sets UA
            │         ├─ AutoScroll plugin: scrolls to trigger lazy content
            │         └─ Screenshots: targeted selectors + full-page
            ├─ classifyBlockStatus in lifecycle: re-classify for proxy retry decision
            ├─ retryWithProxy: lazy proxy crawler for still-blocked URLs
            ├─ frontierDb.recordFetch: update URL history (always, success or failure)
            └─ Events: fetch_queued → fetch_started → fetch_retrying → fetch_finished
```

## What Was Removed

| Old Stage | What It Did | Status |
|-----------|-------------|--------|
| 09 | Source extraction (deterministic + LLM) | **Deleted** — ~8,300 LOC |
| 10 | Identity evaluation (per-source gating) | **Deleted** — ~4,627 LOC |
| 11 | Consensus engine (cross-source scoring) | **Deleted** — ~1,500 LOC |
| 12 | Finalization + validation gate | **Deleted** — ~5,067 LOC |
| 13 | Completion lifecycle + learning export | **Deleted** — ~1,515 LOC |

Total: ~24,000 LOC removed across ~300 files.

## What Remains

| Component | Location | Status |
|-----------|----------|--------|
| Discovery pipeline (stages 01–08) | `src/features/indexing/discovery/` | **Unchanged** |
| Source planner | `src/planner/sourcePlanner.js` | **Unchanged** |
| Frontier DB (URL history) | `src/research/frontierDb.js` | **Unchanged** |
| Settings registry | `src/shared/settingsRegistry.js` | **Unchanged** (dead settings inert) |
| Crawl module | `src/features/crawl/` | **New** |

## Key Files

| File | Role |
|------|------|
| `src/features/crawl/crawlSession.js` | Persistent PlaywrightCrawler with plugin lifecycle |
| `src/features/crawl/crawlPage.js` | Per-URL orchestrator (session + block classify + frontier) |
| `src/features/crawl/core/pluginRunner.js` | Runs plugins through named lifecycle hooks |
| `src/features/crawl/bypassStrategies.js` | Pure block detection (status + HTML markers) |
| `src/features/crawl/screenshotCapture.js` | Targeted + full-page screenshots |
| `src/features/crawl/plugins/stealthPlugin.js` | Hides webdriver, injects stealth fingerprint |
| `src/features/crawl/plugins/autoScrollPlugin.js` | Scrolls N passes for lazy content |
| `src/pipeline/runCrawlProcessingLifecycle.js` | Batch drain loop from planner |
| `src/pipeline/runProduct.js` | Main orchestrator (~190 LOC) |
| `src/runner/runUntilComplete.js` | Single-pass wrapper (~100 LOC) |

## Concurrency Model

TWO Crawlee crawlers — one direct, one proxy (lazy):

- **Main crawler** (direct, no proxy): runs with `maxConcurrency` controlling parallel browser pages. No `ProxyConfiguration` — Crawlee's `tieredProxyUrls` breaks HTTPS via local proxy-chain relay.
- **Proxy crawler** (lazy): created on first `retryWithProxy` call, reused across batches. Uses `ProxyConfiguration({ proxyUrls })` from `crawleeProxyUrlsJson` setting. Torn down on `shutdown()`.
- `crawlSessionCount` setting (default 4, max 20) → `maxConcurrency` on both crawlers
- Each URL gets a unique `worker_id` (`fetch-a1`, `fetch-b2`, ...) for GUI visibility
- `fetch_queued` / `fetch_started` / `fetch_retrying` / `fetch_finished` events emitted per URL
- `proxyInfo.url` is included in `fetch_started` events so the GUI shows which proxy is active

## Plugin Interface

```js
{
  name: 'myPlugin',
  hooks: {
    beforeNavigate: async ({ page, request, settings }) => {},
    afterNavigate:  async ({ page, request, response, settings }) => {},
    onInteract:     async ({ page, request, settings }) => {},
    onCapture:      async ({ page, request, settings, html }) => {},
    onComplete:     async ({ page, request, settings, result }) => {},
  }
}
```

Plugins run sequentially in registration order. Errors are caught per-plugin (never crash the crawl loop). Context mutations from one plugin are visible to the next.

## Block Detection

`classifyBlockStatus({ status, html })` returns `{ blocked, blockReason }`:

| Condition | blockReason |
|-----------|-------------|
| Status 403 | `status_403` |
| Status 429 | `status_429` |
| Status 451 | `robots_blocked` |
| Status 5xx | `server_error` |
| Status 0/null | `no_response` |
| `cf-browser-verification` / `cf-challenge` class in HTML | `cloudflare_challenge` |
| CAPTCHA markers (`captcha`, `g-recaptcha`, `h-captcha`, `challenge-form`) | `captcha_detected` |
| "Access Denied" / "Forbidden" in `<title>` or `<h1>` | `access_denied` |
| "Access Denied" / "Forbidden" in body of SHORT pages (<2KB) | `access_denied` |
| Very short HTML (<200 bytes), no `<body>` | `empty_response` |

Crawlee's built-in `retryOnBlocked` is disabled — block detection runs in the requestHandler after page content capture so we get HTML for classification.

## Retry & Proxy Architecture

**In-handler block detection → Crawlee native retry → proxy fallback:**

1. `requestHandler` captures HTML, runs `classifyBlockStatus`.
2. If blocked: `session.retire()` + throw `Error('blocked:reason')`. Block info stored on `request.userData.__blockInfo`.
3. Crawlee retries with new session (fresh fingerprint/cookies). `maxRequestRetries: 1` = one native retry.
4. If retry succeeds → lifecycle sees success, no proxy needed.
5. If retry fails → `failedRequestHandler` resolves with block info → lifecycle calls `retryWithProxy`.
6. `retryWithProxy` uses a lazy proxy crawler (created once, reused). `maxRequestRetries: 2` on proxy crawler.

**Non-retryable errors** (`request.noRetry = true`, fail fast):
- `requestHandler timed out` — server won't respond faster on retry
- `Navigation timed out` — same
- `Download is starting` — site serves a file, not a page
- `net::ERR_NAME_NOT_RESOLVED` — domain doesn't exist
- `net::ERR_CONNECTION_REFUSED` — server actively refusing
- `net::ERR_CONNECTION_RESET` — connection dropped
- `net::ERR_TUNNEL_CONNECTION_FAILED` — invalid proxy URL
- `robots_blocked` (451) — respects robots.txt

**Timing budget (worst case per URL):**
- Block → 1 native retry → proxy = ~20s
- Timeout → no retry → proxy = ~35s
- Non-retryable error → fail = ~1-3s
- Happy path = ~5-15s

## Worker States (GUI)

| State | Badge | Trigger |
|-------|-------|---------|
| `queued` | QUEUED (gray) | `fetch_queued` event |
| `crawling` | CRAWLING (blue, bounce) | `fetch_started` (retry_count=0) |
| `retrying` | Error reason + RETRY Ns (dual badge) | `fetch_started` (retry_count>0) |
| `stuck` | STUCK (red pulse) | elapsed > handler timeout - 5s |
| `crawled` | CRAWLED (green) | `fetch_finished` success |
| `blocked` | BLOCKED (yellow) | 403/forbidden error |
| `rate_limited` | 429 (yellow) | HTTP 429 |
| `captcha` | CAPTCHA (red) | captcha/cloudflare detected |
| `failed` | Specific error: TIMEOUT/5XX/DNS/DOWNLOAD (red) | all retries exhausted |

Worker rows show: truncated URL path, proxy label (`direct` or proxy hostname), elapsed timer on all pools.

## Frontier DB Integration

`frontierDb.recordFetch()` is called for EVERY URL (success or failure):
- Status 404 → 3-day cooldown (14 days on 3rd+ attempt)
- Status 403 → exponential backoff (base 1800s)
- Status 429 → exponential backoff (base 600s)
- Timeout → 6-hour cooldown

`frontierDb.shouldSkipUrl()` checks cooldowns before each URL is crawled.

## Return Shape

`runProduct()` returns:
```json
{
  "crawlResults": [
    {
      "success": true,
      "url": "https://example.com/product",
      "finalUrl": "https://example.com/product",
      "status": 200,
      "blocked": false,
      "blockReason": null,
      "screenshots": [{ "kind": "page", "format": "jpeg", "bytes": "<Buffer>" }],
      "html": "<html>...</html>",
      "fetchDurationMs": 4200,
      "workerId": "fetch-a1"
    }
  ],
  "runId": "20260324-abc123",
  "category": "mouse",
  "productId": "mouse-razer-viper-v3-pro"
}
```
