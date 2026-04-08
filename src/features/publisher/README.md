## Purpose

Single gate for all field data entering the product record. No field value reaches `item_field_state` or `product.json fields[]` without passing through this pipeline. Sub-modules: `validation/` (12-step pure deterministic checks + discovery enum merge), `repair-adapter/` (LLM repair orchestration, P1-P4/P6-P7/UNIT prompts), `candidate-gate/` (source validate + persist), `publisher/` (resolve + cross-validate + publish). Component resolution (sensor/switch/encoder/material name matching) is a review-phase concern, not a validation gate.

## Public API (The Contract)

```js
// src/features/publisher/index.js
export { submitCandidate } from './candidate-gate/submitCandidate.js';
export { publishResolved } from './publisher/publishResolved.js';
export { validateField }   from './validation/validateField.js';
export { validateRecord }  from './validation/validateRecord.js';
export { repairField }     from './repair-adapter/repairField.js';
export { repairCrossField } from './repair-adapter/repairField.js';
export { mergeDiscoveredEnums }  from './validation/mergeDiscoveredEnums.js';
export { buildDiscoveredEnumMap } from './buildDiscoveredEnumMap.js';
export { persistDiscoveredValue } from './persistDiscoveredValues.js';
```

## Dependencies

- **Allowed:** `src/shared/`
- **Forbidden:** `src/engine/*`, `src/features/*`, `src/db/*` (candidate-gate and publisher access DB through injected dependencies, never direct imports)

## Domain Invariants

1. No field value reaches `item_field_state` or `product.json fields[]` without passing validation.
2. Validation is deterministic and pure — same input always produces same output.
3. Field Studio rules are the sole source of truth for what is valid.
4. LLM repair prompts are returned as data — the validator never calls an LLM.
5. Two-phase write: validated candidates first (per-source), resolved winners second (per-product).
