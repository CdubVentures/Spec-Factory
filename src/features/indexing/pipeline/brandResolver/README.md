# Pipeline — Brand Resolver

## Purpose

Resolves brand official domain via cache-first lookup with optional LLM fallback. Runs in parallel with NeedSet as the second entry point.

## Public API (The Contract)

Exports from `index.js`:

- `runBrandResolver(ctx)` — orchestrates brand domain resolution (cache then LLM)
- `resolveBrandDomain(brand, options)` — core resolution logic
- `createBrandResolverCallLlm(options)` — factory for the LLM fallback callable

## Dependencies

- **Allowed:** `pipeline/shared/`, `src/core/llm/`
- **Forbidden:** Other pipeline phase folders

## Domain Invariants

- Brand Resolver returns pure data — orchestrator owns applying promotions to context.
- Must never depend on NeedSet output (runs in parallel).
- Cache-first: LLM fallback fires only when cache misses.
- Crawl config for brand promotions is a static shape (`{ method: 'http', robots_txt_compliant: true }`) — no registry knobs.
