# manifestStructuralGuard.test.js Audit

Scope: `src/core/config/tests/manifestStructuralGuard.test.js`

Policy:
- Preserve public manifest export shape and key/default alignment.
- Retire stale assumptions about reserved groups that are intentionally omitted when the derived manifest has no entries for them.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `exports version 1` | KEEP | Public manifest version contract. | same file | Preserved |
| `exports a frozen, non-empty manifest array` | KEEP | Public export-shape contract. | same file | Preserved |
| `includes each required manifest group` | COLLAPSE | The old hardcoded group set included empty reserved groups. The live contract is the active derived groups only. | same file | Tightened to active groups only |
| `omits empty reserved manifest groups until they have live entries` | KEEP | Protects the current derived-manifest filtering behavior for reserved-but-empty groups. | same file | Preserved |
| `gives each group the required public shape` | KEEP | Public group-shape contract. | same file | Preserved |
| `gives each entry the required public shape` | KEEP | Public entry-shape contract. | same file | Preserved |
| `keeps exported manifest keys and defaults aligned with grouped entries` | KEEP | Public key/default alignment contract. | same file | Preserved |
| `keeps manifest keys unique across groups` | KEEP | Public uniqueness contract. | same file | Preserved |
| `keeps CONFIG_MANIFEST_DEFAULTS values aligned with entry defaults` | KEEP | Public default alignment contract. | same file | Preserved |
| `publishes LOCAL_OUTPUT_ROOT in the paths group with a non-empty default` | KEEP | Live manifest-path contract. | same file | Preserved |

## Proof

- Targeted file: `node --test src/core/config/tests/manifestStructuralGuard.test.js`
- Full suite: `npm test`
