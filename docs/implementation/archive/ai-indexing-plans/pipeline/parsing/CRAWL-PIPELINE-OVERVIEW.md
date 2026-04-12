# Crawl Pipeline Overview

> Validated: 2026-03-29. Sources: `src/features/crawl/`, `src/features/extraction/`, `src/pipeline/runProduct.js`.

## Architecture

```
Discovery (stages 01–08)
  └─ Planner queue seeded with approved URLs
       └─ session.runFetchPlan(orderedSources, workerIdMap)
            ├─ Batch drain (batchSize = slots × 2)
            ├─ ONE PlaywrightCrawler, N concurrent pages
            │    ├─ preNavigationHook:
            │    │    ├─ Set waitUntil (default: domcontentloaded)
            │    │    ├─ Start CDP screencast (if enabled)
            │    │    ├─ Run onInit hooks (stealth, overlayDismissal CSS, cssOverride routes)
            │    │    └─ Same-domain delay (if configured)
            │    ├─ page.goto() → waitUntil fires
            │    ├─ Paint gate (rAF×2, ~32ms — ensures visual frame for video/screenshot)
            │    ├─ Suite loop (fetchDismissRounds × [dismiss → scroll]):
            │    │    ├─ onDismiss: cookieConsent, overlayDismissal, domExpansion, cssOverride
            │    │    │    (concurrent by default — all run via Promise.allSettled)
            │    │    └─ onScroll: autoScroll (sequential, between dismiss rounds)
            │    ├─ page.content() → capture HTML
            │    ├─ classifyBlockStatus({ status, html })
            │    │    ├─ Blocked → session.retire() → throw → Crawlee retries
            │    │    └─ Not blocked → stash __capturedPage for timeout rescue
            │    ├─ HTML persistence → onHtmlPersist callback
            │    │    └─ gzip + content-addressed write + crawl_sources SQL
            │    ├─ Extraction (capture phase, inside handler with live page):
            │    │    └─ screenshotPlugin.onExtract → stabilize + capture + stitch
            │    ├─ Screenshot persistence → onScreenshotsPersist callback
            │    ├─ CDP screencast stop
            │    ├─ Emit source_processed → resolveEntry
            │    └─ Video save (prePageCloseHook → trimVideo)
            ├─ Extraction (transform phase, after handler — no page, no timeout):
            │    └─ Promise.all on transform-phase plugins (none currently)
            ├─ classifyBlockStatus in lifecycle: re-classify for proxy retry
            ├─ retryWithProxy: lazy proxy crawler for still-blocked URLs
            ├─ frontierDb.recordFetch: update URL history
            └─ Emit crawler_stats (per-batch Crawlee native stats)
```

## Plugin Lifecycle

Six fetch plugins, registered in `src/features/crawl/plugins/pluginRegistry.js`:

| Plugin | Suites | Hooks | What It Does |
|--------|--------|-------|-------------|
| stealth | init | onInit | Hides webdriver, patches chrome runtime/app/csi/loadTimes/permissions |
| cookieConsent | dismiss | onDismiss | Autoconsent (200ms fast-fail) → single page.evaluate fallback selectors |
| overlayDismissal | init, dismiss | onInit, onDismiss | CSS suppression + MutationObserver (onInit). Single evaluate: scan overlays, close/remove, reset scroll-lock, read observer telemetry (onDismiss) |
| domExpansion | dismiss | onDismiss | Single evaluate: click expand/show-more buttons, verify content delta |
| cssOverride | init, dismiss | onInit, onDismiss | Route blocking for widget domains (onInit). CSS injection for hidden/fixed elements (onDismiss) |
| autoScroll | scroll | onScroll | Jump or incremental scroll passes for lazy content |

**Execution model:**
- **onInit**: runs in preNavigationHook (before page.goto). Sequential.
- **onDismiss**: runs in suite loop. **Concurrent by default** (all 4 fire via `Promise.allSettled`).
- **onScroll**: runs between dismiss rounds. Sequential (only autoScroll).
- Each dismiss plugin does ONE `page.evaluate()` — all DOM work happens in-browser, zero IPC round-trips.

## Extraction

One extraction plugin: `screenshotExtractionPlugin` (phase: `capture`, concurrent: `true`).

- **Capture phase**: runs inside requestHandler with live page access. Stabilizes page (fonts, images, paint gate via `pageStabilizer.js`), then captures screenshots. If page exceeds Chromium's 16,384px texture limit, stitches via `viewportStitcher.js`.
- **Transform phase**: runs after handler closes, no page, no timeout. Currently no transform plugins registered.

Extraction runner: `src/features/extraction/core/extractionRunner.js`.

## Block Detection

`classifyBlockStatus({ status, html })` — pure function, content-quality gated:

| Condition | blockReason | Content gate |
|-----------|-------------|-------------|
| Status 0/null | `no_response` | Always blocked |
| Status 451 | `robots_blocked` | Always blocked |
| Status 429 | `status_429` | Always blocked |
| Status 5xx | `server_error` | Always blocked |
| Status 403 + HTML < 5KB | `status_403` | Blocked only if short |
| Status 403 + HTML > 5KB with `<body>` | Not blocked | Real page served with 403 |
| CF markers in short page | `cloudflare_challenge` | Bypassed if substantial |
| CAPTCHA markers in short page | `captcha_detected` | Bypassed if substantial |
| "Access Denied"/"Forbidden" in `<title>`/`<h1>` | `access_denied` | — |
| HTML < 200 bytes, no `<body>` | `empty_response` | — |

Crawlee's built-in `retryOnBlocked` is disabled (configurable via `crawleeRetryOnBlocked` setting).

## Timeout Rescue

When the handler timeout fires AFTER `page.content()` captured HTML:
1. HTML stashed on `request.userData.__capturedPage`
2. Extraction results stashed on `request.userData.__capturedExtractions`
3. `failedRequestHandler` rescues both, returns result with `timeoutRescued: true`
4. `errorHandler` sets `noRetry = true` to prevent wasting another 45s re-loading

## Retry & Proxy

1. Handler detects block → `session.retire()` → throw → Crawlee retries with new session
2. If retry succeeds → normal success path
3. If retry fails → `failedRequestHandler` → lifecycle calls `retryWithProxy`
4. Proxy crawler: lazy (created once), uses `ProxyConfiguration({ proxyUrls })`, `maxRetries: 2`
5. `robots_blocked` → `noRetry`, never retried

Non-retryable errors (fail fast): `Navigation timed out`, `Download is starting`, `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_CONNECTION_RESET`, `ERR_TUNNEL_CONNECTION_FAILED`.

## Key Files

| File | Role |
|------|------|
| `src/features/crawl/crawlSession.js` | PlaywrightCrawler with plugin lifecycle, video, screencast, timeout rescue |
| `src/features/crawl/core/suiteOrchestrator.js` | Round-based dismiss/scroll loop |
| `src/features/crawl/core/pluginRunner.js` | Sequential + concurrent hook execution |
| `src/features/crawl/bypassStrategies.js` | Pure block detection |
| `src/features/crawl/plugins/pluginRegistry.js` | Plugin registration (6 plugins) |
| `src/features/extraction/core/extractionRunner.js` | Two-phase extraction (capture + transform) |
| `src/features/extraction/plugins/screenshot/` | Screenshot: stabilizer, capture, stitch, persist |
| `src/features/extraction/plugins/html/htmlArtifactPersister.js` | HTML: gzip + content-addressed dedup + crawl_sources SQL |
| `src/features/extraction/plugins/video/videoArtifactPersister.js` | Video: copy + source_videos SQL |
| `src/pipeline/runProduct.js` | Main orchestrator (~304 LOC) |
| `src/pipeline/checkpoint/buildCrawlCheckpoint.js` | run.json builder (crawl results + bridge telemetry) |
| `src/pipeline/checkpoint/buildProductCheckpoint.js` | product.json builder (identity + accumulated sources) |
| `tools/crawl-probe.mjs` | Standalone test harness: baseline vs suite comparison |
