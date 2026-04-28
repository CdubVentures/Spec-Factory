# Phase 2 — Drop the rest of `component.*` from field rules

**Class:** `[CLASS: BEHAVIORAL]`

## Goal

Remove the remaining `component.*` block from compiled field rules. Flip every consumer (engine, keyFinder readers, workbench, consumer registries) to derive component-parent and component-property relations from `enum.source` + `componentSources` only.

After Phase 2: field rules no longer contain a `component` key at all. The Components panel in the Key Navigator still renders (Phase 3 deletes it) but it pulls from the new derivation.

## Pre-requisite

Phase 1 must be merged. Phase 1 already flipped keyFinder readers to consume `componentSources`. Phase 2 finishes the job for engine and consumer registries.

## Block being removed (final state)

Today's `component` block in compiled rules:
```json
"component": {
  "type": "sensor",
  "source": "component_db.sensor",
  "require_identity_evidence": true,
  "allow_new_components": true,
  "ai": { "mode": "off", "model_strategy": "auto", "context_level": "properties", "reasoning_note": "" },
  "priority": { "difficulty": "medium" }
}
```

Phase 2 removes this entire block. Replacement signals:

| Old read | New read |
|---|---|
| `rule.component` truthy | `rule.enum.source === "component_db." + selfKey` (parent) OR present in `componentSources[X].roles.properties[].field_key` (property) |
| `rule.component.type` | `selfKey` for parents; `ownerKey` (from componentSources lookup) for properties |
| `rule.component.source` | Same as `rule.enum.source` (which already exists) |
| `rule.component.require_identity_evidence` | Implied always-true for component-locked keys |
| `rule.component.allow_new_components` | Implied by `enum.policy` (`open` / `open_prefer_known` = allow new; `closed` = no) |
| `rule.component.ai.*` | Already retired upstream; not used |
| `rule.component.priority.difficulty` | Same as `rule.priority.difficulty` (already top-level) |

## Files touched

### Backend compile pipeline

- `src/ingest/compileFieldRuleBuilder.js`
  - Delete the entire `nestedComponent = {…}` build block (lines ~690-749 after Phase 1)
  - Stop emitting `component` key on output rules
  - Validate: `enum.source` already gets emitted from `nestedEnum` block — no change needed there

- `src/ingest/compileMapNormalization.js`
  - Verify `component_sources[]` validation still fires (`sheet is required when mode=sheet`, etc.). Phase 4 hardens orphan checks; Phase 2 leaves existing checks in place.

- `src/ingest/compileFieldRuleBuilder.js` consumers (compileAssembler, categoryCompile, etc.)
  - Remove any reads of `rule.component.*` in the compile pipeline
  - Field key locking that depended on `rule.component.*` flips to `enum.source` derivation

- `src/db/seed.js`
  - If seed reads `rule.component.type` to populate any SQL column, flip to derive from `enum.source`. (Likely none — seeding pulls from `component_db/<X>.json` directly.)

### Engine

- `src/engine/engineComponentResolver.js`
  - `resolveComponentRef` reads `rule.component.type` and `rule.component_db_ref`. Replace with:
    ```js
    const enumSource = String(rule?.enum?.source || '');
    const dbName = enumSource.startsWith('component_db.')
      ? enumSource.slice('component_db.'.length)
      : '';
    if (!dbName) return { ok: false, reason_code: 'component_db_missing', … };
    ```
  - Drop the `component_db_ref` legacy alias (it's not authored anywhere in field rules; was a back-compat hook)

- `src/engine/fieldRulesEngine.js:485`
  - The site that calls `resolveComponentRef` — gate on the new "is component" derivation: `rule.enum.source.startsWith('component_db.')`

### KeyFinder readers (finalize)

- `src/core/finder/productResolvedStateReader.js`
  - `isParentRule(rule, selfKey)` — flip from `rule.component truthy` to `rule.enum?.source === 'component_db.' + selfKey`. Add `selfKey` parameter.
  - All callers pass selfKey (it's already in the iteration loop at `Object.entries(compiledRulesFields)`)
  - Drop the fallback to `rule.component` from Phase 1

- `src/features/key/keyFinder.js`
  - Already passes `componentSources` after Phase 1 — no further change

### Frontend — workbench

- `tools/gui-react/src/features/studio/workbench/workbenchHelpers.ts`
  - Row builder: drop `componentType: strN(r, 'component.type')` and replace with derivation:
    ```ts
    componentLocked: enumSource === `component_db.${key}`,
    componentType: enumSource.startsWith('component_db.')
      ? enumSource.slice('component_db.'.length)
      : '',  // for parent: equals selfKey; for properties: equals ownerKey; otherwise empty
    ```
  - The reverse `belongsToComponent` lookup (added earlier) keeps working — already sourced from `componentSources`
  - The `propertyVariance` lookup keeps working — already sourced from `componentSources`

- `tools/gui-react/src/features/studio/workbench/workbenchTypes.ts`
  - Add `componentLocked: boolean` field to `WorkbenchRow`
  - `componentType` stays (now means: "the component_db this key references, derived from enum.source")

- `tools/gui-react/src/features/studio/workbench/workbenchColumns.tsx`
  - Add a `Component Lock` column (🔧 if `componentLocked === true`, em-dash otherwise)
  - Place after `componentType` column in Components block
  - Add to `components` preset and `ALL_COLUMN_IDS_WITH_LABELS`

### Frontend — Key Navigator (still passing through, Phase 3 deletes)

- `tools/gui-react/src/features/studio/components/key-sections/bodies/KeyComponentsBody.tsx`
  - Stop reading `currentRule.component.type`. Read from `currentRule.enum.source` (`component_db.<X>` → X is the type).
  - The "Component DB" select dropdown — for now, change source from hardcoded `COMPONENT_TYPES` to dynamic derivation: `componentSources.map(cs => cs.component_type)`. This survives Phase 3 deletion (the picker logic moves to `EditableComponentSource` in Phase 3).
  - Cascade behavior preserved: setting "Component DB = sensor" on a key currently writes `component.type = sensor` and `enum.source = component_db.sensor`. Flip to writing **only** `enum.source = component_db.sensor` (since `component.*` no longer exists).

- `tools/gui-react/src/features/studio/state/fieldCascadeRegistry.ts`
  - Cascade rule `component.type → enum.source/policy` becomes `enum.source change → cascade contract.type=string, shape=scalar` (component-lock auto-coercion). Update or replace cascade entry.

### Consumer registries

- `src/field-rules/consumerBadgeRegistry.js`
  - Delete entries for `component.type`, `component.source`, `component.require_identity_evidence`, `component.allow_new_components`, `component.ai.*`, `component.priority.*`

- `src/field-rules/consumerGate.js`
  - Delete corresponding path entries

### Tests

- `src/features/category-audit/tests/perKeyDocStructure.test.js` — uses `component.type` in fixtures; flip to `enum.source`
- `src/features/category-audit/teaching.js` and tests — same flip
- `src/features/category-audit/perKeyDocStructure.js` — flip reads
- `src/ingest/tests/mouse.compile.field-overrides.test.js` — fixtures + assertions on emitted `component` block; remove the assertions
- `src/ingest/tests/mouse.compile.component-properties.test.js` — flip
- `src/ingest/tests/componentOnlyPromotion.contract.test.js` — flip
- `src/db/tests/monitor.contract.test.js`, `keyboard.contract.test.js` — flip
- `src/features/studio/api/tests/studioShapeGoldenMaster.test.js` — golden-master will need regeneration; document the diff (component block removed)
- `src/shared/tests/fixtures/phase1-pre-migration/field_rules.mouse.snapshot.json` — historical fixture; either keep as-is (it's pre-migration) or update with note
- `src/features/publisher/validation/tests/checkEnum.policyDriven.characterization.test.js` — verify still green (uses `enum.source`)
- `tools/gui-react/src/features/studio/__tests__/fieldCascadeRegistry.test.js` — update cascade test fixtures
- `tools/gui-react/src/features/studio/state/__tests__/egLockGuards.test.js` — verify lock paths still work
- `tools/gui-react/src/features/studio/components/EditableComponentSource.tsx` (Phase 3 will rewrite this; Phase 2 leaves it functional but its Component Type picker may need to flip from hardcoded COMPONENT_TYPES too — defer unless it breaks builds)

### Generated artifacts (regenerate after Phase 2 merges)

- `category_authority/mouse/_generated/field_rules.json` — `component` block deleted everywhere
- `category_authority/keyboard/_generated/field_rules.json`
- `category_authority/monitor/_generated/field_rules.json`

Diff vs Phase 1 output: only `component.*` removal. No other fields touched.

## Validation steps

1. `npx tsc --noEmit` clean
2. All targeted tests green
3. Rebuild mouse → diff `field_rules.json` vs Phase-1 output → only `component.*` keys removed
4. Run a full keyFinder Run on a property field (e.g., `dpi`) → prompt preview unchanged from Phase 1 (variance label still present, relation pointer still rendered)
5. Run engineComponentResolver test suite → green; resolver returns same canonical_name resolutions as Phase 1
6. Open Key Navigator on a component-parent key (e.g., `sensor`) → Components panel shows the right type in the dropdown (now derived from `componentSources`); editing it cascades correctly
7. Workbench: new `Component Lock` 🔧 column appears for keys that reference themselves via `enum.source`; `Belongs To` and `Variance` columns continue working

## Risks

**Schema migration risk:** `field_rules.json` is a generated artifact, but other code might historically read `rule.component`. Phase 2 flips every reader I can find via grep. If a hidden reader exists (unlikely after Phase 1's keyFinder flip), the symptom is a TypeError in production after compile. Mitigation: dual-emit during Phase 2 — emit BOTH the old `component.*` block AND the new derivation for one release, then drop the old. **Rejected** as overkill given the scope and the user's `feedback_no_legacy.md` rule (no backwards-compat fallbacks).

**Cascade regression:** `fieldCascadeRegistry` rule for "select component type → set enum.source" is the most fragile cascade in the system. Verify with the full `egLockGuards` + `fieldCascadeRegistry` test suite after the cascade flip.

## Out of scope

- Deleting the Components panel from Key Navigator — Phase 3
- Adding `enum.pattern` field — Phase 3
- Compile-time orphan validation — Phase 4
- The `EditableComponentSource` Component Type picker rewrite — Phase 3 (Phase 2 leaves the form usable with whatever picker exists)

## Estimated touches

~20 files modified, 3 generated files regenerated, ~12 test files updated. Single commit.
