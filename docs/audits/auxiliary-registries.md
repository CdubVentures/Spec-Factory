# Auxiliary Registries Propagation Audit

Date: 2026-04-27
Worst severity: **CRITICAL** — Brand mutations bypass the data-change event system; brand-impact / catalog / review caches never invalidate.

## Registry coverage

| Registry | Source | Mutation site | Pattern | Wired? |
|---|---|---|---|---|
| Brands | `BrandManager.tsx:228–321` | 5× raw `useMutation` + manual `invalidate()` | bypasses `useDataChangeMutation` | **No** |
| Color | `ColorRegistryPage.tsx:25–38` | `useDataChangeMutation` | event `color-{add,update,delete}` | ✓ |
| Unit | `unitRegistryQueries.ts:14–30` | raw `useMutation` + manual invalidate | isolated surface, acceptable | (n/a) |
| Components DB | (read-only in UI) | – | refreshed via `studio` / `component` domain events | ✓ |
| PIF summary | (read-only in UI) | – | lazy + 30 s `staleTime` + WS data-change | ✓ |

## Identified gaps

### G1. Brand mutations bypass the event registry — **CRITICAL**
**File:** `tools/gui-react/src/features/studio/components/BrandManager.tsx:225, 228–321`
Mutations do `queryClient.invalidateQueries({ queryKey: ['brands'] })` plus `invalidateFieldRulesQueries(...)`, but the contract for the `brand` domain (in `eventRegistry.js:57–66`) lists:

```
['brands'],
['brand-impact'],
['brands', :cat],
['catalog', :cat],
['catalog-products', :cat],
['catalog-review', :cat],
['reviewProductsIndex', :cat],
['product', :cat],
```

Only `['brands']` is actually invalidated by the manual call. Result: rename/delete a brand → brand-impact, catalog rows, review index all stay stale until next page load.

**Reproducer:** open BrandManager → analyse brand A → rename brand A → analyse brand B → impact for B is fresh, but jumping back to A still shows pre-rename impact (cached).

**Fix shape:** convert the 5 mutations to `useDataChangeMutation` with `event: 'brand-add' | 'brand-update' | 'brand-delete' | 'brand-bulk-add'`, and delete the local `invalidate()` helper. The event system already maps these.

### G2. Unit registry mutations have no event entry — LOW
**File:** `tools/gui-react/src/pages/unit-registry/unitRegistryQueries.ts:14–30`
Manual `invalidateQueries(['unit-registry'])` only. Acceptable today because units are an isolated UI surface (only `/units` reads them). If units ever get embedded in Review hints or Component dropdowns this becomes critical.

**Fix shape:** add `'unit-upserted' / 'unit-deleted'` to `EVENT_REGISTRY` mapped to a `units` domain when (and only when) cross-feature consumption is added.

### G3. Component DB and PIF summaries are read-only and clean — INFO
No mutation paths. CEF / component-review writes go through SpecDb; events from `component`/`studio` domains invalidate `['studio-component-db', cat]` correctly. Lazy + 30 s + WS pattern keeps PIF previews fresh.

(Note overlap with `drawer-modal-freshness.md` G2 — the 30 s `staleTime` on PIF summary still has the closed→open re-render gap; that fix lives there.)

## Confirmed-good patterns

- Color registry: golden `useDataChangeMutation` example. New registries should mirror it.
- Component DB invalidation via `component` and `studio` domain templates.
- PIF/CEF previews: lazy query + WS data-change refresh of open popovers.
- Centralized event → domain → query-key resolution in `invalidationResolver.js`.

## Recommended fix order

1. **G1** — migrate BrandManager to `useDataChangeMutation`. ~30 min, high impact.
2. **G2** — defer until units leave their isolated surface.
3. Add a lint rule that flags `queryClient.invalidateQueries({ queryKey: ['brands' | 'colors' | 'unit-registry'] })` outside `useDataChangeMutation` (catches future regressions).

## Compliance scorecard

| Registry | Event-registry coverage | Domain mapping | Cross-consumer invalidation |
|---|---|---|---|
| Brand | ✓ defined | ✓ defined | ✗ mutation site bypasses contract |
| Color | ✓ | ✓ | ✓ |
| Unit | ✗ (acceptable) | ✗ (acceptable) | ✓ within self-scope |
| Component DB | ✓ | ✓ | ✓ |
| PIF summary | (no domain — driven by finder events) | ✓ | ✓ |
