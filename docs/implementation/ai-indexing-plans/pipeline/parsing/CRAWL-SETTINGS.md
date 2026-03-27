# Crawl Pipeline Settings

> Settings that control the crawl pipeline behavior. All from `src/shared/settingsRegistry.js`.

## Concurrency & Scheduling

| Key | Default | Range | What it controls |
|-----|---------|-------|-----------------|
| `crawlSessionCount` | 4 | 1–20 | Number of concurrent browser pages (maxConcurrency) |
| `fetchConcurrency` | 4 | 1–64 | Legacy alias (crawlSessionCount preferred) |
| `perHostMinDelayMs` | 1500 | 0–120000 | Minimum delay between requests to same host |
| `fetchPerHostConcurrencyCap` | 1 | 1–64 | Max concurrent requests to same host |
| `maxRunSeconds` | varies | — | Global time budget for entire run |
| `fetchBudgetMs` | 45000 | 5000–300000 | Per-page time budget |
| `fetchDrainTimeoutMs` | 120000 | 10000–600000 | Hard timeout on batch drain |

## Browser Behavior

| Key | Default | What it controls |
|-----|---------|-----------------|
| `crawleeHeadless` | true | Run browser headless (false = visible for debugging) |
| `crawleeRequestHandlerTimeoutSecs` | 75 | Crawlee per-request timeout |
| `pageGotoTimeoutMs` | 12000 | Navigation timeout per page |
| `pageNetworkIdleTimeoutMs` | 2000 | Wait for network idle after navigation |
| `postLoadWaitMs` | (per-host) | Additional wait after page load |

## Auto-Scroll (lazy content)

| Key | Default | What it controls |
|-----|---------|-----------------|
| `autoScrollEnabled` | true | Enable/disable scroll passes |
| `autoScrollPasses` | 2 | Number of scroll-to-bottom passes |
| `autoScrollDelayMs` | 1200 | Delay between scroll passes |

## Screenshots

| Key | Default | What it controls |
|-----|---------|-----------------|
| `capturePageScreenshotEnabled` | true | Enable/disable screenshots |
| `capturePageScreenshotFormat` | jpeg | Format: jpeg or png |
| `capturePageScreenshotQuality` | 50 | JPEG quality (1–100) |
| `capturePageScreenshotMaxBytes` | 5000000 | Max screenshot size (reject if larger) |
| `capturePageScreenshotSelectors` | `table,[data-spec-table],...` | CSS selectors for targeted crops |

## Retry & Proxy

| Key | Default | What it controls |
|-----|---------|-----------------|
| `crawleeMaxRequestRetries` | 1 (code default) | Native retries with session rotation. Only retryable errors (blocks) get retried. Timeouts, DNS, downloads set `request.noRetry` and fail fast. |
| `crawleeProxyUrlsJson` | `""` | JSON array of proxy URLs for the proxy retry pass. Empty = no proxy retry. |
| `robotsTxtCompliant` | true | Respect robots.txt (451 → `robots_blocked`, no retry) |

**Non-retryable errors** (fail immediately, no retry):
`Navigation timed out`, `Download is starting`, `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_CONNECTION_RESET`, `ERR_TUNNEL_CONNECTION_FAILED`, `robots_blocked`.

**Retryable timeouts**: `requestHandler timed out` IS retried — the page may have loaded (CDP screencast proves it) but post-navigation processing (extraction, auto-scroll, hooks) was slow. Retry with fresh session may succeed faster.

**Retryable errors** (1 native retry with session rotation, then proxy retry):
403, 429, captcha, cloudflare, access denied, empty response, server error.

**Timing budget**: worst case per URL = 30s direct + 30s proxy = ~60s. Blocked URLs detected in ~2s get retried within seconds.

## Per-Host Overrides

`dynamicFetchPolicyMapJson` — JSON string keyed by hostname. Each entry can override:
`perHostMinDelayMs`, `pageGotoTimeoutMs`, `pageNetworkIdleTimeoutMs`, `postLoadWaitMs`,
`autoScrollEnabled`, `autoScrollPasses`, `autoScrollDelayMs`, `retryBudget`, `retryBackoffMs`.

Hostname matching uses suffix-walk (e.g. `example.com` matches `shop.example.com`).

## Frontier Cooldowns

| Key | Default | What it controls |
|-----|---------|-----------------|
| `frontierCooldown404Seconds` | 259200 (3d) | Cooldown after first 404 |
| `frontierCooldown404RepeatSeconds` | 1209600 (14d) | Cooldown after 3rd+ 404 |
| `frontierCooldown410Seconds` | 7776000 (90d) | Cooldown after 410 Gone |
| `frontierCooldown403BaseSeconds` | 1800 | Base cooldown for 403 (exponential) |
| `frontierCooldown429BaseSeconds` | 600 | Base cooldown for 429 (exponential) |
| `frontierCooldownTimeoutSeconds` | 21600 (6h) | Cooldown after timeout |
| `frontierBlockedDomainThreshold` | 1 | Consecutive blocks before domain block |
