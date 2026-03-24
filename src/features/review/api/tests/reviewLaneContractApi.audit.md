# Review Lane API Test Audit

Scope: `src/db/tests/reviewLaneContractApi.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `source candidate ids are unique per product+field context` | RETIRE | Fixture-shape validation, not a runtime API contract. The slot-scoping behavior that mattered is covered by collision mutation tests. | None | Deleted with the god file |
| `component review GET does not mutate synthetic candidates on read` | KEEP | Protects read-side purity for a live API endpoint. | `reviewLaneReadContracts.test.js` | Preserved |
| `grid primary accept with candidate-id collision stays slot-scoped` | KEEP | Guards slot-local primary-lane mutation under candidate-id collision. | `reviewLaneGridContracts.test.js` | Preserved |
| `component shared accept with candidate-id collision does not mutate enum slot state` | KEEP | Guards shared-lane decoupling between component and enum surfaces. | `reviewLaneComponentContracts.test.js` | Preserved |
| `grid item confirm only confirms item lane` | KEEP | Confirms candidate-scoped grid confirm semantics. | `reviewLaneGridContracts.test.js` | Preserved |
| `grid item accept only accepts item lane` | KEEP | Confirms accept and confirm remain decoupled for grid primary lanes. | `reviewLaneGridContracts.test.js` | Preserved |
| `grid candidates endpoint synthesizes selected candidate id when lane points to missing candidate row` | KEEP | Preserves selected-candidate visibility contract on the read path. | `reviewLaneReadContracts.test.js` | Preserved |
| `grid shared confirm is context-local (no cross-context propagation)` | KEEP | Protects shared-lane locality across peer products. | `reviewLaneGridContracts.test.js` | Preserved |
| `grid shared accept is slot-scoped (no peer grid/enum mutation)` | KEEP | Protects grid-to-enum decoupling on shared-lane accept. | `reviewLaneGridContracts.test.js` | Preserved |
| `grid lane endpoints reject non-grid key_review_state ids` | KEEP | Input guard for route/context mismatch. | `reviewLaneGridContracts.test.js` | Preserved |
| `component accept and confirm remain decoupled and confirm is candidate scoped` | KEEP | Preserves component candidate review semantics without mutating suggestion state. | `reviewLaneComponentContracts.test.js` | Preserved |
| `component authoritative update cascades to linked items and re-flags constraints` | KEEP | Runtime-critical propagation contract. | `reviewLaneComponentContracts.test.js` | Preserved |
| `enum accept and confirm remain decoupled and confirm is candidate scoped` | KEEP | Preserves enum shared-lane candidate semantics. | `reviewLaneEnumContracts.test.js` | Preserved |
| `enum accept with oldValue renames and propagates to linked items` | KEEP | Runtime-visible rename propagation contract. | `reviewLaneEnumContracts.test.js` | Preserved |
| `confirm endpoints require candidate ids for pending lanes with zero candidates` | COLLAPSE | One guard theme across grid/component/enum lanes; kept together as a focused guard contract instead of a broad god-file section. | `reviewLaneGuardContracts.test.js` | Preserved as focused guard suite |
| `unknown selected values cannot be accepted/confirmed across grid/component/enum lanes` | COLLAPSE | One guard theme across lane families; kept together as focused negative-contract coverage. | `reviewLaneGuardContracts.test.js` | Preserved as focused guard suite |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review lane API tests | `node --test src/features/review/api/tests/reviewLaneReadContracts.test.js src/features/review/api/tests/reviewLaneGridContracts.test.js src/features/review/api/tests/reviewLaneComponentContracts.test.js src/features/review/api/tests/reviewLaneEnumContracts.test.js src/features/review/api/tests/reviewLaneGuardContracts.test.js` -> pass |
| Surrounding review API tests | `node --test src/features/review/api/tests/*.test.js` -> pass |
| Full suite | `npm test` passed |
