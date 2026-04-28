# Settings / Config → Live UI Propagation Audit

Date: 2026-04-27
Worst severity: **HIGH** — `module-settings-updated` is fired but maps to no downstream queries; PIF carousel + eval UI + finder-preview don't react to knob changes.

## Authority layer (SSOT)

| Authority | Hook / file | Server endpoint | Propagation channel |
|---|---|---|---|
| Runtime settings | `runtimeSettingsAuthorityHooks.ts` | `GET/PUT /runtime-settings` | `publishSettingsPropagation({ domain: 'runtime' })` |
| Module settings (per-category, per-module) | `moduleSettingsAuthority.ts` | `GET/PUT /module-settings/:cat/:moduleId` | `data-change` event `'module-settings-updated'` |
| LLM policy (composite, flat keys) | `useLlmPolicyAuthority.ts` | `PUT /llm-policy` | `publishSettingsPropagation({ domain: 'runtime' })` (post-save only) |
| UI flags | `uiSettingsAuthority.ts` | – (client-side) | `publishSettingsPropagation({ domain: 'ui' })` |
| Source strategy (per-category) | `sourceStrategyAuthority.ts` | `PUT /source-strategy/:cat` | `publishSettingsPropagation({ domain: 'source-strategy', category })` |

Two propagation channels exist:
- **`publishSettingsPropagation`** → localStorage broadcast → consumed by `settingsAuthority.ts` to refetch the editor's own query. **Does not invalidate downstream consumers.**
- **`data-change`** → WS broadcast → routed by `invalidationResolver` to query templates.

## Knob → consumer matrix

| Knob | Source authority | Consumers | Propagation working? |
|---|---|---|---|
| `alwaysSoloRun` | runtime | KF prompt preview ✓, Command Console KF chip ✓ | Yes (Zustand-derived + staleTime: 0 preview) |
| `bundlingSortAxisOrder` | runtime | Prompt preview ✓ | Yes |
| `passengerExclude*` | runtime | Prompt preview ✓ | Yes |
| `publishConfidenceThreshold` | runtime | Review grid ✓, Overview "published" cell ✗ | **Partial** |
| `carouselScoredViews` / `viewBudget` | module | PIF carousel slot resolution ✗, PIF eval UI ✗, finder-preview ✗ | **No** |
| LLM models / roles (per finder) | runtime (flat) | Prompt preview ✓, Command Console pickers ✓ | Yes |
| `kfTierSettings` (4 tier models) | runtime (flat) | Command Console KF chip ✓, KF panel ? | Mostly yes |

## Identified gaps

### G1. `module-settings-updated` is unmapped — **HIGH**
**File:** `tools/gui-react/src/features/data-change/invalidationResolver.*`
Mutation fires the event correctly (`moduleSettingsAuthority.ts:134–147`) but the resolver has no domain mapping → zero downstream invalidation.

Affected consumers (none of them refresh on edit):
- PIF carousel slot resolution (`resolveSlots` reads carousel knobs).
- PIF eval scoring UI in finder panel.
- Finder Settings sidebar preview prompt.

**Fix shape:** map `'module-settings-updated'` to query templates by category + moduleId. Minimum:
```
'module-settings-updated': ['module-settings', 'product-image-finder', 'prompt-preview', 'pif-carousel'],
```
And in `DOMAIN_QUERY_TEMPLATES` define what each of those domains expands to (e.g., `['product-image-finder', cat]`, `['prompt-preview', 'pif', cat]`).

### G2. `publishConfidenceThreshold` doesn't update Overview — MEDIUM
**File:** `tools/gui-react/src/features/review/components/ReviewPage.tsx:189–201`
Threshold edit invalidates `['candidates']` and `['reviewProductsIndex', cat]`, so Review re-filters correctly. Overview's "published" cell reads from the catalog projection, which isn't invalidated. User sees Review say "resolved" while Overview still says "candidate".

**Fix shape:** invalidate `['catalog', cat]` on threshold change too (or fire a `'publish-threshold-changed'` data-change event mapped to `'catalog'` domain).

### G3. LLM policy edits propagate only after save — MEDIUM
**File:** `tools/gui-react/src/features/llm-config/state/useLlmPolicyAuthority.ts:98–111`
Optimistic Zustand update happens immediately, but `publishSettingsPropagation` only fires on save success. Other tabs/windows reading LLM config see stale values for the duration of the round-trip.

**Fix shape:** call `publishSettingsPropagation` optimistically on `updateGroup`, with a rollback on save error.

### G4. Finder Settings sidebar preview doesn't refresh on knob change — MEDIUM
**Files:** `tools/gui-react/src/features/pipeline-settings/components/FinderSettingsRenderer.tsx`, `ModuleSettingsPanel.tsx`
Editing a knob inline saves via the module-settings mutation, but the embedded prompt preview doesn't re-render. User must close/reopen the panel.

**Fix shape:** depends on G1 — once `'module-settings-updated'` invalidates `['prompt-preview', finder, cat]`, this auto-fixes. Alternatively, set `staleTime: 0` on preview queries inside the settings panel (already done elsewhere — `promptPreviewQueries.ts:66`).

### G5. PIF carousel evaluator UI doesn't react to scoring edits — MEDIUM
**File:** `tools/gui-react/src/features/product-image-finder/components/ProductImageFinderPanel.tsx`
`viewBudget`, `carouselScoredViews`, `carouselOptionalViews`, `carouselExtraTarget` edits save the knob but PIF eval display reads cached slot resolutions. Auto-fixed by G1.

### G6. Default `staleTime` on settings queries — LOW
**Files:**
- `moduleSettingsAuthority.ts:108`
- `useLlmPolicyAuthority.ts:51`
- `runtimeSettingsAuthorityHooks.ts:146`

None declare `staleTime`. Defaults to React Query global, which means cache-forever in many cases. Cross-window edits silently desync until a focus refetch.

**Fix shape:** declare `staleTime: 0` (or a small value) on settings reads. Pair with the localStorage propagation that already drives manual refetch.

### G7. No central registry of which-screens-consume-which-knob — LOW
There's `MODULE_SETTINGS_SCOPE_BY_ID` for module → category scope, but no equivalent for module-knob → consumer-screen. Manual audit required (this file).

**Fix shape:** add a `KNOB_CONSUMER_REGISTRY` or annotate each setting in `finderSettingsRegistry.generated.ts` with a `consumers: ['prompt-preview', 'carousel-resolver', ...]` field; codegen this into the invalidation map.

## Confirmed-good patterns

- All finder prompt previews use `staleTime: 0` → instant repaint on next open.
- Zustand-derived selectors (`useKeyDifficultyModelMap`) give Command Console KF chip live updates without query plumbing.
- Settings-authority bootstrap hydration is idempotent and category-scoped.
- Cross-window propagation via `publishSettingsPropagation` works for the editor's own query.
- `useDataChangeMutation` for module settings mutations correctly fires the event (just unmapped).

## Recommended fix order

1. **G1** — map `'module-settings-updated'` to consumer query templates (PIF carousel, PIF panel, prompt-preview per finder). Fixes G4 and G5 transitively. ~15 min.
2. **G2** — invalidate `['catalog', cat]` on threshold change. ~5 min.
3. **G3** — publish settings propagation optimistically in LLM policy authority.
4. **G6** — add `staleTime` declarations to runtime/module/llm-policy queries.
5. **G7** — knob-consumer registry + codegen to keep this audit accurate over time.

## Cross-cutting observation

The two propagation channels (`publishSettingsPropagation` localStorage vs. `data-change` WS event) overlap and are inconsistently used. Long-term, consider unifying:
- Either every settings mutation fires a typed `data-change` event with explicit domains, OR
- Every consumer subscribes to `subscribeSettingsPropagation` and runs its own invalidate.

Right now, mutations split across both contracts and downstream consumers don't reliably hit either one.
