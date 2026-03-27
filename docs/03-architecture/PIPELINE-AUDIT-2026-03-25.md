# Pipeline Architecture, Full-Stack Correctness & Debt Audit

**Date:** 2026-03-25
**Scope:** NeedSet -> Brand Resolver -> Search Profile -> Search Planner -> Query Journey -> Search Execution -> SERP Selector -> Domain Classifier -> Crawl -> Extraction
**Files Audited:** 80+ across backend, frontend, API contracts, and documentation
**Method:** Manual line-by-line verification against live source code (agent summaries were cross-checked and corrected)

---

## Agent Error Corrections

The initial automated agent scan produced 8 false findings that were corrected during manual verification:

| Claim | Reality |
|-------|---------|
| `settingsKeyMap.js` is MISSING (broken import) | **EXISTS** at `src/core/config/settingsKeyMap.js`, imports from registry and derives route-get maps |
| `searchLoopMaxNoProgressRounds = 2` is hardcoded | **IN REGISTRY** (line 128, key `searchLoopMaxNoProgressRounds`, default 2) |
| `searchLoopMaxLowQualityRounds = 3` is hardcoded | **IN REGISTRY** (line 129, key `searchLoopMaxLowQualityRounds`, default 3) |
| Cookie consent timeout `5000ms` is hardcoded | **IN REGISTRY** (key `cookieConsentTimeoutMs`), plugin reads `settings.cookieConsentTimeoutMs` |
| DOM expansion max clicks `50` is hardcoded | **IN REGISTRY** (key `domExpansionMaxClicks`), plugin reads `settings.domExpansionMaxClicks` |
| Screenshot max bytes `5_000_000` is hardcoded | **IN REGISTRY** (key `capturePageScreenshotMaxBytes`), code reads `settings.capturePageScreenshotMaxBytes` |
| Screenshot max selectors `12` is hardcoded | **IN REGISTRY** (key `capturePageScreenshotMaxSelectors`), code reads `settings.capturePageScreenshotMaxSelectors` |
| 20 hardcoded magic numbers total | **Actual count: 15** (8 false positives were already registry-backed; 3 additional found in queryFieldRuleGates.js) |

---

## 1. Modular Control & Vertical Slicing

### Grade: B+

Each pipeline phase lives in its own directory under `src/features/indexing/pipeline/<phase>/` with README, entry point, and LLM adapter (if applicable). Crawl and extraction are separate feature boundaries.

| Phase | Dir | README | Tests | LLM | Self-Contained |
|-------|-----|--------|-------|-----|----------------|
| NeedSet | `pipeline/needSet/` | Yes | Yes | `searchPlanBuilderLlmAdapter.js` | Yes |
| Brand Resolver | `pipeline/brandResolver/` | Yes | Yes | `brandResolverLlmAdapter.js` | Yes |
| Search Profile | `pipeline/searchProfile/` | Yes | Yes | N/A (deterministic) | Yes |
| Search Planner | `pipeline/searchPlanner/` | Yes | Yes | `queryPlannerLlmAdapter.js` | Yes |
| Query Journey | `pipeline/queryJourney/` | Yes | Yes | N/A (deterministic) | Yes |
| Search Execution | `pipeline/searchExecution/` | Yes | Yes | N/A | Yes |
| SERP Selector | `pipeline/resultProcessing/` | Yes | Yes | `serpSelectorLlmAdapter.js` | Yes |
| Domain Classifier | `pipeline/domainClassifier/` | Yes | Yes | N/A | Yes |
| Crawl | `features/crawl/` | Implicit | Yes (2483 LOC) | N/A | Yes |
| Extraction | `features/extraction/` | Yes | Yes (222 LOC) | N/A | Yes |

### Issues

**VS-1 (HIGH):** `GROUP_DEFAULTS` in `searchPlanningContext.js:21-33` hardcodes 11 mouse-category-specific group metadata entries. This couples NeedSet to a single category. The code has a `resolveGroupMeta()` fallback chain (fieldGroupsData -> GROUP_DEFAULTS -> GENERIC_FALLBACK), so this is a transitional artifact — but it must be retired once all category contracts populate `fieldGroupsData.groups`.

**VS-2 (MEDIUM):** Search providers are dispatched via if/else chain in `searchProviders.js`, not a plugin registry. Adding a new provider requires modifying the dispatch function.

---

## 2. End-to-End Settings & Wiring Verification

### Grade: A-

**Settings Flow (verified):**
```
settingsRegistry.js (SSOT, 117 entries across 4 registries)
  -> settingsRegistryDerivations.js (derives defaults, clamps, route maps)
    -> settingsKeyMap.js (RUNTIME_SETTINGS_ROUTE_GET)
    -> runtimeSettingsRoutePut.js (RUNTIME_SETTINGS_ROUTE_PUT)
      -> configPostMerge.js (.env + user-settings + runtime overrides)
        -> config object (passed to all phases)
          -> routing.js (resolves per-phase LLM models)
          -> configInt/configFloat/configValue (phase functions read settings)
```

**Frontend -> Backend (LLM Config) — verified working:**
```
LlmPhaseSection.tsx -> useLlmPolicyAuthority.ts -> PUT /llm-policy
  -> llmPolicyHandler.js -> disassembleLlmPolicy() -> flat keys -> live config
```

**Runtime Ops dashboard — verified read-only:** Zero editable settings. Pure observatory.

### Issues

**SW-1 (MEDIUM):** `PrefetchLiveSettings` interface in `runtime-ops/types.ts:654-660` is defined and imported by 5 prefetch panels but never populated. Dead type artifact.

**SW-2 (MEDIUM):** Token cap fallback defaults `plan: 1200, triage: 1200, reasoning: 4096` in `configIndexingMetricsHandler.js:38-40` are hardcoded. These are last-resort fallbacks when `knobDefaults.phase_02_planner?.token_cap` is null. Should reference a centralized constant.

**SW-3 (LOW):** Token presets array `[256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]` hardcoded as fallback in `configIndexingMetricsHandler.js:72`. Triggered only if `config.llmOutputTokenPresets` is not an array.

**SW-4 (INFO):** Phase naming inconsistency: `phase_02_planner` / `searchPlanner` / `needset_planner` (prefetch group key) / `needset` (phase key) refer to overlapping concepts with different naming conventions across contracts.

---

## 3. Plugin Extensibility & Sequential Async

### Grade: A

**Crawl Plugin Registry** (`plugins/pluginRegistry.js`):
- `PLUGIN_REGISTRY = Object.freeze({ stealth, cookieConsent, autoScroll, domExpansion, cssOverride })`
- O(1) addition: create file + import + 1 registry line
- Sequential hook execution with per-plugin try/catch
- 5 lifecycle hooks: `beforeNavigate`, `afterNavigate`, `onInteract`, `onCapture`, `onComplete`

**Extraction Plugin Registry** (`plugins/pluginRegistry.js`):
- `EXTRACTION_PLUGIN_REGISTRY = Object.freeze({ screenshot })`
- O(1) addition: create file + import + 1 registry line
- Sequential execution with **deep-frozen context** (`Object.freeze()` recursive)
- Single `onExtract(frozenCtx)` interface

**Verified sequential execution:** Both systems use `for (const plugin of plugins) { await ... }` — plugin N+1 waits for plugin N. Per-plugin try/catch ensures one crash doesn't affect others.

**Verified context isolation:** Extraction runner deep-freezes context. Crawl system passes raw settings (not frozen — noted below).

### Issues

**PE-1 (LOW):** Crawl session passes raw `settings` to plugin hooks without freezing. No plugins currently mutate it, but no guard exists.

---

## 4. Logic Correctness & Contract Assurance

### Grade: A

**Verified defensive patterns across entire pipeline:**

- Every LLM call (4 total: NeedSet planner, Brand Resolver, Query Enhancer, SERP Selector) has try/catch + deterministic fallback
- Identity Lock Guard validates brand AND model tokens; falls back to first query if all fail (never returns empty)
- Hard caps enforced at every boundary: `searchProfileQueryCap`, `serpSelectorMaxKeep`, `domainClassifierUrlCap`
- Cumulative Zod checkpoint validation at phase boundaries
- SERP fallback uses pre-priority-sorted candidates (pinned/multi-hit first), not random order

**Zero crash vectors found.** All code paths terminate in a valid state.

### Minor Issues

**LC-1 (LOW):** Tier `99` used as sentinel for unknown evidence tier in `needsetEngine.js:481`. Documented inline with WHY comment. Low collision risk.

**LC-2 (LOW):** Brand Resolver returns empty `{}` on LLM failure rather than typed null result. Downstream handles both.

---

## 5. Config Debt & Magic Numbers

### Grade: B (corrected from C+)

**15 TRUE magic numbers** (not in any registry, not read from config/settings):

| # | Value | File:Line | What It Controls |
|---|-------|-----------|------------------|
| 1 | `maxFocusFields = 10` | `needsetEngine.js:418` | Max fields in a focus group selection |
| 2 | `confidenceThresholdMatched = 0.95` | `needsetEngine.js:419` | When identity source label = "matched" |
| 3 | `confidenceThresholdPossible = 0.70` | `needsetEngine.js:420` | When identity source label = "possible" |
| 4 | `NEED_SCORE_WEIGHTS = {identity:100, critical:80, required:60, expected:30, optional:10}` | `needsetEngine.js:56` | Field priority scoring weights |
| 5 | `maxTokensPerShard = 8` (param default) | `needsetEngine.js:35` | Alias shard token cap |
| 6 | Repeat penalty: `Math.min(count, 5) * 10` | `searchPlanningContext.js:190` | Group productivity score penalty |
| 7 | Volume bonus: `Math.min(count, 10) * 2` | `searchPlanningContext.js:192` | Group productivity score bonus |
| 8 | `MIN_BODY_LENGTH = 200` | `bypassStrategies.js:26` | Empty response detection threshold |
| 9 | `HTML_SNIPPET_CAP = 5000` | `bypassStrategies.js:27` | Block detection scan range |
| 10 | `stableCount >= 2` | `autoScrollPlugin.js:31` | Scroll height stability threshold |
| 11 | `el.click({ timeout: 2000 })` | `cookieConsentPlugin.js:49`, `domExpansionPlugin.js:28` | Element click timeout |
| 12 | Score formula: `100 - (rank * (99 / (totalKept - 1)))` | `serpSelector.js:180` | SERP rank-based linear scoring |
| 13 | `learnedCap = 6` | `queryFieldRuleGates.js:70` | Learned synonym cap per field (WHY comment says "should be registry-driven") |
| 14 | `totalCap = 12` | `queryFieldRuleGates.js:71` | Total synonym cap per field |
| 15 | `tooltipPhraseCap = 4` | `queryFieldRuleGates.js:72` | Tooltip phrase extraction cap |

**Domain constants (NOT magic numbers — stable classification maps):**
- `CONTENT_TYPE_TO_FAMILY` mapping (23 entries) — `needsetEngine.js:167-189`
- `PHASE_ORDER = {now:0, next:1, hold:2}` — sort enum, not threshold
- `STOP_WORDS` set — `searchPlanningContext.js:133`
- `GROUP_DEFAULTS` — transitional fallback (see VS-1)

**Token cap fallback defaults (fragile but not magic):**
- `plan: 1200`, `triage: 1200`, `reasoning: 4096` — `configIndexingMetricsHandler.js:38-40`
- Token presets: `[256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]` — `configIndexingMetricsHandler.js:72`

---

## 6. Immutability & Side Effects

### Grade: A+

**Zero input mutations detected across entire pipeline.** Verified patterns:

- NeedSet: All derivations via spread operators, new Map/Set objects
- Brand Resolver: Reads/writes cache, never mutates references
- Search Planner: Preserves `original_query` for traceability
- Query Journey: Assembly via spread, not mutation
- SERP Selector: Selected candidates are NEW objects with enriched fields
- Domain Classifier: Fresh triage metadata map
- Extraction Runner: Deep-freezes context — `TypeError` on attempted mutation
- Phase overrides applied immutably: `focusGroups.map(g => phaseOverrides.has(g.key) ? { ...g, phase: ... } : g)`

**Intentional side effects (documented):**
- Brand cache I/O (`storage.upsertBrandDomain`)
- Search profile artifact writes
- Query index recording (NDJSON)
- Frontier DB recording
- `planner.enqueue()` in Domain Classifier
- Logger events (telemetry)

---

## 7. DRY Violations & Risky Logic

### Grade: A-

| ID | Pattern | Location | Risk Level |
|----|---------|----------|------------|
| `.includes('constraint_conflict')` | `needsetEngine.js:73` | LOW — exact string in array, not substring of arbitrary text |
| `.includes(norm)` in `countTokenHits` | `discoveryIdentity.js:61` | LOW — scoring only, not gating |
| `GROUP_DEFAULTS` mouse-category coupling | `searchPlanningContext.js:21-33` | HIGH — must retire when category contracts complete |
| `el.click({ timeout: 2000 })` duplicated | `cookieConsentPlugin.js:49` + `domExpansionPlugin.js:28` | LOW — could be a shared constant |

---

## 8. Async & Observability

### Grade: A

**All async patterns verified correct:**

| Phase | Pattern | Verified |
|-------|---------|----------|
| NeedSet + Brand Resolver | `Promise.all()` parallel | No data dependency between them |
| Search Planner | Retry loop with `maxRetries` from registry | Falls back to deterministic on exhaust |
| Search Execution | `runWithConcurrency(queries, concurrency)` | Serper bursts, others sequential |
| SERP Selector | LLM + validation + fallback | Pre-ranked passthrough on failure |
| Crawl plugins | Sequential `for...of` per-plugin try/catch | One crash doesn't affect others |
| Extraction plugins | Sequential `for...of` + frozen context | Comprehensive isolation |

**Zero empty catch blocks that silently swallow errors.** Every catch has at minimum `logger.warn()` or `logger.error()`.

---

## 9. Naming & Subtractive Engineering

### Grade: B+

**Phase naming inconsistency (cosmetic, not functional):**
- `phase_02_planner` vs `searchPlanner` vs `needset_planner` vs `needset`
- `phase_03_triage` vs `serp_selector`

**Dead code / orphaned artifacts:**

| Item | Location | Action |
|------|----------|--------|
| `PrefetchLiveSettings` type | `runtime-ops/types.ts:654-660` | Delete type + remove 5 panel imports |
| `"unk"` string literal | `needsetEngine.js:437` | Cosmetic — `prov.value ?? 'unk'` |

---

## 10. Documentation & Diagrams

### Grade: B+

**Updated in this audit:**
- `FULL-PIPELINE-START-TO-FINISH.mmd` — **REWRITTEN** (was showing deleted stages 08-13, wrong phase ordering)
- `SETTINGS-WIRING-FLOW.mmd` — **NEW** (settings SSOT -> derivation -> API -> GUI -> pipeline)
- `PLUGIN-LIFECYCLE.mmd` — **NEW** (crawl hook sequence + extraction runner)

**Still current and accurate (verified):**
- All 10 pipeline phase `README.md` contracts
- `src/core/README.md`
- `docs/04-features/indexing-lab.md`
- `docs/05-operations/spec_factory_knobs_maintenance.md`
- All crawl pipeline docs

**Stale but correctly quarantined:**
- `STRUCTURAL-AUDIT-2026-03-24.md` — 15 findings not yet actioned, needs status annotation
- `SPEC_FACTORY_KNOBS.md` — lists 117 vs maintenance log's 122 (difference: 5 internal LLM + unlisted entries)

**Missing documentation (recommended):**
- `docs/03-architecture/registry-driven-design.md` — how to add settings/phases/plugins (O(1) guide)

---

## Rendering Commands for 4K PNG

```bash
# Full pipeline flow diagram
npx -y @mermaid-js/mermaid-cli mmdc -i docs/implementation/ai-indexing-plans/pipeline/FULL-PIPELINE-START-TO-FINISH.mmd -o docs/implementation/ai-indexing-plans/pipeline/FULL-PIPELINE-START-TO-FINISH.4k.png -w 3840 -H 2160 -b white

# Settings wiring flow
npx -y @mermaid-js/mermaid-cli mmdc -i docs/implementation/ai-indexing-plans/pipeline/SETTINGS-WIRING-FLOW.mmd -o docs/implementation/ai-indexing-plans/pipeline/SETTINGS-WIRING-FLOW.4k.png -w 3840 -H 2160 -b white

# Plugin lifecycle sequence
npx -y @mermaid-js/mermaid-cli mmdc -i docs/implementation/ai-indexing-plans/pipeline/PLUGIN-LIFECYCLE.mmd -o docs/implementation/ai-indexing-plans/pipeline/PLUGIN-LIFECYCLE.4k.png -w 3840 -H 2160 -b white
```

---

## 11. Ghost Settings & Configuration Drift

### Grade: B

**Ghost settings (consumed in code but NOT in settings registry):**

| Setting | Consumed At | Pattern | Issue |
|---------|-------------|---------|-------|
| `discoveryInternalFirst` | `executeSearchQueries.js:100` | `Boolean(config.discoveryInternalFirst)` | Read from config but invisible to GUI/env/settings API. Cannot be set without manual config override. Has tests (`discoverySearchExecutionInternalContracts.test.js`). |
| `discoveryInternalMinResults` | `executeSearchQueries.js:101` | `Number(config.discoveryInternalMinResults \|\| 1)` | Same — consumed but not registered. Default falls back to `1` in code. |

**Stale doc reference (deleted feature flag):**

| Setting | Referenced In | Issue |
|---------|---------------|-------|
| `serpSelectorEnabled` | `PREFETCH-PIPELINE-OVERVIEW.md:499` | Docs say "selector path only when `serpSelectorEnabled=true`" but this flag does NOT exist in any source file. The SERP selector always runs (with fallback). Stale doc reference to a removed feature flag. |

**Action required:**
- Register `discoveryInternalFirst` and `discoveryInternalMinResults` in `RUNTIME_SETTINGS_REGISTRY` with appropriate type/default/min/max/uiCategory
- Remove `serpSelectorEnabled` reference from `PREFETCH-PIPELINE-OVERVIEW.md`

---

## Priority Fix List (Verified)

| Priority | ID | Issue | Effort |
|----------|----|-------|--------|
| HIGH | VS-1 | Retire `GROUP_DEFAULTS` — require category contracts to populate `fieldGroupsData.groups` | Medium |
| HIGH | MN-1..7 | Promote 7 NeedSet/planning magic numbers to registry settings | Low |
| MEDIUM | SW-1 | Delete orphaned `PrefetchLiveSettings` type + 5 panel import references | Low |
| MEDIUM | MN-8..9 | Promote `MIN_BODY_LENGTH` and `HTML_SNIPPET_CAP` to registry | Low |
| MEDIUM | VS-2 | Convert search provider dispatch to registry pattern | Medium |
| MEDIUM | SW-2 | Centralize token cap fallback defaults (1200/1200/4096) | Low |
| LOW | MN-10..12 | Promote scroll stability, click timeout, score formula constants | Low |
| MEDIUM | GS-1 | Register `discoveryInternalFirst` + `discoveryInternalMinResults` in settings registry | Low |
| MEDIUM | GS-2 | Remove stale `serpSelectorEnabled` reference from PREFETCH-PIPELINE-OVERVIEW.md | Low |
| LOW | PE-1 | Freeze crawl settings before passing to plugin hooks | Low |
| LOW | SW-4 | Harmonize phase naming (phase_02 vs searchPlanner vs needset_planner) | Low |
