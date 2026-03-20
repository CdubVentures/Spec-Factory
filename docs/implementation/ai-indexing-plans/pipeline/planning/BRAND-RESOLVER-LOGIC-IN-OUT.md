# Brand Resolver Logic In And Out

Validated against live code on 2026-03-19.

## What this stage is

Brand Resolver is the Stage 02 cache-first brand-domain lookup. In the canonical orchestrator it runs after NeedSet so the NeedSet worker appears first in the GUI, then it feeds brand-aware Search Profile and later triage.

Primary owners:

- `src/features/indexing/discovery/stages/brandResolver.js`
- `src/features/indexing/discovery/brandResolver.js`
- `src/features/indexing/discovery/discoveryLlmAdapters.js`
- orchestration callers:
  - `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`
  - `src/features/indexing/discovery/searchDiscovery.js` (compatibility path)

## Schema files in this folder

- `02-brand-resolver-input.json`
- `02-brand-resolver-output.json`

## Inputs in

`resolveBrandDomain()` receives:

- `brand`
- `category`
- `config`
- optional `callLlmFn`
- optional `storage`

`runBrandResolver()` wraps it with:

- `job`
- `categoryConfig`
- `logger`

`discoverCandidateSources()` only calls the resolver when no precomputed `brandResolution` was passed in.

## Live logic

The resolver path is:

1. Trim `brand` and `category`.
2. If `brand` is empty, return the empty object immediately.
3. If `storage.getBrandDomain()` exists, try cache first.
4. On cache hit:
   - parse cached aliases
   - return cached `official_domain`, `support_domain`, aliases
   - use cached confidence or fallback `0.8`
   - return empty `reasoning`
5. If there is no cache hit and no `callLlmFn`, return the empty object.
6. If `callLlmFn` exists, call the routed adapter created by `createBrandResolverCallLlm()`.
7. Normalize the LLM result:
   - lowercase `official_domain`
   - lowercase aliases
   - lowercase `support_domain`
   - string-array `reasoning`
8. If `storage.upsertBrandDomain()` exists, persist the normalized row back to cache.
9. On any LLM error, return the same empty object instead of failing discovery.

`runBrandResolver()` then:

1. creates `callLlmFn` only when `hasLlmRouteApiKey(config, { role: "triage" })` is true
2. emits `brand_resolved` status telemetry at the caller level
3. optionally auto-promotes the resolved official domain into `categoryConfig.sourceHostMap`, `sourceHosts`, `approvedRootDomains`, and `sourceRegistry`

## Important invariants

- Canonical stage order is NeedSet first, Brand Resolver second.
- Cache always wins over LLM.
- Missing brand always returns the empty object.
- Missing route/API key never throws; it just returns the empty object.
- Resolver confidence is not model-derived in the current implementation. Routed success stores `0.8`; cache hits reuse `cached.confidence || 0.8`.
- Brand Resolver does not feed Stage 01 NeedSet or Schema 4 directly anymore. Its main runtime consumers are Search Profile, Query Journey artifacts, and SERP triage context.

## Outputs out

The resolver returns this shape:

- `officialDomain`
- `aliases`
- `supportDomain`
- `confidence`
- `reasoning`

The empty return shape is:

- `officialDomain: ""`
- `aliases: []`
- `supportDomain: ""`
- `confidence: 0`
- `reasoning: []`

Caller-added status metadata is not part of the resolver return:

- `resolved`
- `resolved_empty`
- `skipped`
- `failed`

`runBrandResolver()` returns:

- `brandResolution`
- `promotedHosts`

## Side effects and persistence

- reads cache through `storage.getBrandDomain()`
- writes cache through `storage.upsertBrandDomain()`
- emits `brand_resolved` runtime telemetry at the caller level
- can trigger manufacturer auto-promotion in both the canonical stage wrapper and the compatibility `discoverCandidateSources()` path

## What it feeds next

Brand Resolver feeds:

- Stage 03 Search Profile via `brandResolution`
- optional Effective Host Plan building via brand host hints
- planned/executed `search_profile.brand_resolution`
- Stage 07 SERP triage context and selector input

There is still no dedicated `brand_resolver.json` artifact in the live runtime.
