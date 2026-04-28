# Phase 1 — Match Settings + `component.match.*` retirement

**Class:** `[CLASS: RETIREMENT]`

## Goal

Remove the entire `component.match.*` plumbing end-to-end. Engine keeps inline defaults so runtime behavior is unchanged. KeyFinder readers are flipped to source `property_keys` from `componentSources` so they survive Phase 2's deeper strip.

**Self-contained:** prompts byte-identical (optional variance label is added as part of this phase since the data is now flowing from `componentSources`); runtime defaults match historical values; no behavior change observable from outside.

## Context refresher

`component.match.*` carries 5 numeric knobs + a property_keys list:
- `fuzzy_threshold` (default 0.75)
- `name_weight` (default 0.4)
- `property_weight` (default 0.6)
- `auto_accept_score` (default 0.95)
- `flag_review_score` (default 0.65)
- `property_keys[]` (list of subfield field_keys for this component)

Engine reads them via `engineComponentResolver.js:84-93`. Every field rule in `_generated/field_rules.json` has the *exact same* default values. Engine has the same defaults baked in. So the knobs are dead — collapsing to inline defaults is a no-op.

`property_keys[]` IS used (by keyFinder readers) but it's also derivable from `componentSources[<owner>].roles.properties[].field_key` — same data, two homes. Phase 1 switches keyFinder to read from `componentSources`.

## Files touched

### Frontend (delete UI)

- `tools/gui-react/src/features/studio/components/key-sections/bodies/KeyComponentsBody.tsx`
  - Delete the entire `Match Settings` block (Name Matching grid + Property Matching grid + property keys widget). KEEP the top "Component DB" select for now (Phase 3 deletes the whole body).
- `tools/gui-react/src/features/studio/state/studioNumericKnobBounds.ts`
  - Delete `STUDIO_COMPONENT_MATCH_DEFAULTS` constant
  - Delete `componentMatch` entry from `STUDIO_NUMERIC_KNOB_BOUNDS`
- `tools/gui-react/src/utils/studioConstants.ts`
  - Delete tooltip strings: `comp_match_fuzzy_threshold`, `comp_match_name_weight`, `comp_match_property_weight`, `comp_match_auto_accept_score`, `comp_match_flag_review_score`, `comp_match_property_keys`
- `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
  - Delete `matchCfgSummary` field from `WorkbenchRow`
- `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
  - Delete `formatMatchCfg` helper
  - Delete `STUDIO_COMPONENT_MATCH_DEFAULTS` import
  - Drop the `matchCfgSummary:` line from row builder
- `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
  - Delete `matchCfgSummary` column def
  - Drop `matchCfgSummary` from `components` preset and from `ALL_COLUMN_IDS_WITH_LABELS`
  - Drop the cell renderer if dead

### Backend (compile + engine + consumers)

- `src/ingest/compileFieldRuleBuilder.js:706-749`
  - Delete the `nestedComponent.match = {…}` block emission. Stop reading `matchInput.fuzzy_threshold` etc. Compile output no longer carries `component.match`.
- `src/engine/engineComponentResolver.js:80-150` (approx)
  - Replace `matchConfig.X ?? defaultX` reads with inline constants:
    ```
    const FUZZY_THRESHOLD = 0.75;
    const NAME_WEIGHT = 0.4;
    const PROP_WEIGHT = 0.6;
    const AUTO_ACCEPT = 0.95;
    const FLAG_REVIEW = 0.65;
    ```
  - Delete the property-aware tiered scoring block that uses `matchConfig.property_keys`. Replace with the simpler exact + plain-fuzzy resolution path. Keep the function signature stable.
- `src/field-rules/consumerBadgeRegistry.js`
  - Delete the 5 entries with `path: 'component.match.<knob>'` (lines ~386, 392, 406, 412, 418)
- `src/field-rules/consumerGate.js`
  - Delete the 5 entries in the path map for `component.match.<knob>` (lines 53-57)

### KeyFinder readers (flip to componentSources)

- `src/core/finder/productResolvedStateReader.js`
  - `buildComponentRelationIndex(compiledRulesFields)` — change signature to `buildComponentRelationIndex(compiledRulesFields, componentSources)`. Read property_keys from `componentSources[<X>].roles.properties[].field_key` instead of `rule.component.match.property_keys`.
  - `resolveProductComponentInventory({…, componentSources})` — same flip on lines 78-80.
  - `isParentRule(rule)` — for now, keep `rule.component` truthy check as fallback; Phase 2 flips it to `enum.source`.
  - **NEW**: when building the inventory subfield list, also include `variancePolicy` per subfield — read from the same `componentSources` properties array. Apply the numeric-only collapse (`upper_bound`/`lower_bound`/`range` → `authoritative` for non-numeric subfield contracts).

- `src/features/key/keyLlmAdapter.js:125-150` (`buildProductComponentsBlock`)
  - Render the new variance label inline:
    ```
    sensor: Hero 25K
      dpi: 25000   (upper_bound — products can be lower)
      ips: 650     (upper_bound)
      sensor_type: optical   (authoritative)
    ```
  - Variance suffix mapping:
    - `authoritative` → `(authoritative)`
    - `upper_bound` → `(upper_bound — products can be lower)`
    - `lower_bound` → `(lower_bound — products can be higher)`
    - `range` → `(range — products must fall within)`
    - `override_allowed` → `(override allowed)`

- `src/features/key/keyFinder.js:44-48`
  - Pass `componentSources` through to `buildComponentRelationIndex` and `resolveProductComponentInventory`. Source: `compiledRulesFields._meta?.component_sources` OR a separate read from the field_studio_map (find existing wiring; don't add new I/O).

### Tests

- `src/engine/tests/engineComponentResolver.test.js`
  - Drop tests that exercise `matchConfig.property_keys`-driven tiered scoring (those are dead)
  - Add a test confirming inline defaults yield same scores as before for happy-path fixtures
- `src/features/key/tests/keyLlmAdapter.test.js`
  - Update fixtures: `productComponents[].subfields[]` now carries `variancePolicy` per entry; assert variance label appears in rendered prompt block
  - Drop any assertions that depended on `rule.component.match.property_keys` reads
- `src/features/key/tests/keyFinderPreviewPrompt.test.js`
  - Same fixture flip
- `src/core/finder/tests/` (whatever exercises `buildComponentRelationIndex` / `resolveProductComponentInventory`)
  - Update fixtures to pass `componentSources`
- `tools/gui-react/src/features/studio/workbench/__tests__/studioWorkbenchContracts.test.js`
  - Drop `matchCfgSummary` from the new-column-ids assertion list
- Compile pipeline tests under `src/ingest/tests/`
  - Any that snapshot field_rules output with `component.match` → regenerate snapshots

### Generated artifacts (regenerate)

- `category_authority/mouse/_generated/field_rules.json`
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/monitor/_generated/field_rules.json`

After code changes, rebuild each category. The `component.match` block will simply not appear in the new output. Diff should be limited to `component.match` removal — no other fields touched.

## Validation steps

1. `npx tsc --noEmit` (gui-react) — clean
2. `node --test src/engine/tests/engineComponentResolver.test.js` — green
3. `node --test src/features/key/tests/keyLlmAdapter.test.js` — green
4. `node --test src/features/key/tests/keyFinderPreviewPrompt.test.js` — green
5. `node --test src/core/finder/tests/` (relevant) — green
6. Targeted workbench tests — green
7. Rebuild mouse field rules; diff `category_authority/mouse/_generated/field_rules.json` — confirm only `component.match` deletions
8. GUI smoke (per `feedback_test_indexlab_via_gui`):
   - Open a key with `component.type` set in Key Navigator → Match Settings section gone, rest of Components panel intact
   - Open the workbench drawer for that key → no Match Cfg column, drawer Components tab still works (Phase 3 deletes it)
   - Run a per-key finder on a property field (e.g., `dpi`) → variance label appears in PRODUCT_COMPONENTS block in prompt preview

## Out of scope

- Removing `component.type`, `component.source`, `component.allow_new_components`, `component.require_identity_evidence`, `component.ai`, `component.priority` from rules — Phase 2
- Removing the Components panel from Key Navigator — Phase 3
- `enum.pattern` — Phase 3
- Orphan validation — Phase 4

## Estimated touches

~12 files modified, 3 generated files regenerated, ~6 test files updated. Single commit, single class.
