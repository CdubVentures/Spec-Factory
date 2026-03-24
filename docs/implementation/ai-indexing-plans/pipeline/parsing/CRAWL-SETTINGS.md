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

## Retry & Bypass

| Key | Default | What it controls |
|-----|---------|-----------------|
| `dynamicFetchRetryBudget` | 1 | Retries per URL before giving up |
| `dynamicFetchRetryBackoffMs` | 2500 | Backoff between retries |
| `robotsTxtCompliant` | true | Respect robots.txt |
| `robotsTxtTimeoutMs` | 6000 | Timeout for robots.txt fetch |

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
