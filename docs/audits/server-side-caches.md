# Server-Side In-Memory Cache Audit

Date: 2026-04-27
Worst severity: **MEDIUM** — `field-key-order` save invalidates `sessionCache` but not `reviewLayoutByCategory`.

## Cache inventory

| Cache | File | Key | Loader | Invalidator |
|---|---|---|---|---|
| `sessionCache` | `src/field-rules/sessionCache.js` | category | SQL `compiled_rules` + `field_studio_map` + `field_key_order` | `invalidateSessionCache(category)` |
| `reviewLayoutByCategory` | `src/app/api/specDbRuntime.js:56` | category | (built lazily, see G2) | `.delete(category)` |
| `fieldRulesEngine.cache` + `signatureCache` | `src/field-rules/loader.js` | `helperRoot::category` | JSON + component DB files | `invalidateFieldRulesCache(category)` |
| `specDbCache` | `src/app/api/specDbRuntime.js:54` | category | SpecDb factory | `.delete(category)` |
| `categoryConfig` | `src/categories/loader.js:21` | `helperRoot::category` | category JSON | (no mutation today) |

## Mutator → invalidation map

| Route | sessionCache | reviewLayoutByCategory | fieldRulesEngine |
|---|---|---|---|
| `PUT /studio/{cat}/field-studio-map` (`studioRoutes.js:269–359`) | ✓ | ✓ | – |
| `PUT /studio/{cat}/field-key-order` (`studioRoutes.js:362–394`) | ✓ | **✗ MISSING** | – |
| `POST /studio/{cat}/invalidate-cache` (`studioRoutes.js:443–449`) | ✓ | ✓ | ✓ |
| Compile completion (`compileProcessCompletion.js:18–143`) | ✓ (×2) | – | ✓ |
| Component / enum mutations | – | – | ✗ never called |

## Identified gaps

### G1. `reviewLayoutByCategory` not invalidated on field-key-order save — MEDIUM
**File:** `src/features/studio/api/studioRoutes.js:362–394`
The handler invalidates `sessionCache` but skips `reviewLayoutByCategory`. The emitted `field-key-order-saved` event names `'review-layout'` in its domains, so the contract claims it's affected.

**Fix shape:** add `reviewLayoutByCategory.delete(category)` immediately after the existing `invalidateSessionCache(category)` call.

### G2. `reviewLayoutByCategory` may be unused — LOW
**File:** `src/app/api/specDbRuntime.js:56`
The Map is created and `.delete()`'d but no `.get()`/`.set()` calls were found. Likely either dead code or consumed by a path not yet inspected.

**Fix shape:** search for review-layout serialization. If genuinely unused, delete per Subtractive Engineering Mandate.

### G3. Component / enum mutations don't call `invalidateFieldRulesCache` — LOW
**Files:** `src/features/review/api/componentMutationRoutes.js`, `enumMutationRoutes.js`
The function is plumbed through the route context (line 69 of `reviewRoutes.js`) but never invoked. Risk is low because field rules don't depend on the rows these routes mutate, but the dead plumbing invites future bugs.

**Fix shape:** either drop the plumbing or add a one-line WHY comment explaining it's intentionally unused.

### G4. Compile completion doesn't invalidate `reviewLayoutByCategory` — LOW
**File:** `src/app/api/lifecycle/compileProcessCompletion.js:18–143`
After compile, `sessionCache` and `fieldRulesEngine` are invalidated but not the review layout cache. If `reviewLayoutByCategory` is actually used, its consumers see stale layouts after a compile.

**Fix shape:** if G2 confirms the cache is used, add `.delete(category)` here too.

### G5. `categoryConfig` cache never invalidated — INFO
**File:** `src/categories/loader.js:21`
Loaded once on demand; no observed mutations affect it. Safe today.

**Fix shape:** none unless a route ever mutates the underlying schema files at runtime.

## Confirmed-good patterns

- `sessionCache.loadAndMerge()` reads SQL only (no JSON re-parse), backed by SSOT.
- `fieldRulesEngine.signatureCache` uses 1 s mtime gating to avoid invalidating on every load.
- `field_studio_map` PUT is fully wired: SQL + JSON + sessionCache + reviewLayoutByCategory + emitDataChange.
- Compile completion invalidates the heavy caches and reseeds compiled rules.

## Recommended fix order

1. **G1** — one-line fix in `studioRoutes.js:382`. Highest risk-to-effort ratio.
2. **G2** — confirm whether `reviewLayoutByCategory` is alive; delete or wire it.
3. **G4** — pairs with G2; add to compile completion if cache is alive.
4. **G3** — clean up dead plumbing or annotate.
