# studioRoutesPropagation.test.js Audit

Scope: `src/features/studio/api/tests/studioRoutesPropagation.test.js`

Policy:
- Preserve only real route-level contracts for strict-authority component-db, field-studio-map propagation, and known-values authority.
- Split unrelated route families into focused files with the minimal route harness they need.
- Collapse duplicate precedence wrappers where one table-driven contract proves the same public selection rule.

## Component DB Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `studio component-db reads authoritative identities from SpecDb when available` | KEEP | Distinct strict-authority success contract for the component-db route. | `src/features/studio/api/tests/studioComponentDbAuthorityContracts.test.js` | Preserved |
| `studio component-db returns specdb_not_ready when authoritative SpecDb is unavailable` | KEEP | Distinct strict-authority failure contract for the component-db route. | `src/features/studio/api/tests/studioComponentDbAuthorityContracts.test.js` | Preserved |

## Field Studio Map Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `studio field-studio-map PUT emits data-change event for live propagation` | KEEP | Distinct propagation contract for the write route. | `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js` | Preserved |
| `studio field-studio-map PUT rejects destructive empty overwrite by default` | KEEP | Distinct destructive-write guard contract. | `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js` | Preserved |
| `studio field-studio-map GET prefers control-plane payload over legacy partial user-settings map` | COLLAPSE | Same precedence family as the valid-control-plane-over-invalid-user-settings case. | `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js` | Merged into table-driven precedence contract |
| `studio field-studio-map GET prefers valid control-plane map over richer invalid user-settings map` | COLLAPSE | Same precedence family as the control-plane-over-legacy-partial case. | `src/features/studio/api/tests/studioFieldStudioMapContracts.test.js` | Merged into table-driven precedence contract |

## Known Values Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `studio known-values reads authoritative enum values from SpecDb when available` | KEEP | Distinct strict-authority success contract for the known-values route. | `src/features/studio/api/tests/studioKnownValuesAuthorityContracts.test.js` | Preserved |
| `studio known-values returns specdb_not_ready when authoritative SpecDb is unavailable` | KEEP | Distinct strict-authority failure contract for the known-values route. | `src/features/studio/api/tests/studioKnownValuesAuthorityContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/studio/api/tests/studioComponentDbAuthorityContracts.test.js src/features/studio/api/tests/studioFieldStudioMapContracts.test.js src/features/studio/api/tests/studioKnownValuesAuthorityContracts.test.js`
- Surrounding studio API tests: `node --test src/features/studio/api/tests/*.test.js`
- Full suite: `npm test`
