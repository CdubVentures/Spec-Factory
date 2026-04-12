# Crawl Pipeline Settings

> All settings from `src/shared/settingsRegistry.js`. GUI: fetcher category.
> Validated: 2026-03-29.

## Browser & Crawlee (GUI: fetcher → browser)

### Heroes (top-level toggles)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `crawleeHeadless` | bool | `true` | Run browser headless |
| `crawlMaxConcurrentSlots` | int | `8` | Max parallel browser pages (min=max, skips autoscale ramp) |
| `crawleeSameDomainDelaySecs` | int | `2` | Min seconds between requests to same domain |
| `crawleeUseSessionPool` | bool | `true` | Session rotation on blocks (fingerprint + cookie isolation) |
| `crawleeUseFingerprints` | bool | `true` | Generate realistic browser fingerprints |
| `crawleeProxyRetryEnabled` | bool | `false` | Retry blocked URLs through proxy after native retries fail |

### Crawlee Internals (collapsed by default)

| Key | Type | Default | Range | What it controls |
|-----|------|---------|-------|-----------------|
| `crawleeWaitUntil` | enum | `domcontentloaded` | domcontentloaded, load, networkidle, commit | When navigation is complete. `domcontentloaded` = HTML parsed (~1s). `load` = all resources (~30-60s on analytics-heavy sites). |
| `crawleeRequestHandlerTimeoutSecs` | int | `45` | 0–300 | Per-page handler timeout (covers suite loop + page.content + extraction) |
| `crawleeNavigationTimeoutSecs` | int | `20` | 1–120 | Navigation timeout (page.goto) |
| `crawleeMaxRequestRetries` | int | `1` | 0–5 | Native retries with session rotation. We do our own block detection + proxy retry. |
| `crawleeBrowserRetirePageCount` | int | `10` | 1–50 | Retire browser after N pages |
| `crawleeMaxRequestsPerMinute` | int | `0` | 0–1000 | Global RPM cap (0 = unlimited) |
| `crawleeMaxSessionRotations` | int | `2` | 1–50 | Max session swaps before giving up on a URL |
| `crawleeRetryOnBlocked` | bool | `false` | — | Crawlee's built-in 403/429 auto-retry (disabled — we use bypassStrategies.js) |
| `crawleeMaxOpenPagesPerBrowser` | int | `4` | 1–20 | Tabs per browser. Capped at slotCount. Each tab is incognito-isolated. |

### Session Pool (gated by `crawleeUseSessionPool`)

| Key | Type | Default | Range | What it controls |
|-----|------|---------|-------|-----------------|
| `crawleePersistCookiesPerSession` | bool | `true` | — | Carry cookies across requests within a session |
| `crawleeSessionPoolSize` | int | `100` | 10–1000 | Max concurrent session identities |
| `crawleeSessionMaxUsageCount` | int | `50` | 1–500 | Retire session after N requests |
| `crawleeSessionMaxAgeSecs` | int | `3000` | 60–86400 | Retire session after N seconds |

### Proxy (gated by `crawleeProxyRetryEnabled`)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `crawleeProxyMaxRetries` | int | `2` | Max retries on the proxy crawler |
| `crawleeProxyUrlsJson` | string | `""` | JSON array of proxy URLs (secret field) |

## Fetch Global (GUI: fetcher → fetch-global)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `fetchLoadingDelayMs` | int | `0` | Wait after page load before first dismiss round (0 = no delay, waitUntil already confirms loaded) |
| `fetchDismissRounds` | int | `2` | Dismiss→scroll cycles. Suite fires before, between, and after each scroll. |
| `fetchSuiteMode` | enum | `concurrent` | How dismiss plugins execute: concurrent (all at once) or sequential |

## Suppress Suite Plugins

### Stealth (GUI: fetcher → stealth)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `stealthEnabled` | bool | `true` | Hide webdriver detection, patch chrome APIs |

### Cookie Consent (GUI: fetcher → cookie-consent)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `cookieConsentEnabled` | bool | `true` | Auto-dismiss cookie/consent banners |
| `cookieConsentTimeoutMs` | int | `200` | Autoconsent CMP detection timeout (fast-fail) |
| `cookieConsentFallbackSelectors` | string | (30+ selectors) | CSS selectors for manual banner dismissal |
| `cookieConsentSettleMs` | int | `0` | Post-dismiss settle wait (0 = instant evaluate) |

### Overlay Dismissal (GUI: fetcher → overlay-dismissal)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `overlayDismissalEnabled` | bool | `true` | Detect/dismiss newsletter popups, chat widgets, paywalls, age gates |
| `overlayDismissalMode` | enum | `moderate` | moderate: close-click first, then DOM removal. aggressive: direct removal, lower thresholds. |
| `overlayDismissalCloseSelectors` | string | (10+ selectors) | CSS selectors for overlay close buttons |
| `overlayDismissalSettleMs` | int | `0` | Post-dismiss settle wait (0 = instant evaluate) |
| `overlayDismissalZIndexThreshold` | int | `999` | Min z-index for overlay detection |

### DOM Expansion (GUI: fetcher → dom-expansion)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `domExpansionEnabled` | bool | `true` | Click expand/show-more buttons |
| `domExpansionSelectors` | string | `[aria-expanded="false"],...` | CSS selectors for expand triggers |
| `domExpansionMaxClicks` | int | `50` | Max clicks per page |
| `domExpansionSettleMs` | int | `0` | Post-expand settle wait (0 = instant evaluate) |
| `domExpansionBudgetMs` | int | `15000` | Total time budget for expansion |

### CSS Override (GUI: fetcher → css-override)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `cssOverrideEnabled` | bool | `false` | Force-display hidden elements via CSS injection |
| `cssOverrideRemoveFixed` | bool | `false` | Hide fixed/sticky elements |
| `cssOverrideBlockedDomains` | string | `""` | Comma-separated domains to block via page.route (widget/analytics blocking) |

### Auto Scroll (GUI: fetcher → auto-scroll)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `autoScrollEnabled` | bool | `true` | Scroll pages to trigger lazy-loaded content |
| `autoScrollPasses` | int | `2` | Scroll-to-bottom passes |
| `autoScrollDelayMs` | int | `0` | Delay between passes |
| `autoScrollMaxPixels` | int | `30000` | Hard pixel cap — stop scrolling regardless of page height (prevents infinite-scroll traps) |
| `autoScrollStrategy` | enum | `incremental` | jump (instant scrollTo) or incremental (wheel events for IntersectionObserver) |

## Observability (GUI: fetcher → observability)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `runtimeScreencastEnabled` | bool | `true` | Live CDP screencast feed to GUI |

## Video & Screenshots (GUI: extraction)

| Key | Type | Default | What it controls |
|-----|------|---------|-----------------|
| `crawlVideoRecordingEnabled` | bool | `true` | Record browser video per page |
| `crawlVideoRecordingSize` | string | `1280x720` | Video resolution |
| `capturePageScreenshotEnabled` | bool | `true` | Screenshot capture during extraction |
| `capturePageScreenshotFormat` | string | `jpeg` | Image format (jpeg or png) |
| `capturePageScreenshotQuality` | int | `75` | JPEG quality (1–100) |
| `capturePageScreenshotMaxBytes` | int | `5000000` | Max file size per screenshot (~5 MB) |
| `capturePageScreenshotSelectors` | string | `table,[data-spec-table],...` | CSS selectors for spec table detection |
| `capturePageScreenshotMaxSelectors` | int | `12` | Max matching selectors to screenshot per page |
| `capturePageScreenshotStabilizeEnabled` | bool | `true` | Wait for fonts/images/paint before screenshot |
| `capturePageScreenshotStabilizeTimeoutMs` | int | `1500` | Stabilization timeout |
| `capturePageScreenshotStitchEnabled` | bool | `true` | Stitch long pages exceeding 16,384px texture limit |

## Non-retryable Errors (fail fast)

`Navigation timed out`, `Download is starting`, `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_CONNECTION_RESET`, `ERR_TUNNEL_CONNECTION_FAILED`, `robots_blocked` (451).

Also non-retryable:
- `requestHandler timed out` with `__capturedPage` already stashed → page loaded but plugins were slow — retrying wastes another full timeout.
- `blocked:*` errors (403, 429, captcha, cloudflare, access_denied, etc.) → session rotation can't fix IP-based blocks. Proxy retry in `runFetchPlan` handles persistent blocks.
- `requestHandler timed out` without `__capturedPage` at `retryCount >= 1` → page didn't load on first try either, server is genuinely slow/dead.

Retryable errors retire the session before retry so the attempt uses a fresh fingerprint + cookies.

## Testing

`tools/crawl-probe.mjs` — standalone test harness. Runs baseline (raw Crawlee, no plugins) vs full suite on same URLs. Generates HTML comparison reports in `.workspace/crawl-probe-reports/`.

```bash
# Direct URLs
node tools/crawl-probe.mjs https://lamzu.com/products/lamzu-maya-x --verbose

# Product search → crawl
node tools/crawl-probe.mjs --product "Lamzu Maya X" --max-urls 15 --slots 4

# Non-headless (watch the browser)
node tools/crawl-probe.mjs --product "Razer Viper V3 Pro" --headless false
```
