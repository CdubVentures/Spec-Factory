## Purpose

Sequential extraction plugin system that runs per-URL during the crawl phase. Fetch tools prepare the page (sequential), then extraction plugins fire sequentially to harvest data. URL is not complete until all extraction plugins finish.

## Public API (The Contract)

Exports from `index.js`:
- `createExtractionRunner({ plugins, logger })` — creates a sequential runner that calls `onExtract` on each plugin via for-of await
- `resolveExtractionPlugins(names, { logger })` — resolves plugin names to plugin objects from the registry
- `EXTRACTION_PLUGIN_REGISTRY` — frozen map of registered extraction plugins

## Dependencies

- **Allowed:** `src/core/`, `src/shared/`
- **Forbidden:** `src/features/crawl/`, `src/features/indexing/`, other feature internals

## Domain Invariants

- Extraction plugins receive a **frozen context** — no shared mutation across plugins
- Each plugin returns its own isolated result object, keyed by plugin name
- Plugin errors are caught via try/catch per plugin — one crash never affects others
- Plugins MUST NOT modify page state (clicks, navigation) — fetch tools handle interaction
- CrawlSession receives the extraction runner via DI — no direct cross-feature import
- Viewport scrolling for capture purposes (scroll-and-stitch) is permitted — this is viewport manipulation, not content interaction
