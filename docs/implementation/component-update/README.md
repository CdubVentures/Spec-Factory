# Component Update — Phase 0 Overview

Author: 2026-04-27. SSOT for the 4-phase component-model alignment.

## Why this exists

The "component" concept is currently spread across three layers tied by **naming convention only, not by code**:

```
field_rules.json[<key>]                   field_studio_map.component_sources[]    _generated/component_db/<key>.json
─────────────────────────                 ──────────────────────────────────       ─────────────────────────────
"sensor": {                               { component_type:"sensor",               [{ canonical_name:"Hero 25K",
  component:{ type:"sensor",                sheet:"sensors",                          maker:"Logitech",
              source:"component_db.sensor",  roles:{ properties:[                     properties:{dpi:25000,…}}]
              match:{ fuzzy_threshold,…,     {field_key:"dpi",
                      property_keys:[…]}},    variance_policy:"upper_bound"},
  enum:{ source:"component_db.sensor",      …]}}
         policy:"open" } }
```

- A field rule with `component.*` set declares *"this key references component_db.<X>"*.
- A `component_sources[]` entry declares *"component <X> data lives in this sheet, with these properties"*.
- The `component_db/<X>.json` is the runtime data, regenerated from the sheet.

These three names must stay in sync. **Today nothing enforces it.** Symptoms:
- `COMPONENT_TYPES = ['sensor','switch','encoder','material']` is a hardcoded UI list in `tools/gui-react/src/utils/studioConstants.ts:15` — monitor uses `panel`, which is not in the list, so monitor's component type picker is broken.
- Adding a `component_sources[]` row doesn't auto-update the matching field rule. You can save a row that 400s on compile (`sheet is required when mode=sheet`) because the form lets you submit a half-filled state.
- `Match Settings` (5 weight knobs: fuzzy_threshold, name_weight, property_weight, auto_accept_score, flag_review_score) are wired into the runtime `engineComponentResolver.js` but **every field uses defaults** — no one has ever customized. Dead UX surface area.
- `keyFinder` LLM prompt readers source property_keys from `rule.component.match.property_keys` — same data is also in `componentSources[].roles.properties[]`. Two sources, drift-prone.

## Target model

**One linkage: `enum.source = "component_db.<key>"`.**

```
field_rules.json[<key>]                   field_studio_map.component_sources[]    component_db/<key>.json
─────────────────────────                 ──────────────────────────────────      ───────────────────────
"sensor": {                               { component_type:"sensor",              (unchanged — runtime data)
  enum:{ source:"component_db.sensor",      sheet:"sensors",
         policy:"open",                     roles:{ properties:[
         pattern:"^[A-Z]{3,4}\\d{4,5}$"      {field_key:"dpi",
       },                                     variance_policy:"upper_bound"},
  contract:{ type:"string",                  …]}}
             shape:"scalar" }}
```

- A key is **a component** iff `enum.source === "component_db." + selfKey`.
- A key is **a property of a component** iff `enum.source === "component_db." + ownerKey` (and `ownerKey !== selfKey`). Owner is whichever `component_sources[X]` has the key listed in its `roles.properties[].field_key`.
- The `component.*` block on field rules is **deleted entirely**.
- A new `enum.pattern` regex field is added for live-validation of values against a pattern (useful for component name formats like `^[A-Z]{3,4}\d{4,5}$`).

## What goes away

| Item | Reason |
|---|---|
| `component.*` block on field rules (type, source, match.*, ai, priority, allow_new_components, require_identity_evidence) | `enum.source` carries the linkage; everything else is dead or duplicated |
| Match Settings UI (5 knobs + Property Weight + Property Keys widget) | Engine has inline defaults; no field has ever been customized |
| `engineComponentResolver` property-aware tiered scoring | Reads `component.match.*` which is going away; collapse to plain exact + simple fuzzy |
| Key Navigator "Components" panel (`KeyComponentsBody`, `KeyComponentsSection`) | Component setup moves to Field Studio Map only |
| Workbench drawer "Components" tab | Drops 9 → **8 tabs** |
| Workbench `Component` column + `Match Cfg` column | Replaced by `componentLocked` 🔧 derivation from `enum.source` |
| Hardcoded `COMPONENT_TYPES` array in `studioConstants.ts` | Replaced by dynamic derivation from `component_sources[].component_type` |
| `consumerBadgeRegistry` + `consumerGate` entries for `component.*` | Sources are gone |

## What stays / is added

| Item | Notes |
|---|---|
| `component_sources[]` in field_studio_map | **Authoritative source** of which keys are components and what properties they have |
| `component_db/<X>.json` files | Unchanged — regenerated from sheets on compile |
| SQL tables `component_identity`, `component_values`, `item_component_links` | Unchanged — seeded from `component_db/<X>.json` |
| Component Review page | Unchanged — reads from SQL tables; no field-rule cross-check needed |
| keyFinder prompt slots `PRIMARY_COMPONENT_KEYS`, `ADDITIONAL_COMPONENT_KEYS`, `PRODUCT_COMPONENTS` | Same string output, sourced differently |
| **Variance label per subfield in `PRODUCT_COMPONENTS`** (NEW) | Adds `(upper_bound)` etc. inline so LLM understands product-level overrides |
| `enum.pattern` regex field | New knob, editable in Enum panel, live-validates the rendered preview value |
| Component lock state on a key | Derived: `enum.source === "component_db." + selfKey`. Locks `contract.type/shape`, `enum.source`, every contract knob — leaves `enum.policy`, `enum.pattern`, plus standard non-component fields editable |
| 🔧 badge in workbench (`componentLocked` column) and Key Navigator Enum panel | Visual signal of lock state |
| "Component Property Key" label | Read-only label under `enum.source` field in Enum panel when source matches `component_db.*` |

## Phase index

| Phase | Class | Goal | File |
|---|---|---|---|
| 1 | RETIREMENT | Match Settings + `component.match.*` retirement; collapse engine resolver to inline defaults; rewrite keyFinder readers to use `componentSources` for property_keys | [phase-1-match-retirement.md](phase-1-match-retirement.md) |
| 2 | BEHAVIORAL | Drop rest of `component.*` from field rules; flip workbench/keyFinder/engine consumers to derive from `enum.source` + `componentSources` | [phase-2-component-strip.md](phase-2-component-strip.md) |
| 3 | BEHAVIORAL | UI restructure: delete Components panel/tab (drawer 9→8); EnumConfigurator lock display; EditableComponentSource auto-link + key-picker; add `enum.pattern`; sheet-required form fix | [phase-3-ui-restructure.md](phase-3-ui-restructure.md) |
| 4 | BEHAVIORAL | Compile-time orphan validation both directions; updateField lock guard for component-locked keys | [phase-4-validation.md](phase-4-validation.md) |

**Independence:** Each phase ships independently. After Phase 1, prompts are byte-identical, runtime defaults intact. After Phase 2, field rules are smaller but UI still shows old Components panel pulling from the new source. Phase 3 is the user-visible cleanup. Phase 4 closes the integrity loop.

## Cross-category inventory

| Category | Components (component_type values) | Field-rule keys exist? | In hardcoded `COMPONENT_TYPES`? |
|---|---|---|---|
| Mouse | sensor, switch, encoder | ✓ | ✓ ✓ ✓ |
| Keyboard | switch | ✓ | ✓ |
| Monitor | panel | ✓ | ✗ **broken today** |

After this update: dynamic derivation unblocks monitor; all categories pull from one source.

## Prompt content under the new model

**Today** the keyFinder prompt has 3 component slots:

- `PRIMARY_COMPONENT_KEYS` — relation pointer ("This key IS the sensor component identity" or "This key belongs to the sensor component on this product")
- `ADDITIONAL_COMPONENT_KEYS` — same, for passenger keys
- `PRODUCT_COMPONENTS` — grouped inventory: parent component + resolved value on this product + resolved subfield values

**Under the new model**, prompt strings are **byte-identical**, with one small enhancement: variance policy added inline to subfields in `PRODUCT_COMPONENTS`:

```
sensor: Hero 25K
  dpi: 25000   (upper_bound — products can be lower)
  ips: 650     (upper_bound)
  sensor_type: optical   (authoritative)
```

This gives the LLM useful context about which property values are hard caps vs negotiable. Variance is read from `componentSources[<owner>].roles.properties[].variance_policy`. Numeric-only collapse (`upper_bound`/`lower_bound`/`range` collapse to `authoritative` for non-numeric fields) is the same logic already in `KeyComponentsBody`.

The prompt does NOT inject the entire component DB table (would be 100+ rows × 4+ properties × every prompt — wasteful). It injects only this product's resolved component identity and its resolved subfield values, same as today.

## Lock state contract

When `enum.source === "component_db." + selfKey`, the key is **component-locked**:

| Field | Editable? |
|---|---|
| `enum.source` | Locked (synced from `component_sources[]`) |
| `contract.type` | Locked to `"string"` |
| `contract.shape` | Locked to `"scalar"` |
| `contract.unit/range/list_rules/rounding` | Locked / hidden |
| `enum.policy` | **Editable** |
| `enum.pattern` (new) | **Editable** |
| `priority.*`, `ai_assist.*`, `evidence.*`, `ui.*`, `aliases`, `search_hints.*`, `constraints[]` | Editable as normal |
| `component.*` (entire block) | **Doesn't exist anymore** |

Lock state is derived, not stored. Removing the matching `component_sources[]` entry unlocks the key (it reverts to a plain field rule).

## Validation contract (Phase 4)

Two-way orphan check at compile time:

1. Every `component_sources[X]` MUST have a field rule for key `X` with `enum.source === "component_db." + X`.
2. Every field rule with `enum.source === "component_db." + X` MUST have a matching `component_sources[X]` entry.
3. Every `component_sources[X].roles.properties[].field_key` MUST be a real field rule key.

Mismatches are compile errors (same severity as the existing `sheet is required when mode=sheet` check).

## Verification across phases

- `npx tsc --noEmit` clean after every phase
- Targeted tests pass after every phase
- After Phase 1: prompt golden-master tests stay green (byte-identical except optional variance label which gets fixture updates)
- After Phase 2: rebuild category fields, diff `field_rules.json` — `component.*` block gone everywhere
- After Phase 3: GUI smoke — drawer is 8 tabs, locked keys show 🔧, can edit enum.policy/enum.pattern only on locked
- After Phase 4: try saving a malformed component_sources entry, get inline validation; try setting `enum.source = component_db.foo` on a key with no `component_sources[foo]`, get compile error

## CLAUDE.md compliance

- Phase 1 is `[CLASS: RETIREMENT]` — no source-text searches; behavioral assertions only (resolved row no longer carries `component.match`, engine still returns same results, prompt golden-masters stay green)
- Phases 2–4 are `[CLASS: BEHAVIORAL]` — full TDD per the test-budget heuristic
- No new packages
- No git commands (other devs working concurrently per `feedback_no_git`)
- No subagents (per `feedback_no_agents`)
- Tests run inline, not piped (per `feedback_no_background_tests`)

## How to use this guide

1. **Phase 0 (this dir)** — done. Read each phase file before starting that phase.
2. **Compact the conversation** to relieve context pressure now that the plan is on disk.
3. **Phase 1** — enter plan mode, write a plan file referencing `phase-1-match-retirement.md`, get approval, implement.
4. Repeat for Phase 2, 3, 4.

If anything in the live codebase contradicts this guide during execution, **stop and update this guide first** — the guide is the working SSOT.
