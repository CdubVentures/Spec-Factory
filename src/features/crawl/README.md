## Purpose

Crawlee-based page crawler with a plugin lifecycle. Opens pages, bypasses blocks, and records results to the frontier DB. Parsing tools are added as drop-in plugins. Screenshots are handled by the extraction plugin system.

## Public API (The Contract)

Exported from `index.js`:

- `createCrawlSession({ settings, plugins, logger, _crawlerFactory })` — boots a persistent PlaywrightCrawler. Returns `{ start(), processUrl(url), shutdown() }`.
- `crawlPage({ url, settings, frontierDb, session, logger })` — crawls one URL. Returns `{ success, url, finalUrl, status, blocked, blockReason, screenshots, html, fetchDurationMs, attempts, bypassUsed }`. Always records to frontier DB.
- `createPluginRunner({ plugins, logger })` — runs plugins through named lifecycle hooks. Returns `{ runHook(hookName, context) }`.
- `classifyBlockStatus({ status, html })` — pure block detection. Returns `{ blocked, blockReason }`.

### Plugin Interface

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

### Built-in Plugins

- `plugins/stealthPlugin.js` — hides webdriver, injects stealth fingerprint
- `plugins/cookieConsentPlugin.js` — auto-dismisses cookie/consent banners via autoconsent + fallback selectors
- `plugins/autoScrollPlugin.js` — scrolls to trigger lazy-loaded content
- `plugins/domExpansionPlugin.js` — clicks expand/show-more buttons to reveal collapsed sections
- `plugins/cssOverridePlugin.js` — force-reveals hidden elements via CSS injection

## Dependencies

- **Allowed:** `src/fetcher/stealthProfile.js`, `src/shared/settingsAccessor.js`, `src/research/frontierDb.js`
- **Forbidden:** `src/features/indexing/` (no extraction, consensus, or finalization imports)

## Domain Invariants

1. ONE persistent browser per CrawlSession — never spin up per-URL crawlers.
2. Plugins run sequentially in registration order — first plugin's mutations visible to second.
3. Plugin errors are caught and logged — never crash the crawl loop.
4. Frontier DB is always updated (success or failure) — never skip recording.
5. `classifyBlockStatus` is a pure function — no side effects, no network calls.
