# Crawl Pipeline Overview

> Replaces the old stages 09–13 (extraction, identity evaluation, consensus, finalization, export).
> Validated: 2026-03-24. Sources: `src/features/crawl/`, `src/pipeline/runCrawlProcessingLifecycle.js`, `src/pipeline/runProduct.js`.

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
            │         ├─ Stealth plugin: hides webdriver, sets UA
            │         ├─ AutoScroll plugin: scrolls to trigger lazy content
            │         └─ Screenshots: targeted selectors + full-page
            ├─ classifyBlockStatus: detect 403/429/captcha/cloudflare/empty
            ├─ frontierDb.recordFetch: update URL history (always, success or failure)
            └─ Emit fetch_started / fetch_finished events per URL (GUI worker tab)
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

ONE physical Crawlee session with `maxConcurrency` controlling parallel browser pages.

- `crawlSessionCount` setting (default 4, max 20) → `maxConcurrency` on the PlaywrightCrawler
- Shared rate limiting — if one page gets 429'd, all pages pause for that host
- Built-in URL deduplication via Crawlee's RequestQueue
- Shared cookie jar and proxy rotation across all pages
- Each URL gets a unique `worker_id` (`fetch-a1`, `fetch-b2`, ...) for GUI visibility
- `fetch_started` / `fetch_finished` events emitted per URL

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
| Cloudflare challenge markers | `cloudflare_challenge` |
| CAPTCHA markers in HTML | `captcha_detected` |
| "Access Denied" / "Forbidden" text | `access_denied` |
| Very short HTML, no `<body>` | `empty_response` |

Crawlee's built-in `retryOnBlocked` is disabled — we handle all block detection ourselves after capturing the page content.

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
