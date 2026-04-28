# Auditor 1 - Data Contracts, Persistence, Rebuild, Codegen

Date: 2026-04-28

## Ownership

Auditor 1 owns backend data integrity and contract proof:

- SQL/JSON dual-state persistence.
- Deleted-DB rebuild behavior.
- PIF runtime SQL-vs-JSON read contracts.
- Storage/IndexLab durable projections and finalizers.
- Mutation response contracts.
- Codegen and registry drift proof.
- Backend/data contract tests.

Do not edit frontend UX components except test harnesses needed for contract proof. Coordinate with Auditor 2 before changing user-facing query behavior, and with Auditor 3 before changing WS payload contracts.

## High Priority

| ID | Issue | Primary Area | Work Shape | Proof |
|---|---|---|---|---|
| H1 | Full-suite baseline is not clean | Test baseline | Reproduce full `npm test`, separate unrelated failures, document phase gate state. | Full test command result and issue list for unrelated failures. |
| H2 | PIF runtime JSON read/modify paths need contract tightening | `src/features/product-image/*` | Audit `imageEvaluator.js`, `carouselBuild.js`, `productImageFinder.js`; keep JSON mirror writes, move runtime reads to SQL where required. | Case-by-case read table plus characterization/tests for changed paths. |
| H3 | Storage Run Detail B2 durable projection/finalizer coverage is not confirmed | Storage/IndexLab schema and finalizer | Confirm or add `run_sources` SQL projection, finalization write, and rebuild path. | Schema/finalizer/rebuild proof and deleted-DB test. |
| H4 | Deleted-DB rebuild coverage is uneven | Rebuild tests | Identify weak projections and add targeted deleted-DB tests. | Tests assert row counts and representative values from durable JSON. |
| H5 | SQL-to-JSON mirror writes need consistent atomicity proof | Dual-state persistence | Inventory high-value dual-write mutations and prove SQL/JSON mirrors update together. | Contract tests for each touched mutation class. |
| H6 | Shared delete/reset paths need atomic helper coverage | `finderRoutes.js`, `deleteCandidate.js` | Define shared delete/reset write contract and coordinate SQL/JSON mirror writes. | Tests prove SQL and JSON mirror state after delete/reset. |
| H16 | No codegen drift guard after registry/codegen changes | Codegen/registry | Add approved validation command that runs codegen and fails on diff. | Drift guard catches generated-file mismatch. |

## Medium Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| M2 | Field Studio prompt-preview invalidation covers Key Finder but not every finder | Event/query contract | Extend review-layout prompt-preview invalidation to all finders that read field rules. Coordinate UI verification with Auditor 2. |
| M6 | Run-finalize Catalog coverage needs per-run-type audit | IndexLab/Catalog contract | Build run-type/event/product-field matrix before adding generic finalize events. |
| M7 | IndexLab URL history B3 table/finalization/rebuild path needs confirmation | URL history projection | Verify schema, finalizer population, and rebuild from durable artifacts. |
| M19 | Run-summary telemetry is capped at 6000 events | Run telemetry | Add truncation flag, raise cap, or move telemetry to paginated reader. |
| M20 | `crawl_sources.sources[]` has no pagination | Storage API | Add cursor or limit/offset pagination on SQL query and UI contract; coordinate UI with Auditor 2 if needed. |
| M21 | HTML artifacts have no HTTP serve route | Run artifacts | Decide user-facing vs internal-only; add route only if user-facing. |
| M22 | crawl4ai extractions are write-only | Extraction artifacts | Project into SQL/API or document debug-only cleanup policy. |
| M23 | Storage run detail freshness is stale-window based | Storage detail data contract | Provide exact invalidation/refetch contract for Auditor 2 if frontend work is needed. |
| M24 | Query-key scope contract is incomplete | Event registry/tests | Document event scope expectations next to source registry and add focused tests. |
| M25 | Mutation response shapes do not consistently return changed entities | API mutation contracts | Return canonical changed entities for high-traffic mutations. |
| M26 | Catalog sortable finder columns are hardcoded in tests | Overview/finder registry tests | Derive expected lists from `FINDER_MODULES`. |
| M27 | Finder-specific knob schemas are not tied to rendered controls | Finder settings tests | Add schema-to-rendered-control contract test. |
| M28 | Cross-finder cascade data-state invariants are thin | CEF/PIF/RDF/SKU cascade | Populate affected projections, delete CEF variant, assert cascade cleanup. |
| M29 | Prompt wording assertions are brittle | Prompt tests | Replace wording assertions with structural prompt assertions. |
| M30 | No root regenerate-all codegen entry point | Codegen workflow | Add approved root codegen script only with explicit package-script approval. |
| M31 | LLM phase generator is a super-generator | Codegen architecture | Document or split only when it becomes hard to maintain. |
| M32 | Finder typegen has opt-in coverage | Finder generated types | Decide universal typegen vs documented opt-in criteria. |
| M33 | Broader generated-code checks are still needed before closing Registry/O(1) stage work | Registry/O(1) closure | Run agreed codegen/check sequence and inspect generated diffs. |

## Low Priority

| ID | Issue | Primary Area | Work Shape |
|---|---|---|---|
| L3 | PIF `image-processed` does not update `pif_variant_progress` unless ring semantics change | PIF progress projection | Keep watch item unless rings move to raw image counts. |
| L7 | Data-change domain mapping is not easy to audit from source | Event registry/generated resolver | Improve source registry/generated resolver documentation. |
| L10 | Direct field-key-order PUT may miss `reviewLayoutByCategory` invalidation | Server cache invalidation | Wire invalidation only if that cache is active. |
| L11 | `reviewLayoutByCategory` may be unused | Server cache cleanup | Confirm and delete if dead. |
| L12 | Component/enum cache invalidation plumbing may be dead | Server route cleanup | Remove dead plumbing or add WHY comment. |
| L16 | No cross-system evidence enum-sync test | Evidence enum tests | Add parity test if evidence kinds change again. |
| L17 | Orphaned billing-event counters are not surfaced | Billing observability | Show telemetry warning counters when non-zero. Coordinate UI display with Auditor 2 if needed. |
| L18 | Billing dashboard freshness is timer-based | Billing dashboard data contract | Add `billing-updated` only if immediate cost freshness matters. |
| L19 | Broad data-authority snapshot invalidation intent is undocumented | Data authority invalidation | Add WHY comment near event/domain mapping. |
| L20 | Data-authority observability payload is not clearly consumed | Data authority snapshot | Document reserved payload or split endpoint when another consumer appears. |
| L21 | Data-authority polling plus invalidation is redundant | Data authority query freshness | Raise stale time or remove polling once invalidation confidence is high. |
| L22 | No data-authority cascade-scope regression test | Data authority tests | Add invariant if query becomes performance-sensitive. |
| L28 | Some registries probably need generated consumers | Registry codegen | Generate constants when drift appears or registry pipeline is touched. |
| L29 | `tsconfig.tsbuildinfo` is tracked | Repo hygiene | Remove from tracking only with explicit cleanup approval. |
| L30 | Codegen script test coverage is sparse | Codegen tests | Add generator smoke tests. |
| L35 | Screenshot directory candidate resolution is duplicated | Runtime asset routes | Extract shared screenshot path candidate helper. |
| L36 | No explicit AppDb `categories` table | AppDb category inventory | Add only if UI/API needs SQL category inventory. |
| L37 | AppDb `settings` table reserved sections are undocumented | AppDb schema docs | Add schema comment or README note. |
| L38 | Cross-DB brand reference is contract-only | AppDb/SpecDb brand contract | Document rename cascade or add fan-out if drift is reproduced. |
| L39 | Negative invalidation-scope tests are sparse | Invalidation tests | Add small negative invariants for broad templates. |

## Coordination Rules

- Auditor 1 owns backend/event/data contracts. If Auditor 2 or 3 needs a new backend event or payload shape, define the contract here first.
- Do not change `tools/gui-react` presentation components except for contract tests or generated type consumers.
- Any new behavior follows AGENTS.md TDD rules.
