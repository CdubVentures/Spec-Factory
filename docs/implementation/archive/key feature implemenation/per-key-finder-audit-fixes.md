# Per-Key Finder Audit Fixes — Work Plan

**Source:** audit findings 2026-04-22, cross-verified by two independent audits against live code.
**Scope:** four primary fixes locked to ship in order; five deferred items scoped for a follow-up pass.
**Working contract:** each primary item gets its own `[STATE: MACRO-RED]` → `[STATE: MACRO-GREEN]` cycle per CLAUDE.md. Deferred items get their own plan docs when scheduled.

**Status as of 2026-04-23:** Items 1, 2, 3, 9 SHIPPED. Items 5, 6, 8 deferred (quality-of-life + edge cases). Item 7 deferred pending PO decision on variant-scaling approach (A/B/C).

---

## Order of work

| # | Status | Item | Diff size |
|---|---|---|---|
| 1 | ✅ SHIPPED 2026-04-23 | Wire `passengerExclude*` knobs + defaults 95/3 + publisher-accurate evaluator + Status column (renamed from Concrete) | medium |
| 2 | ✅ SHIPPED 2026-04-23 | Configurable sort axis precedence (+ default flip difficulty→required→availability) with drag-drop widget | medium |
| 3 | ✅ SHIPPED 2026-04-23 | Prompt Preview — `staleTime: 0` + always Loop-shape (Run/Loop tabs removed) | small |
| 4 | ✅ FOLDED INTO ITEM 1 | "Concrete Evidence" column on key row | — |
| 5 | ✅ ACCEPTED AS-IS 2026-04-23 | Stale-resolved race (loop chain) — rare, 1 extra LLM call worst case, reloopRunBudget backstops | — |
| 6 | DEFERRED (coupled with Item 8) | Cross-chain passenger reservation | medium |
| 7 | DEFERRED (needs PO A/B/C) | Fractional pool/cost + variant scaling bundling | medium-large |
| 8 | DEFERRED (coupled with Item 6) | Run All scheduler (hard-first firing) + Loop All cross-chain orchestration | medium |
| 9 | ✅ SHIPPED 2026-04-23 | Prompt tooltip rewrite + restore live-update invalidations (Run/Loop tooltips kept static — column already shows dynamic state) | tiny |

---

# PRIMARY WORK

## Item 1 — Wire `passengerExclude*` knobs + publisher-accurate evaluator + Status column ✅ SHIPPED 2026-04-23

### Problem (original)

Two Pipeline Settings knobs (`passengerExcludeAtConfidence`, `passengerExcludeMinEvidence`) existed in the registry and `buildPassengers` read them, but the three orchestrators that built the `settings` object never included them → `Number(undefined) || 0` → feature dead regardless of GUI state. Additionally, the exclusion path used `specDb.getTopFieldCandidate` (single-row shortcut), which diverges from the publisher's deterministic bucket evaluator — so the concrete check didn't match actual publish semantics.

### Final shipped behavior

**Mechanism: concrete gate + replace-semantics.**

- Exclusion routes through the publisher's `evaluateFieldBuckets` with stricter threshold/required overrides. Same deterministic gate the publisher uses, just tighter.
- **When both knobs > 0 (concrete gate ACTIVE):** peers are excluded ONLY when their bucket qualifies under the stricter thresholds. Published-but-below-bar peers KEEP bundling so evidence accumulates toward concrete. Locked contract: *"below either threshold, peers keep retrying."*
- **When either knob = 0 (legacy):** fall back to the original behavior — all published peers excluded unconditionally.
- Same gate fires for Run and Loop → `/summary.bundle_preview` column is consistent with what either would actually pack.

**New helper: `src/features/key/keyConcreteEvidence.js`**

Exports `isConcreteEvidence({ specDb, productId, fieldKey, fieldRule, excludeConf, excludeEvd })` — a thin wrapper over `evaluateFieldBuckets` with `threshold = excludeConf / 100` and `requiredOverride = excludeEvd`. Returns `true` when `publishedValue !== undefined` under the stricter gates. Tolerant of specDbs that lack `listFieldBuckets` (returns `false`).

**Publisher evaluator extension: `src/features/publisher/publish/evidenceGate.js`**

Added optional `requiredOverride` param to `evaluateFieldBuckets`. Backward-compatible — existing callers (publish path, reconcile, republish) never pass it, so `readMinEvidenceRefs(fieldRule)` stays the default.

### Files changed

**Backend:**
- `src/core/finder/finderModuleRegistry.js:637,640` — defaults flipped 0 → 95 and 0 → 3.
- `category_authority/_global/key_finder_settings.json` — seed values 0 → 95 / 0 → 3.
- `src/features/publisher/publish/evidenceGate.js` — `evaluateFieldBuckets({ requiredOverride? })` added.
- `src/features/key/keyConcreteEvidence.js` — new helper (~40 LOC).
- `src/features/key/keyPassengerBuilder.js` — exclusion path swapped: concrete gate active → replace-semantics; gate disabled → legacy.
- `src/features/key/keyFinder.js` — settings bundle reads the two knobs.
- `src/features/key/keyFinderPreviewPrompt.js` — `readSettings` reads the two knobs.
- `src/features/key/api/keyFinderRoutes.js` — `readBundlingSettings` reads the two knobs; `buildRow` adds `concrete_evidence` / `top_confidence` / `top_evidence_count` fields; status derivation now sets `lastStatus='resolved'` for keys published via passenger cascade (no own primary run); `last_value` / `last_confidence` / `last_model` populated from `getTopFieldCandidate` when key is resolved-without-own-run.

**Frontend:**
- `tools/gui-react/src/features/key-finder/types.ts` — three new fields on `KeyFinderSummaryRow` + `KeyEntry`.
- `tools/gui-react/src/features/key-finder/state/keyFinderGroupedRows.ts` — propagates new fields.
- `tools/gui-react/src/features/key-finder/components/KeyGroupSection.tsx` — new "Status" column header (between Value and Riding), tooltip explains the 95/3 bar + difference from "Published"; old "Status" header renamed to "Published"; "Next bundle" header now carries a conditional sub-label `Loop only — see alwaysSoloRun setting` when `alwaysSoloRun=true`; `alwaysSoloRun` threaded as a prop.
- `tools/gui-react/src/features/key-finder/components/KeyRow.tsx` — new `ConcreteBadge` cell renders `✓` / `Improvable` / `—`; shared `CheckMark` SVG; `KeyFinderPanel` passes the already-fetched `alwaysSoloRun` down.

### Label final state

| Column | Label | When |
|---|---|---|
| Status (formerly "Concrete") | ✓ (green pill) | `concrete_evidence=true` (bucket qualifies at 95/3) |
| | Improvable | has candidate data but below the bar |
| | — | no candidate data |
| Published (formerly "Status") | `resolved` / `below threshold` / `unk` / `unresolved` / `running` | text labels with color pill (no ✓ — reverted per UX preference) |
| Next bundle (used/pool) | header + optional sub-label `Loop only — see alwaysSoloRun setting` | sub-label shows only when `alwaysSoloRun=true` |

### Tests shipped

- **New: `src/features/key/tests/keyConcreteEvidence.test.js`** — 8 boundary tests covering disabled-state tolerance + evaluator result paths.
- **Updated: `keyPassengerBuilder.test.js`** — fixture swapped from `getTopFieldCandidate` mock to `listFieldBuckets` + `countPooledQualifyingEvidenceByFingerprint` mocks; the old "union-semantics" test inverted to assert the new replace-semantics contract ("concrete gate ACTIVE + published-but-below-bar peer → KEEPS bundling"); new legacy-gate test added ("knobs disabled → published peer dropped").
- **Updated: `keyFinder.bundling.test.js`** — stub extended to expose bucket methods; new integration test "passengerExclude* knobs wired: concrete-bar peer drops, weak-bar peer packs"; the legacy "already-published passengers excluded" test now explicitly sets knobs to 0 to pin the legacy path.
- **Updated: `keyFinderPreviewPrompt.test.js`** — stub extended; new test "preview honors passengerExclude* via bucket evaluator".
- **Updated: `keyFinderRoutes.summary.test.js`** — stub extended; the "bundle_preview excludes already-published peers" test pins to legacy gate; new test "concrete peer drops from primary bundle_preview and has `concrete_evidence: true` on its row".

### Verification

- `npm test` → 11,490 / 11,490 backend tests green.
- `cd tools/gui-react && npx tsc --noEmit` → clean compile.
- GUI smoke: `alwaysSoloRun=true` toggle flips the sub-label under "Next bundle"; ✓ appears on keys that reach 3+ refs at ≥95% confidence.

### Notes / gotchas for next maintainer

- The ORIGINAL plan had "Item 4 — Concrete column" as a separate primary item. During implementation it was folded into Item 1 because the column and the knob are inseparable (the column shows the result of the gate).
- The tooltip copy in `bundlingPassengerCost` registry still says the cost is raw — that's still true; variant scaling is Item 7 (deferred).
- `KeyBundlingStrip` was NOT updated to surface the passenger-exclude values (punted — the Status column already makes per-row state visible, and the strip would duplicate info).

---

## Item 2 — Configurable sort axis precedence (+ default flip) ✅ SHIPPED 2026-04-23

### Problem

Two coupled issues:

1. **Default order**: Sort in `keyBundler.js:104-120` and `keyFinderGroupedRows.ts::sortKeysByPriority` hard-coded `required_level → availability → difficulty`. User's intent: `difficulty → required_level → availability` — easy-first packing fills bundles with more cheap passengers per pool, Loop chains get quick first-wins, and cheaper peers inform harder ones.
2. **Configurability**: Hard-coded sort made A/B testing and per-category tuning a code change. User asked for a drag-reorderable setting (same pattern as TierHierarchyPanel).

### Decision

Ship both at once: add a new `bundlingSortAxisOrder` CSV knob with default `difficulty,required_level,availability`, and a drag-drop widget in Pipeline Settings → Key Finder → Bundling. Same setting drives both the backend bundler and the frontend Loop chain sort (byte-for-byte parallel implementations).

### Changes

**Shared helper (SSOT for the axis contract):**

- **NEW `src/features/key/keyBundlerSortAxes.js`** — exports `DEFAULT_AXIS_ORDER`, `KNOWN_AXES`, `parseAxisOrder(csv)` (tolerates garbage / missing / duplicates; always returns a total ordering over the 3 axes), `buildSortComparator(axisOrder, { tiebreaker })` — tiebreaker `'currentRides'` (bundler) vs `'none'` (frontend Loop chain).

**Backend:**

- **`src/features/key/keyBundler.js:98-107`** — sort comparator swapped for `buildSortComparator(parseAxisOrder(settings.bundlingSortAxisOrder), { tiebreaker: 'currentRides' })`. Header comment + invariants updated. Local rank constants removed (now in helper).
- **`src/features/key/keyFinder.js`** — `bundlingSortAxisOrder` added to settings bundle.
- **`src/features/key/keyFinderPreviewPrompt.js`** — same.
- **`src/features/key/api/keyFinderRoutes.js`** — `readBundlingSettings` reads the knob; `GET /bundling-config` response now emits `sortAxisOrder: parseAxisOrder(...).join(',')` (server-side canonicalized).

**Registry:**

- **`src/core/finder/finderModuleRegistry.js`** — new entry under the `Bundling` uiGroup:
  ```js
  { key: 'bundlingSortAxisOrder', type: 'string',
    default: 'difficulty,required_level,availability',
    widget: 'bundlingSortAxisOrder', uiLabel: 'Sort axis precedence', ... }
  ```
  Regenerates `tools/gui-react/src/features/pipeline-settings/state/finderSettingsRegistry.generated.ts` via `node tools/gui-react/scripts/generateLlmPhaseRegistry.js`.

**Frontend:**

- **`tools/gui-react/src/features/key-finder/api/keyFinderQueries.ts`** — `BundlingConfig.sortAxisOrder: string` added.
- **`tools/gui-react/src/features/key-finder/state/keyFinderGroupedRows.ts`** — ports the same axis contract (`DEFAULT_AXIS_ORDER`, `parseAxisOrder`, dynamic rank lookup). `sortKeysByPriority` now takes an optional `axisOrder?: readonly string[]` param; no-arg call defaults to the new order.
- **`tools/gui-react/src/features/key-finder/components/KeyFinderPanel.tsx`** — reads `bundlingConfig.sortAxisOrder`, memoizes `parseAxisOrder(...)`, passes to both `sortKeysByPriority` call sites (loopGroup + loopAllGroups).
- **NEW `tools/gui-react/src/features/pipeline-settings/components/widgets/BundlingSortAxisOrderPicker.tsx`** — drag-drop widget (dnd-kit) with 3 fixed rows (difficulty / required_level / availability) + within-axis rank reminders. Self-normalizes malformed CSVs on mount so the knob never stays invalid.
- **`tools/gui-react/src/features/pipeline-settings/components/widgets/index.ts`** — `registerSettingWidget('bundlingSortAxisOrder', BundlingSortAxisOrderPicker)`.

### Tests

- **NEW `src/features/key/tests/keyBundlerSortAxes.test.js`** — 20 tests: parser boundary matrix + comparator fixture under both legacy and default orders + currentRides tiebreaker toggle + defensive fallbacks.
- **`src/features/key/tests/keyBundler.test.js`** — DEFAULT_SETTINGS now pins legacy axis order so the existing step-5 sort tests stay authoritative under legacy behavior. New describe block `packBundle — step 5 (ordering) under default axis order (difficulty → required → availability)` adds 6 tests exercising the new precedence + empty-knob fallback.
- **`tools/gui-react/src/features/key-finder/state/__tests__/keyFinderGroupedRows.test.ts`** — 6 existing tests updated to pass `['required_level', 'availability', 'difficulty']` explicitly (still document legacy behavior). New describe block for default order: 5 tests including no-arg defaults, partial axis arrays, and empty axis arrays. Plus 4 new `parseAxisOrder` boundary tests.

**All green:** 310 key tests (from 290, +20 for the new helper), 57 frontend state tests (from 47, +10 new), broader regression 923/923. `npx tsc --noEmit` clean.

### Verification

1. `node --test src/features/key/tests/` → 310 green.
2. `node --test tools/gui-react/src/features/key-finder/state/__tests__/` → 57 green.
3. `npx tsc --noEmit` (in `tools/gui-react`) → clean.
4. GUI smoke:
   - Open Pipeline Settings → Key Finder → Bundling → new **"Sort axis precedence"** panel shows 3 draggable rows, default: Difficulty / Required Level / Availability with position badges 1/2/3 and within-axis rank reminders.
   - Drag `Availability` to position 1 → save → open Prompt Preview on a primary with multiple peers → passenger list re-orders (availability-first).
   - Click Loop for a group with mixed keys → first fired key matches the new precedence.
   - Revert via drag to `Required Level / Availability / Difficulty` → bundling returns to legacy behavior.

### Contract recap

- **Preview & live bundler** use the same `buildSortComparator(parseAxisOrder(knob), { tiebreaker: 'currentRides' })` path — byte-for-byte parity.
- **Loop chain firing order** uses the mirrored frontend implementation with `tiebreaker: 'none'` (no `currentRides` concept on the GUI side yet).
- **Within-axis rank is fixed**: `easy < medium < hard < very_hard`, `mandatory < non_mandatory`, `always < sometimes < rare`. Widget never lets the user change these — only the axis precedence.
- **`currentRides` + `field_key` remain the final deterministic tiebreakers** (not user-configurable).

---

## Item 3 — Prompt Preview live snapshot + always-Loop prompt ✅ SHIPPED 2026-04-23

### Problem

Two issues bundled:

1. `promptPreviewQueries.ts:44` used `staleTime: 60_000`. A peer Run that starts between two preview clicks changes the registry (hard-block + cap state) but didn't invalidate the preview cache → user sees a passenger list that doesn't match what the live Run would send.
2. The preview modal had a Run/Loop tab toggle. Under `alwaysSoloRun=true` (default) the Run tab showed passengers=[] (solo dispatch), which diverged from the bundle_preview / Next Bundle columns elsewhere in the panel — confusing "is this peer bundled or not?" UX.

User requirement (combined): "anytime you click prompt preview it should show what would be sent at the moment in time" + "prompt should always be the loop prompt btw even when running."

### Changes

**Backend:**

1. **`src/features/key/keyFinderPreviewPrompt.js`** — dropped the `alwaysSoloRun && mode === 'run'` branch. Preview always calls `buildPassengers(...)` — it shows the "full potential bundle" that a Loop iteration would dispatch, regardless of body.mode or alwaysSoloRun. Live `runKeyFinder` still honors alwaysSoloRun for real Run dispatches (Run vs preview divergence is the product contract now).

**Frontend:**

2. **`tools/gui-react/src/features/indexing/api/promptPreviewQueries.ts:44`** — `staleTime: 60_000` → `staleTime: 0` so every modal open refetches.
3. **`tools/gui-react/src/features/data-change/invalidationResolver.js`** — dropped two redundant `['prompt-preview', 'key', CATEGORY_TOKEN]` entries (from `settings` and `review-layout` domain templates). staleTime=0 + react-query's `refetchOnMount` default handles freshness; the scheduler no longer needs surgical prompt-preview invalidations on unrelated data events.
4. **`tools/gui-react/src/features/key-finder/components/KeyFinderPanel.tsx`** — removed the Run/Loop `<TabStrip>`, simplified `promptState` from `{ fieldKey, mode }` to `{ fieldKey }`, hard-coded the query body to `mode: 'loop'`, single subtitle describing the always-Loop contract, dropped the mode suffix from `storageKeyPrefix`. Removed the now-unused `TabStrip` import.

### Tests

- **New `keyFinderPreviewPrompt.test.js` test** — `always Loop-shape: preview packs passengers even with mode=run + alwaysSoloRun=true` — asserts the new contract (would fail under the pre-ship code).
- **Updated drift-guard test** — `drift guard: preview systemPrompt matches live Loop runner byte-for-byte` now passes `mode: 'loop'` to `runKeyFinder` so both sides produce passengers (since preview is always Loop-shape, comparing against a Run-mode dispatch would be apples-to-oranges).
- **Updated test comments** — removed stale "mode=loop bypasses alwaysSoloRun gate" wording; new contract is mode-independent.
- Live-runner tests in `keyFinder.bundling.test.js` that pin `mode=run + alwaysSoloRun=true → passengers=[]` are untouched — that's the correct live-dispatch contract.

All 284 key tests green + 47 frontend state tests green + `npx tsc --noEmit` clean.

### Files changed

- `src/features/key/keyFinderPreviewPrompt.js` — dropped alwaysSoloRun gate in preview compiler.
- `src/features/key/tests/keyFinderPreviewPrompt.test.js` — new test + updated drift guard + comment cleanup.
- `tools/gui-react/src/features/indexing/api/promptPreviewQueries.ts` — `staleTime: 0` + clarified comment.
- `tools/gui-react/src/features/data-change/invalidationResolver.js` — two redundant entries dropped.
- `tools/gui-react/src/features/key-finder/components/KeyFinderPanel.tsx` — TabStrip removed, promptState simplified, subtitle + storageKeyPrefix updated, TabStrip import removed.

### Verification

- Open Prompt Preview for any key → only one view (no Run/Loop tabs) → shows the Loop-shape prompt with passengers always.
- Close → immediately reopen → fresh POST fires (staleTime=0); response reflects the current registry + settings state.
- Change bundling knob in Pipeline Settings → close + reopen preview → prompt reflects new knob.
- Start a Run on a peer elsewhere → during that run the preview omits that peer from the passenger list (hard-block via registry is live).

### Contract recap

- **Preview**: always compiles Loop-shape (with passengers). Ignores `alwaysSoloRun` and `body.mode`. Informational only — never dispatches.
- **Live Run dispatch**: honors `alwaysSoloRun=true` (solo) vs `false` (bundled).
- **Live Loop dispatch**: always bundled regardless of `alwaysSoloRun`.
- The KeyRow "Next bundle" tooltip copy already described this contract; now the modal matches it.

---

## Item 4 — "Concrete Evidence" column

### Problem

"Resolved" is too weak a bar (passes `publishConfidenceThreshold` — can be 1 weak evidence, ~50 confidence). Users want a distinct visual for "this key has earned its way out of the passenger pool — we've done well."

The `passengerExclude*` knobs (Item 1) already define this bar. The column surfaces the bar visually.

### Target behavior

For each row, show a checkmark ✓ when the key's top candidate meets `concrete_evidence` gate:
```
concrete_evidence = (
  excludeConf > 0 &&
  excludeEvd > 0 &&
  top.confidence >= excludeConf &&
  top.evidence_count >= excludeEvd
)
```
- When either knob is `0`, the column shows em-dash (—) for every row (feature off).
- When the knobs are `95 / 3` (new default), column shows ✓ only when conf ≥95 AND evidence ≥3.

### Distinction from existing columns

| Column | Meaning | Threshold source |
|---|---|---|
| `Status` (resolved/published) | Passes publish gate | `publishConfidenceThreshold` |
| **`Concrete`** (new) | Meets passenger-exclude bar | `passengerExcludeAtConfidence` + `passengerExcludeMinEvidence` |

A key can be `resolved` but not `concrete` (e.g., passed publish at 51 conf / 1 evidence but hasn't hit 95 / 3).

### Changes

**Backend:**
1. `src/features/key/api/keyFinderRoutes.js` `buildSummaryFromDocAndRules` — already reads `top = specDb.getTopFieldCandidate(productId, fk)`. Compute `concrete_evidence` as above and add to the returned row.
2. Add `concrete_evidence: boolean` to the row shape alongside `published`.

**Frontend:**
3. `tools/gui-react/src/features/key-finder/types.ts` — add `concrete_evidence: boolean` to `KeyFinderSummaryRow` and `KeyEntry`.
4. `tools/gui-react/src/features/key-finder/state/keyFinderGroupedRows.ts` — propagate field into `KeyEntry`.
5. `tools/gui-react/src/features/key-finder/components/KeyRow.tsx` — new column between `Value` and `Conf`, renders ✓ / — .
6. `tools/gui-react/src/features/key-finder/components/KeyGroupSection.tsx` — header cell "Concrete" with tooltip: *"Concrete evidence — top candidate meets the passenger-exclude thresholds (≥95 conf, ≥3 refs by default). Stricter than Resolved. Peer stops bundling as passenger once this is true."*
7. Optional: filter toolbar — add a `concrete` chip preset (alongside `resolved`, `unresolved`, etc.).

### Tests

- **Backend unit test** — `keyFinderRoutes.summary.test.js` — one new assertion: given a top candidate at `conf=96, evd=4` and knobs at `95 / 3`, `concrete_evidence === true`. One happy path + one edge (knob=0 → `concrete_evidence === false`).
- **Frontend** — no new test required; column rendering is cosmetic on top of the backend boolean.

### Acceptance

- Key with top candidate `conf=95, evd=3` and knobs at default shows ✓ in Concrete column.
- Key with top candidate `conf=94, evd=3` shows —.
- Key with top candidate `conf=95, evd=2` shows —.
- Setting either knob to 0 clears all ✓ marks (column becomes informational only).

---

# DEFERRED WORK (scoped for later)

Each of these deserves its own plan doc when scheduled. Brief scope below so nothing is forgotten.

## Item 5 — Stale-resolved race (loop chain) — ACCEPTED AS-IS 2026-04-23

**Reality:** Multiple async writes from A's LLM call (primary + passenger resolutions for B/C/D) land in some order relative to A's `completeOperation` broadcast. The client's Loop chain advances on completion; `isResolved(B)` may briefly read stale local state before the passenger write is visible, firing one redundant Loop on B.

**Decision:** not fixing. Rare in practice; `reloopRunBudget` backstop limits damage to ~1 extra LLM call per race. User quote 2026-04-23: "this is not an issue its rare and we can afford the next call." Any fix (backend sync, per-step `/summary` round-trip, or backend-driven chain) adds complexity disproportionate to the cost avoided.

**Reopen trigger:** if the rate climbs (e.g., Loop All at scale wastes >N% of calls), revisit with option (2) — frontend `isResolved(B)` hits `GET /summary?field_key=B` directly at decision time.

## Items 6 + 8 — Fan-out orchestration correctness (coupled)

User confirmed 2026-04-23 they plan to flip `groupBundlingOnly=false` — so Item 6 becomes real. Item 8 already matters under `alwaysSoloRun=false`. Both live in the same orchestration layer (`KeyFinderPanel.tsx` + `keyFinderRegistry`) and share the theme *"when chains/dispatches race, make sure `buildPassengers` sees the right registry state."* They'll ship in one plan / PR when scheduled.

### Item 6 — Cross-chain passenger reservation

**Problem:** `loopAllGroups` fires chains for every group concurrently. Between two chains' `buildPassengers` calls, neither has registered yet → both pack the same peer. Tier caps (easy=2, medium=4, hard=6) bound the damage but the first 2/4/6 races still burn redundant LLM calls.

**Race sequence** (with `groupBundlingOnly=false`):
- `t=0ms` Chain_Sensor reads empty registry, picks `buttons_count` as passenger for `polling_rate`.
- `t=0ms` Chain_Buttons reads empty registry, picks `buttons_count` as primary for its own Loop.
- `t=1ms` Both POSTs land, both register. Too late — both LLM calls already fire.

**Result:** `buttons_count` gets resolved twice. Paying double.

**Severity:** only matters at `groupBundlingOnly=false`. User plans to flip this setting.

### Item 8 — Run All hard-first scheduler

**Problem:** `allKeys()` at `KeyFinderPanel.tsx:300-302` returns layout order. `runKeysSequential` dispatches in that order under `alwaysSoloRun=false`. No difficulty-aware reordering → easy primaries can fire first, then when hard/VH primaries fire the passenger pool is drained.

**Intent:** fire hard/VH primaries *first* so easy peers pack *as passengers* on them — better budget usage.

**Severity:** only matters at `alwaysSoloRun=false`.

### Combined fix plan (when scheduled)

1. **Item 8:** sort `allKeys()` and `keysInGroup()` by `difficulty DESC` (very_hard → hard → medium → easy) before `runKeysSequential`. Reuses the rank table from Item 2. ~15 LOC.
2. **Item 6:** extend `runKeysSequential`'s already-working registration-await pattern (waits for `passengersRegistered` per opId) to Loop All's cross-group fan-out. Each chain's first POST registers before the next chain's `buildPassengers` runs. Eliminates the race without a new "planned" primitive in the registry.

**Alternative Item 6 fix (if concurrency across chains is preferred):** add `planned` state to `keyFinderRegistry` with a TTL — `buildPassengers` writes planned entries before returning; next chain's pack sees them and hard-blocks. Diff is larger; pick only if serialized dispatch creates noticeable latency.

**Shared test surface:** `alwaysSoloRun=false` + `groupBundlingOnly=false` fixtures covering sort order + race-free pack across concurrent dispatches.

## Item 7 — Fractional pool/cost + variant scaling bundling

**Problem:**
- `keyBundler.js:31-34` `toIntOrZero` floors bundling cost/pool.
- `FinderSettingsRenderer.tsx:418,438` rounds IntMap values.
- Test `keyBundler.test.js:570` asserts "passenger cost is RAW — no variant scaling regardless of variantCount" as intended design.

User's original requirement: "this should increase the cost of passengers or reduce the primary pool cost, thus making it so runs are more focused, either one works and be in the Bundling options."

**Two sub-items:**
- (a) Introduce `floatMap` registry type; relax integer coercion.
- (b) Add `bundlingVariantScaling` knob with enum `'passengerCost' | 'primaryPool' | 'off'`; multiply cost or divide pool by `variantCount` in `packBundle`.

**Decision needed:** still in scope? If yes, (a) must ship before (b).

## Item 8 — (merged into Items 6 + 8 coupled plan above)

See the combined "Fan-out orchestration correctness" section. Item 8's difficulty-DESC sort on Run All fan-out ships together with Item 6's cross-chain race fix — same orchestration layer, same config gate (`alwaysSoloRun=false` / `groupBundlingOnly=false`), same test surface.

## Item 9 — Prompt tooltip (Run/Loop tooltips unchanged) ✅ SHIPPED 2026-04-23

**Scope narrowing:** original plan was to make Run + Loop tooltips dynamic (branch on `alwaysSoloRun`). Re-scoped — Run/Loop status is already shown live in the **Next bundle** column + **Passengers** column, so a dynamic tooltip duplicates what the grid already tells the user. Only the **Prompt** button tooltip needed to communicate the new always-Loop contract + live-update semantics.

**Changes:**

1. **`tools/gui-react/src/features/key-finder/types.ts:278`** — `TOOLTIPS.keyPrompt` rewritten:
   > "Preview the exact LLM prompt for this key. Always shows the Loop-shape prompt (with passengers) — even while a Run is in flight, and even when alwaysSoloRun is ON (which dispatches solo but we still show the full potential bundle). Live-updates while open: if a peer resolves, the bundling knobs change, or registry state shifts, the modal refetches so you always see the current snapshot."

2. **`tools/gui-react/src/features/data-change/invalidationResolver.js`** — restored the two `['prompt-preview', 'key', CATEGORY_TOKEN]` invalidation entries (under `review-layout` and `settings` domains) that Item 3 removed. **Reason:** `staleTime: 0` alone covers open/close refetch, but does NOT auto-refetch a modal that's already open when underlying data changes. Without these entries the tooltip's "live-updates while open" promise would be a lie. The entries live on both domains because:
   - `review-layout` fires on `process-completed` (peer resolves → passenger set shifts).
   - `settings` fires on `runtime-settings-updated` (bundling knobs change → sort/exclusion logic shifts).

**Flow confirmed:** backend `emitDataChange` → `review-layout` / `settings` domain → frontend `invalidationResolver` → invalidates `['prompt-preview', 'key', <category>]` prefix → react-query refetches every matching open query → modal updates in place.

**Run/Loop tooltips intentionally left static.** The dynamic branching is redundant with existing grid columns.

---

# Completion gates

Before closing this plan:

1. Items 1–4 all shipped with `node --test` green.
2. GUI smoke proof for each primary item (per CLAUDE.md — "GUI proof required for phase completion"):
   - Item 1: Pipeline Settings → Key Finder → set exclude knobs → open Prompt Preview → verify excluded peer not in `passenger_field_keys`.
   - Item 2: trigger a Loop Group → observe easy keys loop first, mandatory-first within tier.
   - Item 3: set knob → reopen preview → verify fresh POST.
   - Item 4: resolve a key with weak evidence → verify Resolved ✓ but Concrete —; run Loop → verify Concrete ✓ once threshold met.
3. Memory note dropped summarizing what shipped and what deferred (for future sessions).

# References

- Audit source: conversation 2026-04-22.
- Related docs (historical, do not modify): `per-key-finder-roadmap.html`, `per-key-finder-open-items-handoff.html`.
- Live code anchors cited throughout above — file:line.
