## Purpose

Concurrent extraction plugin system that runs per-URL during the crawl phase. Fetch tools prepare the page (sequential), then extraction plugins fire concurrently to harvest data. URL is not complete until all extraction plugins finish.

## Public API (The Contract)

Exports from `index.js`:
- `createExtractionRunner({ plugins, logger })` — creates a concurrent runner that calls `onExtract` on all plugins via `Promise.allSettled`
- `resolveExtractionPlugins(names, { logger })` — resolves plugin names to plugin objects from the registry
- `EXTRACTION_PLUGIN_REGISTRY` — frozen map of registered extraction plugins

## Dependencies

- **Allowed:** `src/features/crawl/index.js` (public barrel — `captureScreenshots`)
- **Allowed:** `src/core/`, `src/shared/`
- **Forbidden:** `src/features/indexing/`, other feature internals

## Domain Invariants

- Extraction plugins receive a **frozen context** — no shared mutation across concurrent plugins
- Each plugin returns its own isolated result object, keyed by plugin name
- Plugin errors are caught via `Promise.allSettled` — one crash never affects others
- Plugins MUST NOT modify page state (clicks, navigation) — fetch tools handle interaction
- CrawlSession receives the extraction runner via DI — no direct cross-feature import
