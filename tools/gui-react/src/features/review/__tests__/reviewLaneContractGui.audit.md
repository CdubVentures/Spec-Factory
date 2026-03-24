# Review Lane GUI Test Audit

Scope: `src/db/tests/reviewLaneContractGui.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `GUI review lane click smoke keeps grid, component, and enum actions decoupled` | COLLAPSE | Real runtime GUI coverage, but packed into one brittle smoke path with mixed responsibilities. Split by user-facing surface while preserving the same contracts. | `reviewGridLaneGuiContracts.test.js`, `reviewComponentLaneGuiContracts.test.js`, `reviewEnumLaneGuiContracts.test.js` | Preserved as focused GUI contracts |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review lane GUI tests | `node --test tools/gui-react/src/features/review/__tests__/reviewGridLaneGuiContracts.test.js tools/gui-react/src/features/review/__tests__/reviewComponentLaneGuiContracts.test.js tools/gui-react/src/features/review/__tests__/reviewEnumLaneGuiContracts.test.js` -> pass |
| Surrounding GUI review tests | `node --test tools/gui-react/src/features/review/**/__tests__/*.test.js` -> pass |
| Full suite | `npm test` -> fail outside scope in queue/config/settings-registry areas |
