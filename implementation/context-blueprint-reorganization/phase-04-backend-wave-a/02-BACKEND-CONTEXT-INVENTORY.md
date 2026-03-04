# Phase 04 Backend Context Inventory

Snapshot date: 2026-03-02

## Wave A Contexts

| Context | Target Entrypoint | Primary Legacy Sources | Wave A Intent | State |
|---|---|---|---|---|
| `settings-authority` | `src/features/settings-authority/index.js` | `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js`, settings route consumers | Seed feature contract and rewire API settings consumers through it | `COMPLETED` (`04-01` landed) |
| `catalog-identity` | `src/features/catalog-identity/index.js` | `src/catalog/*`, `src/categories/*`, catalog route consumers | Seed contract and cut over route consumers with compatibility facades | `COMPLETED` (`04-02` landed) |
| `review-curation` | `src/features/review-curation/index.js` | `src/review/*`, review route/mutation consumers | Seed contract and cut over review route consumers with compatibility facades | `COMPLETED` (`04-03` landed) |

## Extraction Order

1. `04-01`: settings-authority contract seed + API consumer rewiring.
2. `04-02`: catalog-identity contract seed + route consumer rewiring.
3. `04-03`: review-curation contract seed + route consumer rewiring.
4. `04-04`: Wave A guardrail closure and Phase 05 handoff packet.
