## Purpose

Universal per-key field extractor. One LLM call per `(product, fieldKey)` pair, tier-routed by `fieldRule.difficulty`, submitting one candidate per key through the publisher gate. **Product-scoped** (not per-variant) — `variantId: null` on every submission. Long-term replacement for RDF / SKU / per-feature scalar finders as they migrate onto this engine.

Phases live today (2026-04-22):
- Phase 3a Run orchestrator (solo single-shot) + Phase 3b Loop (budget-bounded retries)
- Phase 4 per-key dashboard + bundling preview column + bundling status strip
- Phase 4.5 bundling — passengers ride along with the primary (Stage A/B amendments: Run is solo by default via `alwaysSoloRun`; mandatory-first sort; fractional variant penalty)
- Phase 5 prompt preview via shared `PromptPreviewModal` (live-compiled, registry-aware)
- Phase 6 Discovery History drawer grouped by `field_key` with live group-history filter
- Stage C 2026-04-22 — Run Group / Run All Groups / Loop Group / Loop All Groups + in-flight passenger registry + per-tier concurrent-ride caps + hard-block on busy primaries. See §6.2 / §6.3 of per-key-finder-roadmap.html.

Upcoming:
- RDF / SKU cutover onto this engine

## Public API (The Contract)

Exports from `src/features/key/index.js`:

- `runKeyFinder({ product, fieldKey, category, specDb, appDb?, config?, policy?, broadcastWs?, signal?, logger?, productRoot? })` — orchestrator. One LLM call per `(product, fieldKey)`. Resolves passengers via `buildPassengers` when bundling is enabled, loops `submitCandidate` across primary + each passenger. Returns `{ status, run_number, field_key, tier, candidate?, passenger_candidates, publisher_error?, unknown_reason? }`.
- `registerKeyFinderRoutes(ctx)` — custom route handler registrar. URLs:
  - `POST /key-finder/:category/:productId` body `{ field_key, mode? = 'run' }` → fireAndForget Run. Rejects `mode === 'loop'` with 400.
  - `POST /key-finder/:category/:productId/preview-prompt` body `{ field_key, passenger_field_keys_snapshot? }` → Phase 5 compiled prompt preview (no LLM, no persistence). When present, the passenger snapshot is authoritative for preview parity with the visible Next bundle row.
  - `GET /key-finder/:category` → list summaries
  - `GET /key-finder/:category/:productId/bundling-config` → live settings snapshot for the BundlingStatusStrip
  - `GET /key-finder/:category/:productId/summary` → per-key rollup rows including `bundle_preview`
  - `GET /key-finder/:category/:productId?field_key=X&scope=key|group|product` → scoped detail (legacy; partial consumers)
  - `DELETE /key-finder/:category/:productId/runs/:runNumber?field_key=X` → single-run delete (cascades primary + all passengers)
  - `DELETE /key-finder/:category/:productId` → delete-all
- `buildPassengers({ primary, engineRules, specDb, productId, settings, familySize? })` — shared packer-wrapper used by BOTH `runKeyFinder` and `keyFinderPreviewPrompt.compileKeyFinderPreviewPrompt` so preview and live run resolve passengers identically.
- `packBundle(...)` — 6-step deterministic packer (eligibility → sort → greedy under `bundlingPoolPerPrimary[primaryDifficulty]`).
- `compileKeyFinderPreviewPrompt(ctx)` — read-only prompt compiler returning the shared `PromptPreviewResponse` envelope.
- `readKeyFinder` / `writeKeyFinder` / `mergeKeyFinderDiscovery` / `deleteKeyFinderRun` / `deleteKeyFinderRuns` / `deleteKeyFinderAll` / `rebuildKeyFinderFromJson` — JSON store + SQL rebuild.
- `keyFinderResponseSchema` / `perKeyShape(valueKey)` — multi-key envelope validation (primary + N passengers keyed by field_key).
- `KEY_FINDER_DEFAULT_TEMPLATE` / `buildKeyFinderPrompt(...)` / `buildKeyFinderSpec(...)` / `KEY_FINDER_SPEC` / `createKeyFinderCallLlm(deps, tierBundle)` — prompt + LLM-caller factory.

Contract specifics:
- Response envelope: `{ primary_field_key, results: { [fk]: perKeyShape }, discovery_log }`. Per-key `value` is `z.unknown()` — LLM emits native JSON types per each field's `contract`.
- `submitCandidate` called once per answered key with `variantId: null` and `sourceMeta.run_number` shared across primary + passengers so the delete cascade groups correctly.
- Reserved-key rejection throws BEFORE any LLM call or store write.
- Passengers never enter the candidate pool themselves — `buildPassengers` filters reserved keys and variant-dependent keys up front.

Prompt contract note:
- `buildKeyFinderPrompt(...)` receives `knownValues` from `FieldRulesEngine`; `enum.source: data_lists.*` values are rendered for the primary and every passenger before live Run or Prompt Preview dispatch.
- Runtime context is split: `PRODUCT_SCOPED_FACTS` contains only product-scoped resolved fields, while `VARIANT_INVENTORY` is an active CEF variant table joined to SKU/RDF/PIF by `variant_id`. `FIELD_IDENTITY_USAGE` gives the primary key's instructions for using that table as an evidence filter.

## Dependencies

- **Allowed**: `src/core/finder/` (JSON/SQL stores, route handler helpers, discovery-log accumulator, reserved-keys denylist), `src/core/llm/` (tier router, LLM deps, zodToLlmSchema, stream batcher, prompt fragments), `src/core/events/dataChangeContract.js`, `src/core/operations/` (operation lifecycle + fireAndForget), `src/engine/fieldRulesEngine.js`, `src/features/publisher/candidate-gate/submitCandidate.js`, `src/features/indexing/orchestration/shared/identityHelpers.js`, `src/billing/costLedger.js`.
- **Forbidden**: Other finder feature internals (CEF / PIF / RDF / SKU). Import only via their public APIs.

## Domain Invariants

- **Product-scoped, never per-variant**: `runKeyFinder` fires exactly one LLM call per invocation. `submitCandidate` uses `variantId: null`.
- **Reserved-keys denylist enforced**: Keys owned by another finder (CEF `colors`/`editions`, RDF `release_date`, SKF `sku`) throw before any LLM call. `eg_defaults` keys land in the same set via `EG_LOCKED_KEYS`. Derived from `FINDER_MODULES`.
- **Bundling contract (Phase 4.5, locked 2026-04-21)**: Primary owns the budget; passengers ride free. Effective passenger cost is `bundlingPassengerCost[peer.difficulty] + ((familySize - 1) * bundlingPassengerVariantCostPerExtra)`, where family size is the product count sharing `brand + base_model` (not CEF color/edition variants). Greedy-pack under `bundlingPoolPerPrimary[primary.difficulty]`. 4 policy enums: `less_or_equal` / `same_only` / `any_but_very_hard` / `any_but_hard_very_hard`. SSOT §6.1 of per-key-finder-roadmap.html.
- **Preview–runner parity**: `buildPassengers` is the ONLY live passenger resolver both paths call. Prompt Preview may receive the UI's visible `passenger_field_keys_snapshot`; when present, that snapshot is authoritative so the modal mirrors the current Next bundle row. Drift is guarded by `keyFinderPreviewPrompt.test.js`.
- **Run record must echo `primary_field_key`**: Every persisted run carries `response.primary_field_key === fieldKey` AND `response.results[primary_field_key]`. Discovery history drawer groups runs by this key.
- **Passenger attribution**: `run.selected.keys[fk].rode_with` is `null` for primary, `primaryFieldKey` for each passenger. Load-bearing for (a) delete-run cascade expanding `fieldKeys` from `run.selected.keys` and (b) Phase 5 Group Loop skip logic.
- **History broadening**: `filterRunsByFieldKey` matches runs where the key appears as primary OR in `response.results`. `accumulateDiscoveryLog.runMatcher` mirrors this so passenger-resolved keys see the primary's URLs/queries as their own (passengers inherit the primary's search session by contract).
- **Tier routing is whole-bundle**: `resolvePhaseModelByTier` returns `{ model, useReasoning, reasoningModel, thinking, thinkingEffort, webSearch }`. Empty `tier.model` inherits the fallback bundle.
- **Honest "unk" is a real answer**: `submitCandidate` skipped when `value === 'unk'` or no evidence refs; the run still persists.
- **Publisher failures never abort the run**: errors land on `publisher_error` (primary) or `passenger_candidates[i].publisher_error`; run record writes either way.
- **Dual-state CQRS**: JSON (`.workspace/products/{pid}/key_finder.json`) is durable memory. SQL `key_finder` + `key_finder_runs` are projections. Both rebuildable from JSON via `rebuildKeyFinderFromJson`.

## Settings (per-category, stored in `{category}/key_finder_settings.json`)

Registered in `FINDER_MODULES[keyFinder].settingsSchema`:

- **Prompt** (hidden): `discoveryPromptTemplate` — per-category template override, edited in LLM Config → Key Finder.
- **Budget scoring**: `budgetRequiredPoints`, `budgetAvailabilityPoints`, `budgetDifficultyPoints`, `budgetVariantPointsPerExtra`, `budgetFloor`. Consumed by `calcKeyBudget`. Run mode ignores attempt count; Phase 3b Loop will use it.
- **Bundling** (Run / Loop / Smart Loop all honor when `bundlingEnabled=true`): `bundlingEnabled`, `groupBundlingOnly`, `bundlingPassengerCost`, `bundlingPassengerVariantCostPerExtra`, `bundlingPoolPerPrimary`, `passengerDifficultyPolicy`.
- **Context injection**: `componentInjectionEnabled`, `knownFieldsInjectionEnabled`, `searchHintsInjectionEnabled` — component relation, product-scoped fact, and search-hint gates. Variant inventory is identity context and renders only when active/useful variants exist.
- **Discovery history**: `urlHistoryEnabled`, `queryHistoryEnabled` — per-primary-key scope. Discovery History drawer (Phase 6) groups by `primary_field_key` (read-only display; Stage A retired per-entry Hide suppression — these two knobs are the only controls).

LLM tier bundles live separately in `settingsRegistry.keyFinderTierSettingsJson` (one JSON blob keyed by `easy`/`medium`/`hard`/`very_hard`/`fallback`).
