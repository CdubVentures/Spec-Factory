## Purpose

Universal per-key field extractor. One LLM call per `(product, fieldKey)` pair, tier-routed by `fieldRule.difficulty`, submitting one candidate through the publisher gate per call. **Product-scoped** (not per-variant) — `variantId: null` on every submission. Long-term replacement for RDF / SKU / per-feature scalar finders as they migrate onto this engine.

Phase 3a Part 2 ships solo Run mode only:
- Loop mode (budget-bounded retries) → Phase 3b
- Bundling / passenger keys → Phase 5
- Dashboard UI → Phase 4
- RDF / SKU cutover → Phase 6+

## Public API (The Contract)

Exports from `src/features/key/index.js`:

- `runKeyFinder({ product, fieldKey, category, specDb, appDb?, config?, policy?, broadcastWs?, signal?, logger?, productRoot? })` — orchestrator. One LLM call per (product, fieldKey). Skips LLM + submission for reserved field keys (see Domain Invariants). Returns `{ status, run_number, field_key, tier, candidate?, publisher_error?, unknown_reason? }`.
- `registerKeyFinderRoutes(ctx)` — custom route handler registrar. URLs:
  - `POST /key-finder/:category/:productId` body `{ field_key, mode? = 'run' }` → fireAndForget Run. Rejects `mode === 'loop'` with 400.
  - `GET /key-finder/:category` → list summaries
  - `GET /key-finder/:category/:productId?field_key=X` → scoped detail
  - `DELETE /key-finder/:category/:productId/runs/:runNumber?field_key=X` → single-run delete with field_candidates cascade
  - `DELETE /key-finder/:category/:productId` → delete-all
- `readKeyFinder` / `writeKeyFinder` / `mergeKeyFinderDiscovery` / `deleteKeyFinderRun` / `deleteKeyFinderRuns` / `deleteKeyFinderAll` / `rebuildKeyFinderFromJson` — JSON store + SQL rebuild.
- `keyFinderResponseSchema` / `perKeyShape(valueKey)` — multi-key envelope validation.
- `KEY_FINDER_DEFAULT_TEMPLATE` / `buildKeyFinderPrompt(...)` / `buildKeyFinderSpec(...)` / `KEY_FINDER_SPEC` / `createKeyFinderCallLlm(deps, tierBundle)` — prompt + LLM-caller factory. `createKeyFinderCallLlm` accepts either a tier name string (legacy — billing reason only) or a tier bundle `{ name, model, thinking, ... }` from `resolvePhaseModelByTier`; when a bundle carries a non-empty `model`, it flows through as per-call `modelOverride`.

Contract specifics:

- Response envelope: `{ primary_field_key, results: { [fk]: perKeyShape }, discovery_log }`. Per-key `value` is `z.unknown()` — the LLM emits native JSON types per each field's `contract` (number / array / boolean / enum literal / date string / `"unk"` sentinel).
- `submitCandidate` is called with `variantId: null` and `sourceMeta: { source: 'key_finder', source_type: 'feature', tier, run_number, model }`.
- Reserved-key rejection throws BEFORE any LLM call or store write.

## Dependencies

- **Allowed**: `src/core/finder/` (JSON/SQL stores, route handler helpers, discovery-log accumulator, reserved-keys denylist), `src/core/llm/` (tier router, LLM deps, phase-call adapter, stream batcher), `src/core/events/dataChangeContract.js`, `src/core/operations/` (operation lifecycle + fireAndForget), `src/engine/fieldRulesEngine.js`, `src/features/publisher/candidate-gate/submitCandidate.js` (via `src/features/publisher/index.js`), `src/features/indexing/orchestration/shared/identityHelpers.js`, `src/billing/costLedger.js`.
- **Forbidden**: Other finder feature internals (CEF / PIF / RDF / SKU). Import only via their public APIs.

## Domain Invariants

- **Product-scoped, never per-variant**: `runKeyFinder` fires exactly one LLM call per invocation. `submitCandidate` is called with `variantId: null`. Per-variant divergence for connectivity-type fields is a manual-override concern, not the orchestrator's.
- **Reserved-keys denylist enforced**: Keys owned by another finder (CEF `colors`/`editions`, RDF `release_date`, SKF `sku`, PIF nothing today) throw before any LLM call. `eg_defaults` keys land in the same set via `EG_LOCKED_KEYS`. The denylist is derived from `FINDER_MODULES` so new finders auto-register.
- **Run record must echo `primary_field_key`**: Every persisted run carries `response.primary_field_key === fieldKey`. Per-key discovery-log scope depends on this; a missing stamp silently turns the URL+query suppression into a no-op.
- **Tier routing is whole-bundle**: `resolvePhaseModelByTier` returns `{ model, useReasoning, reasoningModel, thinking, thinkingEffort, webSearch }`. Empty `tier.model` inherits the entire fallback bundle. Phase 3a Part 2 plumbs `model` as per-call `modelOverride`; `thinking` / `webSearch` / `thinkingEffort` fall back to the keyFinder phase config.
- **Honest "unk" is a real answer**: When the LLM returns `value: 'unk'` with an `unknown_reason`, the orchestrator skips `submitCandidate` (nothing to gate) but persists the run anyway. Discovery history grows.
- **Publisher failures never abort the run**: `submitCandidate` errors land on the returned envelope's `publisher_error` — the run record still writes to JSON + SQL, and the route returns 2xx with the error surfaced in the payload.
- **Dual-state CQRS**: JSON (`.workspace/products/{pid}/key_finder.json`) is durable memory. SQL `key_finder` + `key_finder_runs` are projections. Both rebuildable from JSON alone via `rebuildKeyFinderFromJson` (Rebuild Contract).
- **Run history is per-key, not per-product**: `accumulateDiscoveryLog` uses `runMatcher: (r) => r.response?.primary_field_key === fieldKey`. Running `polling_rate` 10 times followed by a `sensor_model` run shows only the `sensor_model` run's history to the next `sensor_model` call.

## Settings (per-category, stored in `{category}/key_finder_settings.json`)

Registered in `FINDER_MODULES[keyFinder].settingsSchema`. 16 knobs + 1 preview widget:

- **Prompt** (hidden): `discoveryPromptTemplate` — per-category template override, edited in LLM Config → Key Finder.
- **Budget scoring**: `budgetRequiredPoints` (intMap, `mandatory/non_mandatory`), `budgetAvailabilityPoints` (`always/sometimes/rare`), `budgetDifficultyPoints` (`easy/medium/hard/very_hard`), `budgetVariantPointsPerExtra` (int), `budgetFloor` (int). Consumed by `calcKeyBudget`. Run mode ignores the attempt count; Phase 3b Loop uses it.
- **Bundling** (Smart Loop only, Phase 5+): `bundlingEnabled`, `groupBundlingOnly`, `bundlingPassengerCost`, `bundlingPoolPerPrimary`, `passengerDifficultyPolicy`.
- **Context injection**: `componentInjectionEnabled`, `knownFieldsInjectionEnabled`, `searchHintsInjectionEnabled` — three independent gates on primary/passenger prompt slots.
- **Discovery history**: `urlHistoryEnabled`, `queryHistoryEnabled` — per-key scope (not per-product).

LLM tier bundles live separately in `settingsRegistry.keyFinderTierSettingsJson` (one JSON blob keyed by `easy`/`medium`/`hard`/`very_hard`/`fallback`).
