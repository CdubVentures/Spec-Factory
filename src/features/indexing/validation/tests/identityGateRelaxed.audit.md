# identityGateRelaxed.test.js Audit

Scope: `src/features/indexing/validation/tests/identityGateRelaxed.test.js`

Policy:
- Preserve only the relaxed identity-gate contracts that protect certainty bands, contradiction-family tolerance rules, and noisy-source validation behavior.
- Collapse repeated contradiction examples into table-driven family contracts instead of carrying one test per wording variant.
- Retire config-default checks and weaker duplicate validation wrappers when those boundaries are already protected by shared settings/config suites.

## Validation Band Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `manufacturer + additional sources without contradictions yields certainty >= 0.95 (capped at 0.95 not 0.99)` | KEEP | Distinct strong-validation band contract for the relaxed gate. | `src/features/indexing/validation/tests/identityGateRelaxed.validationBands.test.js` | Preserved |
| `manufacturer only (no additional sources) yields certainty below 0.95` | COLLAPSE | Same certainty-band family as the later provisional-band wrapper. | `src/features/indexing/validation/tests/identityGateRelaxed.validationBands.test.js` | Merged into one provisional-band contract |
| `manufacturer only without additional sources is in provisional band (>= 0.50 but validated=false)` | COLLAPSE | Same certainty-band family as the earlier manufacturer-only wrapper. | `src/features/indexing/validation/tests/identityGateRelaxed.validationBands.test.js` | Merged into one provisional-band contract |
| `no accepted sources yields low certainty below threshold` | COLLAPSE | Same failed-band family as the later zero-accepted wrapper, but weaker. | `src/features/indexing/validation/tests/identityGateRelaxed.validationBands.test.js` | Merged into one failed-band contract |
| `zero accepted sources (all identity.match=false, unapproved) yields certainty below publishThreshold` | COLLAPSE | Stronger version of the failed-band contract because it also checks accepted-source count and publish-threshold reason. | `src/features/indexing/validation/tests/identityGateRelaxed.validationBands.test.js` | Merged into one failed-band contract |
| `manufacturer + additional + contradictions yields certainty 0.75 (keeps extraction provisional but publish-safe)` | RETIRE | The current relaxed contradiction logic no longer creates a contradiction here, so this wrapper only duplicates the strong-validation path without adding a unique contract. | None | Deleted |
| `certainty 0.85 with validated=true results in full extraction (identityFull=true)` | RETIRE | Duplicate of the strong-validation gate path and does not actually test extraction behavior. | None | Deleted |

## Contradiction Family Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `wireless vs wireless / wired is NOT a connection conflict` | KEEP | Distinct relaxed connection-class tolerance contract. | `src/features/indexing/validation/tests/identityGateRelaxed.connectionConflictContracts.test.js` | Preserved |
| `Focus Pro 30K vs FOCUS PRO 30K Optical is NOT a sensor conflict` | COLLAPSE | Same relaxed sensor-family normalization contract as the other wording variants. | `src/features/indexing/validation/tests/identityGateRelaxed.sensorConflictContracts.test.js` | Merged into table-driven sensor contract |
| `generic or noisy sensor labels do not create a sensor conflict when only one concrete sensor signature exists` | COLLAPSE | Same relaxed sensor-family normalization contract as the other wording variants. | `src/features/indexing/validation/tests/identityGateRelaxed.sensorConflictContracts.test.js` | Merged into table-driven sensor contract |
| `Focus Pro 35K Perfect Sensor vs Focus Pro 35K Optical Sensor Gen-2 is not a sensor conflict` | COLLAPSE | Same relaxed sensor-family normalization contract as the other wording variants. | `src/features/indexing/validation/tests/identityGateRelaxed.sensorConflictContracts.test.js` | Merged into table-driven sensor contract |
| `localized manufacturer Focus Pro 35K strings do not create a sensor conflict` | COLLAPSE | Same relaxed sensor-family normalization contract as the other wording variants. | `src/features/indexing/validation/tests/identityGateRelaxed.sensorConflictContracts.test.js` | Merged into table-driven sensor contract |
| `truncated numeric blurbs do not count as a concrete conflicting sensor family` | COLLAPSE | Same relaxed sensor-family normalization contract as the other wording variants. | `src/features/indexing/validation/tests/identityGateRelaxed.sensorConflictContracts.test.js` | Merged into table-driven sensor contract |
| `125.6mm vs 126.1mm is NOT a dimension conflict (within 3mm)` | COLLAPSE | Same size-tolerance threshold family as the other numeric size cases. | `src/features/indexing/validation/tests/identityGateRelaxed.sizeConflictContracts.test.js` | Merged into table-driven size contract |
| `125mm vs 132mm is NOT a dimension conflict (7mm within 15mm measurement tolerance)` | COLLAPSE | Same size-tolerance threshold family as the other numeric size cases. | `src/features/indexing/validation/tests/identityGateRelaxed.sizeConflictContracts.test.js` | Merged into table-driven size contract |
| `90mm vs 130mm IS a dimension conflict (40mm = genuinely different product class)` | COLLAPSE | Same size-tolerance threshold family as the other numeric size cases. | `src/features/indexing/validation/tests/identityGateRelaxed.sizeConflictContracts.test.js` | Merged into table-driven size contract |
| `implausible page-layout dimensions do not create a size conflict when one plausible mouse cluster exists` | KEEP | Distinct size-noise filtering contract beyond the pure numeric threshold rows. | `src/features/indexing/validation/tests/identityGateRelaxed.sizeConflictContracts.test.js` | Preserved |
| `regional SKU variants share base SKU - NOT a conflict` | COLLAPSE | Same SKU conflict family as the different-product SKU case. | `src/features/indexing/validation/tests/identityGateRelaxed.skuConflictContracts.test.js` | Merged into table-driven SKU contract |
| `completely different SKUs IS a conflict` | COLLAPSE | Same SKU conflict family as the regional-variant SKU case. | `src/features/indexing/validation/tests/identityGateRelaxed.skuConflictContracts.test.js` | Merged into table-driven SKU contract |

## Retired Config Checks and Gate-Level Noise Contract

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `identityGatePublishThreshold is retired from config (hardcoded to 0.75 in orchestration)` | RETIRE | Redundant with the shared retired-settings/config absence checks in `src/shared/tests/settingsDefaultsEnvSync.test.js`. | `src/shared/tests/settingsDefaultsEnvSync.test.js` | Deleted from this file |
| `standard profile has tuned defaults` | RETIRE | Redundant with shared config/search-profile default coverage for `searchProfileQueryCap`. | `src/shared/tests/settingsAccessor.test.js`; `src/core/config/tests/configAssembly.test.js` | Deleted from this file |
| `noisy accepted-source fields do not block validation when identity evidence is otherwise sufficient` | KEEP | Distinct gate-level integration contract proving relaxed contradiction filtering preserves confirmed validation. | `src/features/indexing/validation/tests/identityGateRelaxed.validationNoiseTolerance.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/validation/tests/identityGateRelaxed*.test.js`
- Surrounding validation tests: `node --test src/features/indexing/validation/tests/*.test.js`
- Full suite: `npm test`
