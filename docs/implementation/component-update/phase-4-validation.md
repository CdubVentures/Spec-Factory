# Phase 4 — Validation hardening

**Class:** `[CLASS: BEHAVIORAL]`

## Goal

Close the integrity loop. Compile-time checks ensure every component_sources entry has a matching field rule and vice versa. Lock-guard polish so the contract is unforgeable from the UI.

## Pre-requisites

Phase 1 + 2 + 3 merged. The new model is the only model. UI shows the lock state. Field rules no longer carry `component.*`.

## What Phase 4 enforces

Three invariants:

**INV-1: Every `component_sources[X]` has a matching field rule.**
For every entry with `component_type: X`, there must exist a key `X` in `field_rules.json` with `enum.source === "component_db." + X`.

**INV-2: Every component-locked field rule has a matching component_sources entry.**
For every key `X` where `rule.enum.source === "component_db." + X`, there must exist a `component_sources[]` entry with `component_type: X`.

**INV-3: Every property field_key in component_sources is a real field rule.**
For every `component_sources[X].roles.properties[].field_key`, the field rule must exist.

(INV-3 already partially exists in `compileMapNormalization.js` — verify and harden.)

## Files touched

### Compile validation

- `src/ingest/compileMapNormalization.js`
  - Add INV-1 check: for each `component_sources[]` entry, verify `compiledRulesFields[X]` exists AND `compiledRulesFields[X].enum?.source === "component_db." + X`. Push to `errors` if not.
    - Error message: `component_sources[<X>]: matching field rule "<X>" missing or has wrong enum.source (expected "component_db.<X>")`
  - Add INV-2 check: scan `compiledRulesFields` for keys with `enum.source` starting with `component_db.`. For each, verify a matching `component_sources[]` entry exists.
    - Error message: `field_rule[<X>]: enum.source = "component_db.<X>" but no component_sources entry for "<X>"`
  - Verify INV-3 already exists. If not, add: for each `component_sources[X].roles.properties[]`, verify `compiledRulesFields[field_key]` exists.

- `src/ingest/categoryCompile.js`
  - Surface validation errors at the same severity as existing checks
  - The compile fails if INV-1/2/3 violated

### Frontend lock-guard hardening

- `tools/gui-react/src/features/studio/state/useFieldRulesStore.ts` (or wherever updateField guard lives)
  - Build a unified `isComponentLocked(rule, selfKey)` helper:
    ```ts
    function isComponentLocked(rule: Record<string, unknown>, selfKey: string): boolean {
      const source = strN(rule, 'enum.source');
      return source === `component_db.${selfKey}`;
    }
    ```
  - Editable paths under component-lock (intersect with EG-editable if both apply):
    ```
    enum.policy
    enum.pattern
    priority.required_level
    priority.availability
    priority.difficulty
    ai_assist.reasoning_note
    ai_assist.variant_inventory_usage
    ai_assist.pif_priority_images
    evidence.min_evidence_refs
    evidence.tier_preference
    ui.label
    ui.tooltip_md
    ui.aliases
    aliases
    search_hints.domain_hints
    search_hints.content_types
    search_hints.query_terms
    constraints
    ```
  - All other writes (especially `contract.*`, `enum.source`, `enum.allow_*`) silently dropped with a console warning

- `tools/gui-react/src/features/studio/state/__tests__/egLockGuards.test.js`
  - Add a parallel `componentLockGuards.test.js` (or extend existing) with the same coverage matrix
  - Test the EG ∩ Component intersection (a key locked by both pathways)

### Workbench surface

- Optional polish: workbench `componentLocked` column already shows 🔧. Add a tooltip explaining "Locked by Field Studio Map. Edit there to change."

### Component Review page (sanity check)

- Verify any cross-check the review page does between SQL + field rule still works under the new model
- If there's a check like "does dpi's rule confirm it's a sensor property?", flip from `rule.component?.type` to derivation:
  ```ts
  const isSensorProperty = strN(rule, 'enum.source') === 'component_db.sensor';
  ```

### Migration helpers

- One-time pre-flight script (not a test) to run before merging Phase 4:
  ```
  scripts/audits/component-orphan-check.js
  ```
  - Scans every category's field_rules.json + field_studio_map.json
  - Reports INV-1/2/3 violations
  - User runs once, fixes any orphans (manually edit field_studio_map or rules), then merges Phase 4
  - **Goal:** no surprise compile failures after Phase 4 lands

### Tests

- New tests for INV-1, INV-2, INV-3 in compile validation
- Component lock guard tests
- Component lock + EG lock intersection tests
- Compile a fixture category with a deliberate orphan → compile fails with the right error message

## Validation steps

1. Run the migration helper script across all 3 categories — expect 0 violations (we should already be clean from Phase 3 work)
2. `npx tsc --noEmit` clean
3. All targeted tests green
4. Try a deliberate orphan in a fixture: add `component_sources[{type: "ghost"}]` with no matching field rule → compile errors out with `INV-1 violation: matching field rule "ghost" missing`
5. Try the reverse: set `enum.source = "component_db.ghost"` on a key with no matching component_sources entry → compile errors with INV-2 violation
6. GUI smoke:
   - Try to write `contract.type` on a component-locked key from the workbench → write silently dropped (or rejected with a console warning)
   - Try to delete a component-locked key from the Key Navigator → deletion blocked with a message pointing at Field Studio Map

## Risks

**Migration pain:** if existing field_studio_map.json files have any orphan entries (component_sources without matching rules, or rules with stale `component.type` after Phase 2's strip), compile will fail after Phase 4. Mitigation: the pre-flight script.

**Generated `field_rules.json` already mostly clean** — Phase 2 regenerates them, so by the time Phase 4 lands, the rules and component_sources are already in sync. The only orphan risk is if a category has historical drift from manual edits — the pre-flight script catches this.

## Out of scope

- Migration UI to auto-fix orphans — manual fix expected (rare case)
- Hard delete cascade (deleting `component_sources[X]` auto-resets the matching field rule) — Phase 3 already does this for the auto-link path; Phase 4 leaves manual delete as user-driven

## Estimated touches

~6 files modified, ~3 test files added, 1 new migration script. Single commit.

## Definition of done

After Phase 4:
- The 3 invariants are enforced at compile time
- The component lock state is unforgeable from the UI (writes to locked paths are dropped)
- The pre-flight migration helper confirms 0 orphans across all categories
- The full plan from `README.md` is delivered: enum.source is the only linkage, components are derived not stored, prompts byte-identical (with variance label enhancement), Components panel gone from Key Navigator, drawer is 8 tabs, Match Settings retired, monitor's `panel` works
