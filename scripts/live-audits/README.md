# Live Audits

Manual diagnostic scripts that launch real Playwright browsers against live websites.
These are **not** part of the automated test suite (`node --test`) — run them on-demand.

## Scripts

| Script | What it does | Runtime |
|--------|-------------|---------|
| `50-site-audit.js` | Tests cookie consent + overlay dismissal + DOM expansion across 50 retailer, review, and manufacturer sites | ~4 min |
| `cookie-audit.js` | Audits cookie banner detection and dismissal across ~15 domains from a recent crawl run | ~1.5 min |
| `dom-expansion-live.js` | Tests the DOM expansion plugin (click-to-expand, navigation guard, budget management) on real pages | ~3 min |
| `full-suite-live.js` | End-to-end proof of the full plugin orchestrator: CSS suppression, overlay dismissal, MutationObserver, scroll-lock reset | ~1.5 min |
| `overlay-dismissal-live.js` | Tests each overlay dismissal layer independently (CSS suppression, heuristic DOM scan, scroll-lock reset) then the combined pipeline | ~3 min |

## When to run

- After modifying crawl plugins (`overlayDismissalPlugin`, `domExpansionPlugin`, cookie selectors)
- When adding a new source domain to verify it works before adding to `sources.json`
- When debugging a site-specific crawl failure

## Usage

```bash
node scripts/live-audits/50-site-audit.js
node scripts/live-audits/cookie-audit.js
node scripts/live-audits/dom-expansion-live.js
node scripts/live-audits/full-suite-live.js
node scripts/live-audits/overlay-dismissal-live.js
```

Requires Playwright (`npx playwright install chromium` if browsers aren't installed).
