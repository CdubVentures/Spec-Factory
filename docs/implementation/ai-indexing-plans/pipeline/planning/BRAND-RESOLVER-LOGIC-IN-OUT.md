# Brand Resolver Logic In And Out

Validated against live code on 2026-03-22. Updated 2026-03-22 post-audit (B3+B4 fixes).

## What this stage is

Brand Resolver is Stage 02 of the prefetch pipeline -- a cache-first brand-domain lookup. In the canonical orchestrator it runs IN PARALLEL with NeedSet (Stage 01) via `Promise.all` -- neither stage depends on the other's output. After both complete, the orchestrator applies brand promotions to `categoryConfig` and the pipeline converges at Stage 03 (Search Profile). See `03-pipeline-context.json` for the full accumulated state at convergence.

Primary owners:

- `src/features/indexing/discovery/stages/brandResolver.js` (stage wrapper)
- `src/features/indexing/discovery/brandResolver.js` (core resolution logic)
- `src/features/indexing/discovery/discoveryLlmAdapters.js` (LLM adapter factory)
- orchestration caller (owns promotion logic inline):
  - `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`

## Schema files in this folder

- `02-brand-resolver-input.json`
- `02-brand-resolver-output.json`

## Registry settings

No brand-resolver-specific registry settings exist. Confidence comes from the LLM response (not a registry default). Crawl config values (`rate_limit_ms: 2000`, `timeout_ms: 12000`) are hardcoded inline in the orchestrator pending the fetch/extraction redesign which will Zod-enforce crawl config.

Note: `manufacturerAutoPromote` is retired (deprecated, defaultsOnly, always true).

## Inputs in

`resolveBrandDomain()` receives:

- `brand` -- string
- `category` -- string
- `config` -- object, consumed for LLM routing (`hasLlmRouteApiKey`, `llmTimeoutMs`)
- `callLlmFn` -- function or null
- `storage` -- object or null
- `logger` -- object or null, used for LLM error logging (`brand_resolver_llm_error`)

`runBrandResolver()` (stage wrapper) receives:

- `job` -- extracts brand from `job.brand` or `job.identityLock.brand`
- `category` -- string
- `config` -- object
- `storage` -- object or null
- `logger` -- object or null, passed through to `resolveBrandDomainFn`
- `categoryConfig` -- object (read-only in the stage; sources data read for promotion)
- `resolveBrandDomainFn` -- DI seam, defaults to `resolveBrandDomain`

## Storage contract (B7 JSDoc)

Defined as `BrandDomainRow` typedef in `brandResolver.js`:

```
{ brand, category, official_domain, aliases (JSON string or array), support_domain, confidence (0-1) }
```

- Read: `storage.getBrandDomain(brand, category)`
- Write: `storage.upsertBrandDomain({ brand, category, official_domain, aliases, support_domain, confidence })`

## Live logic

The resolver path in `resolveBrandDomain()`:

1. Trim `brand` and `category`.
2. If `brand` is empty, return the empty object (confidence `null`).
3. If `storage.getBrandDomain()` exists, try cache first.
4. On cache hit:
   - parse cached aliases (JSON string or array via `parseAliases()`)
   - return cached `official_domain`, `support_domain`, aliases
   - confidence: `parseConfidence(cached.confidence)` (stored value, clamped 0-1, null if missing)
   - return empty `reasoning`
5. If there is no cache hit and no `callLlmFn`, return the empty object.
6. If `callLlmFn` exists, call the routed adapter created by `createBrandResolverCallLlm({ callRoutedLlmFn, config, logger })`.
7. Normalize the LLM result:
   - lowercase `official_domain`
   - lowercase aliases
   - lowercase `support_domain`
   - string-array `reasoning`
8. Set confidence: `officialDomain ? parseConfidence(result?.confidence) : null` -- LLM-provided, not registry-driven.
9. If `storage.upsertBrandDomain()` exists, persist the normalized row back to cache.
10. On any LLM error (B5 fix): log `brand_resolver_llm_error` via `logger.warn()` with brand, category, error message, then return the empty object.

## Confidence tiering

Confidence is LLM-derived via `parseConfidence()` which clamps to 0-1 (values >1 are divided by 100):

1. **Cache hit**: `parseConfidence(cached.confidence)` -- stored value, null if missing
2. **LLM success with domain**: `parseConfidence(result?.confidence)` -- LLM-provided
3. **LLM success without domain**: `null` (no resolution = no confidence)
4. **Empty brand / no callLlmFn / LLM error**: `null`

## Stage wrapper behavior

`runBrandResolver()` then:

1. Creates `callLlmFn` only when `hasLlmRouteApiKey(config, { role: "triage" })` is true.
2. Passes `logger` through to `resolveBrandDomainFn` (enables LLM error logging).
3. Emits `brand_resolved` event via `logger.info()` with status telemetry. The `candidates` field is no longer emitted.
4. Returns `{ brandResolution }`.

## Orchestrator-owned promotion (no categoryConfig mutation in stage)

The stage returns only `{ brandResolution }`. The orchestrator (`runDiscoverySeedPlan`) applies brand promotion inline after the stage completes:

1. Checks `brand.brandResolution?.officialDomain`.
2. Calls `ensureCategorySourceLookups(categoryConfig)`.
3. Normalizes the official domain and builds a manufacturer host entry inline with `tierName: 'manufacturer'`, `sourceId: 'brand_<host>'`, crawl defaults, and `fieldCoverage: null`.
4. Adds the entry to `categoryConfig.sourceHosts` and `categoryConfig.sourceHostMap` (skipping duplicates).
5. Updates `categoryConfig.approvedRootDomains` with `extractRootDomain(host)`.

This ensures all downstream stages see the promoted brand host consistently because the orchestrator owns the mutation.

## Promotion logic (orchestrator inline)

The orchestrator (`runDiscoverySeedPlan.js`) applies brand promotion inline after the stage returns. There is no separate promotion function -- the logic lives directly in the orchestrator:

- Checks `brand.brandResolution?.officialDomain`.
- Normalizes the official domain via `normalizeHost()`.
- Skips if the host is already in `categoryConfig.sourceHostMap`.
- Builds a host entry inline:
  - `host`: normalized official domain
  - `tierName`: `'manufacturer'`
  - `sourceId`: `'brand_' + normalized_host` (deterministic)
  - `displayName`: `'{officialDomain} Official'`
  - `crawlConfig`: `{ method: 'http', rate_limit_ms: 2000, timeout_ms: 12000, robots_txt_compliant: true }`
  - `fieldCoverage`: `null`
  - `robotsTxtCompliant`: `true`
  - `baseUrl`: `'https://{host}'`
- Pushes entry to `categoryConfig.sourceHosts` and sets in `sourceHostMap`.
- Adds root domain to `categoryConfig.approvedRootDomains`.

## Outputs out

`resolveBrandDomain()` returns:

- `officialDomain` -- string
- `aliases` -- string[]
- `supportDomain` -- string
- `confidence` -- number (0-1, LLM-derived via `parseConfidence()`) or null
- `reasoning` -- string[]

Empty return shape: `{ officialDomain: "", aliases: [], supportDomain: "", confidence: null, reasoning: [] }`

`runBrandResolver()` returns `{ brandResolution }`:

- `brandResolution` -- object or null (the `resolveBrandDomain()` result)
- The orchestrator handles promotion inline from `brandResolution.officialDomain` -- the stage itself does not return promotion data.

Caller-added status metadata (not part of the resolver return):

- `resolved`
- `resolved_empty`
- `skipped`
- `failed`

## Side effects and persistence

- Reads cache through `storage.getBrandDomain()`
- Writes cache through `storage.upsertBrandDomain()`
- Emits `brand_resolved` event via `logger.info()` at the stage wrapper level
- Logs `brand_resolver_llm_error` via `logger.warn()` on LLM failures (B5 fix)

## What it feeds next

Brand Resolver feeds:

- Stage 03 Search Profile via `brandResolution`
- Optional Effective Host Plan building via brand host hints
- Planned/executed `search_profile.brand_resolution`
- Stage 05 Query Journey via `brandResolution`
- Stage 07 Result Processing via `brandResolution`

There is still no dedicated `brand_resolver.json` artifact in the live runtime.
