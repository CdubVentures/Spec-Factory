## Purpose

Pure deterministic field value validation against Field Studio contracts. 12-step pipeline: absence, template dispatch, shape, unit, type, normalize, format, list rules, rounding, enum, range, component. Every check is a pure function. No DB, no LLM, no side effects. Zero `src/engine/` imports — fully standalone.

## Public API (The Contract)

```js
export { validateField }  from './validateField.js';
export { validateRecord } from './validateRecord.js';
export { PHASE_REGISTRY } from './phaseRegistry.js';
```

### `validateField({ fieldKey, value, fieldRule, knownValues?, componentDb? })`

Returns `{ valid, value, confidence, repairs[], rejections[], unknownReason, repairPrompt }`.

### `validateRecord({ fields, fieldRules, knownValues?, consistencyMode? })`

Returns `{ valid, fields, perField }`. Cross-field constraints are out of scope for the validator.

### `PHASE_REGISTRY`

Array of 12 phase entries: `{ id, title, order, description, behaviorNote, isApplicable(rule, ctx), triggerDetail(rule, ctx) }`. O(1) registry for UI badge rendering — adding a phase = one entry.

## Field Rule Parameters Consumed

| Parameter | Source Path | Phase | Behavior |
|---|---|---|---|
| data_type | `contract.type` | Step 4 — Type Check | Coerces safe types, rejects mismatches |
| shape | `contract.shape` | Step 2 — Shape Check | Short-circuits pipeline on failure |
| unit | `contract.unit` | Step 3 — Unit Verification | Strips matching suffix, resolves synonyms + converts via centralized unit registry, rejects unknown |
| range | `contract.range` | Step 10 — Range Check | Rejects out-of-bounds (no clamping) |
| rounding | `contract.rounding` | Step 8 — Rounding | Auto-repairs to precision (decimals + mode) |
| list_rules | `contract.list_rules` | Step 7 — List Rules | Dedupe, sort, min/max items |
| enum_policy | `enum.policy` | Step 9 — Enum Check | closed/open_prefer_known/open |
| match_strategy | `enum.match.strategy` | Step 9 — Enum Check | exact (default) or alias (case-insensitive + normalized) |
| format_hint | `enum.match.format_hint` | Step 6 — Format Check | Custom regex pattern after template registry |
| parse_template | `parse.template` | Step 1 — Template Dispatch + Step 6 | Routes specialized normalizers, selects format regex |
| token_map | `parse.token_map` | Step 5 — Normalization | Post-normalization token substitution |
| component_db | (injected) | Step 11 — Component Resolution | exact → case-insensitive → alias → normalized matching |

## Dependencies

- **Allowed:** `src/shared/primitives.js`
- **Forbidden:** `src/engine/*`, `src/features/*`, `src/db/*`, `src/pipeline/*`

## Domain Invariants

1. Shape failure short-circuits the entire pipeline — no downstream checks run.
2. Absence normalization (null/undefined/empty to canonical form) runs before shape check.
3. `"none"` is a semantic value, NOT an unknown token.
4. Auto-coercion only where safe and deterministic (e.g., `"42"` to `42`). Never guess.
5. Unk-token check runs before numeric parsing — `"N/A"` is recognized as unknown, not rejected as non-numeric.
6. O(1) scaling — dispatches by `parse.template`. Adding a field or category requires zero validator code changes.
7. Alias enum matching normalizes down then resolves back up — `"cherry mx red"` → `"Cherry MX Red"`.
8. Unit conversions are deterministic — `"2.65 lb"` × factor → numeric result, no LLM needed.
