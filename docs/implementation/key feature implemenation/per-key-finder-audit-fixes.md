# Per-Key Finder Audit Fixes — Work Plan

**Source:** audit findings 2026-04-22, cross-verified by two independent audits against live code.
**Scope:** four primary fixes locked to ship in order; five deferred items scoped for a follow-up pass.
**Working contract:** each primary item gets its own `[STATE: MACRO-RED]` → `[STATE: MACRO-GREEN]` cycle per CLAUDE.md. Deferred items get their own plan docs when scheduled.

---

## Order of work

| # | Status | Item | Diff size |
|---|---|---|---|
| 1 | PRIMARY | Wire `passengerExclude*` knobs + change defaults to 95 / 3 | small |
| 2 | PRIMARY | Sort order: difficulty → required → availability | small |
| 3 | PRIMARY | Prompt Preview — live snapshot, no cache | tiny |
| 4 | PRIMARY | "Concrete Evidence" column on key row | small-medium |
| 5 | DEFERRED | Stale-resolved race (loop chain) | medium |
| 6 | DEFERRED | Cross-chain passenger reservation | medium |
| 7 | DEFERRED | Fractional pool/cost + variant scaling bundling | medium-large |
| 8 | DEFERRED | Run All scheduler (hard-first firing) | medium |
| 9 | DEFERRED | Dynamic Run tooltip | tiny |

---

# PRIMARY WORK

## Item 1 — Wire `passengerExclude*` knobs + defaults 95 / 3

### Problem

The two Pipeline Settings knobs `passengerExcludeAtConfidence` and `passengerExcludeMinEvidence` exist in the registry and `buildPassengers` reads them, but the three orchestrators that construct the `settings` object never include them. `Number(undefined) || 0` → feature permanently disabled regardless of what the user sets in the GUI.

### Context

- Knobs defined: `src/core/finder/finderModuleRegistry.js:637-642`
- Read site: `src/features/key/keyPassengerBuilder.js:63-80` (the "good enough" exclusion path)
- Dead settings builders:
  - `src/features/key/keyFinder.js:155-177` — live Run/Loop
  - `src/features/key/keyFinderPreviewPrompt.js:61-81` — Prompt Preview
  - `src/features/key/api/keyFinderRoutes.js:163-183` — `/summary` + `/bundling-config`

### Target behavior

A peer is dropped from the passenger pool when **both** are true:
- `top_candidate.confidence >= passengerExcludeAtConfidence`
- `top_candidate.evidence_count >= passengerExcludeMinEvidence`

Below either threshold, peers keep retrying as passengers. When both knobs are 0, only published peers are dropped (legacy behavior).

### Changes

1. **Registry defaults** — `src/core/finder/finderModuleRegistry.js:637,640`
   - `passengerExcludeAtConfidence`: default `0` → `95`
   - `passengerExcludeMinEvidence`: default `0` → `3`
2. **Seed file** — `category_authority/_global/key_finder_settings.json`
   - Update both values so existing installs pick up the new defaults on next rebuild.
3. **Wire into `keyFinder.js` settings bundle** (after `budgetFloor` line, before the bundling block)
   ```js
   passengerExcludeAtConfidence: parseInt(readKnob(finderStore, 'passengerExcludeAtConfidence') || '95', 10),
   passengerExcludeMinEvidence: parseInt(readKnob(finderStore, 'passengerExcludeMinEvidence') || '3', 10),
   ```
4. **Wire into `keyFinderPreviewPrompt.js` `readSettings`** — same two lines.
5. **Wire into `keyFinderRoutes.js` `readBundlingSettings`** — same two lines (summary and `/bundling-config`).
6. **Surface on `/bundling-config` response** — add `passengerExclude: { atConfidence, minEvidence }` to the JSON payload so the GUI can render the values in the `KeyBundlingStrip`.
7. **GUI read path** — `KeyBundlingStrip.tsx` displays the exclude thresholds alongside pool/cost. Tooltip explains "peers stop riding once resolved confidence ≥ X AND evidence ≥ Y."

### Tests (CLAUDE.md [CLASS: BEHAVIORAL])

Test budget per CLAUDE.md boundary-contract rule: exclude knobs are a boundary between settings → bundler, so full matrix required at the `buildPassengers` level (already tested). What's new is the **wiring** — treat it as an internal contract change, not a fresh boundary.

- **New: `keyFinder.bundling.test.js`** — one integration test per orchestrator (runKeyFinder, preview, summary) asserting a peer at `conf=96, evd=4` is excluded when the knobs are set. One happy path each. No exhaustive matrix at this layer.
- **Regression gate:** run the existing `keyPassengerBuilder.test.js` suite — must stay green.

### Acceptance

- Setting `passengerExcludeAtConfidence=95` + `passengerExcludeMinEvidence=3` in the GUI drops a peer with top candidate at `conf=96, evd=4` from the next Run's bundle, the Prompt Preview's passenger list, and the summary row's `bundle_preview`.
- Setting either knob to `0` restores legacy behavior (only published peers excluded).
- Fresh install seeds with 95 / 3 defaults.

---

## Item 2 — Sort order: difficulty → required → availability

### Problem

Current sort in `keyBundler.js:104-120` and `keyFinderGroupedRows.ts:109-124` orders by `required_level → availability → difficulty`. User's intent per original brief: difficulty first (easy-first packing maximizes keys-per-call), then required, then availability.

### Rationale (recorded for future readers)

With `passengerDifficultyPolicy='less_or_equal'`, a medium primary's eligible peers are {easy, medium}. Easy-first packing fills the pool with cheap (cost=1) passengers → more keys per call → hard/VH primaries stay lean. Matches user's original brief: "use all the ride-along budgets with easy keys so hard and very hard keys get focused runs."

Within a difficulty tier:
- Mandatory before non-mandatory — don't strand required keys.
- Always before rare — as final tiebreaker.

### Changes

1. **`src/features/key/keyBundler.js:104-120`** — swap the first three sort predicates:
   ```js
   // Was: required → availability → difficulty → currentRides → fieldKey
   // Now: difficulty → required → availability → currentRides → fieldKey
   ```
2. **`tools/gui-react/src/features/key-finder/state/keyFinderGroupedRows.ts:109-124`** — same swap on `sortKeysByPriority`. This is the Loop Group chain order — easy keys loop first since they resolve fastest.
3. **Update bundler header comment** on `keyBundler.js:98-103` to reflect the new order and the rationale.

### Tests

- **`keyBundler.test.js` sort tests** — rewrite expected orderings in the existing sort tests. The count stays the same; just the expected order changes.
- **`keyFinderGroupedRows.test.ts` / `runLoopChain.test.ts`** — if either tests the Loop chain order, update expectations.

### Acceptance

- Given two same-difficulty peers (one mandatory, one non-mandatory), mandatory packs first (unchanged within tier).
- Given two peers {easy-non_mandatory, medium-mandatory} and a hard primary, easy non-mandatory packs first (this is the behavior change — was medium-mandatory first).
- Loop Group chains start with the easiest unresolved key.

---

## Item 3 — Prompt Preview live snapshot

### Problem

`promptPreviewQueries.ts:44` uses `staleTime: 60_000`. A peer Run that starts between two preview clicks changes the registry (hard-block + cap state) but doesn't invalidate the preview cache → user sees a passenger list that doesn't match what the live Run would send.

User requirement: "anytime you click prompt preview it should show what would be sent at the moment in time."

### Changes

1. **`tools/gui-react/src/features/indexing/api/promptPreviewQueries.ts:44`** — set `staleTime: 0` so every modal open refetches.
2. **Verify `refetchOnMount`** defaults (should be `'always'` or `true` after step 1 — confirm react-query behavior).
3. **`tools/gui-react/src/features/data-change/invalidationResolver.js`** — can drop the prompt-preview entry from the `settings` domain template now that staleTime=0 handles freshness. Optional cleanup.

### Tests

Per CLAUDE.md test budget: this is a cache-config change, behavior-observable at the UI layer. Not a logic branch — no new unit test required. Manual smoke proof (GUI checkpoint) is sufficient.

### Acceptance

- Open Prompt Preview for key A → close → immediately reopen → a new POST fires and the response reflects the current registry state.
- Setting a bundling knob while the modal is open → close + reopen → preview reflects the new knob.

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

## Item 5 — Stale-resolved race (loop chain)

**Problem:** `fireAndForget.js:79-83` emits `completeOperation` broadcast before `emitChange`. Client's loop chain advances on the first event, reads stale `groupedRef` before summary query refetches → fires a redundant Loop on an already-resolved key. Backend `reloopRunBudget=1` catches it (1 wasted LLM call, not catastrophic).

**Severity:** low. `reloopRunBudget` backstop limits blast radius.

**Decision needed:** worth fixing? Three approaches:
- (a) Swap emit order in `fireAndForget.js` (changes contract for all finders).
- (b) `runLoopChain` awaits both terminal status AND fresh summary refetch.
- (c) `isResolved` queries backend directly instead of reading `groupedRef`.

## Item 6 — Cross-chain passenger reservation

**Problem:** `loopAllGroups` fires chains for every group concurrently. Registry has no "planned" state — first-wave POSTs can race and double-pack the same peer across groups.

**Severity:** only matters when `groupBundlingOnly=false`. Current workspace setting is `true` → no user impact today.

**Decision needed:** fix now or defer until `groupBundlingOnly=false` becomes common?

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

## Item 8 — Run All scheduler (hard-first firing)

**Problem:** `allKeys()` at `KeyFinderPanel.tsx:300-302` returns layout order. `runKeysSequential` dispatches in that order under `alwaysSoloRun=false`. No difficulty-aware reordering → hard/VH primaries fire in whatever order Field Studio happens to have them.

User's original requirement: "hard and very hard keys get focused runs with no additional keys… the bundler should try and use all the ride-along budgets with easy keys."

**Note:** DIFFERENT from Item 2's passenger sort. Item 2 is which PEER packs into a bundle; Item 8 is which KEY fires as PRIMARY first. Ordering under `alwaysSoloRun=false` + Run All should be difficulty DESC (very_hard → easy) so hard primaries pack easy peers before easy keys become primaries themselves.

**Decision needed:** confirm and implement.

## Item 9 — Dynamic Run tooltip

**Problem:** `types.ts:241` `TOOLTIPS.keyRun` is static: "Focused key run — one LLM call for this key only. … never bundles passengers when that knob is on." Current workspace has `alwaysSoloRun=false` — tooltip lies to users.

**Fix:** read `alwaysSoloRun` in `KeyRow.tsx` (via `useKeyFinderBundlingConfigQuery`, already fetched at panel level) and branch tooltip copy:
- `alwaysSoloRun=true` → "Focused key run — one LLM call for this key only. Never bundles passengers."
- `alwaysSoloRun=false` → "Run — packs passengers per bundling settings. Click multiple times to queue."

**Diff:** ~15 lines. Trivial.

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
