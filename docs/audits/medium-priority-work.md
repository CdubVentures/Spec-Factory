# Medium Priority Work Queue

Date: 2026-04-28
Scope: Active medium-priority audit issues only.

Use this after the high-priority queue. Items still need AGENTS.md state/class discipline and issue-by-issue discussion before implementation.

| ID | Issue | Source | Work Shape |
|---|---|---|---|
| M1 | LLM policy edits propagate to other tabs only after save | [settings-config-propagation.md](./settings-config-propagation.md) | Publish settings propagation optimistically and rollback/refetch on save error. |
| M2 | Field Studio prompt-preview invalidation covers Key Finder but not every finder | [field-studio-propagation.md](./field-studio-propagation.md) | Extend review-layout prompt-preview invalidation to all finders that read field rules. |
| M3 | Manual enum/list edit model needs a product decision | [field-studio-propagation.md](./field-studio-propagation.md) | Choose auto-compile-on-save or draft-until-compile with visible state. |
| M4 | StudioPage still has manual/broad invalidation paths | [field-studio-propagation.md](./field-studio-propagation.md) | Inventory direct invalidations; move cross-screen effects to typed data-change events. |
| M5 | Storage detail page lacks active-run refresh | [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | Subscribe visible run detail to active run events and invalidate exact run detail. |
| M6 | Run-finalize Catalog coverage needs per-run-type audit | [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | Build run-type/event/product-field matrix before adding generic finalize events. |
| M7 | IndexLab URL history B3 table/finalization/rebuild path needs confirmation | [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Verify schema, finalizer population, and rebuild from durable artifacts. |
| M8 | CommandConsole still has manual/broad invalidation leftovers | [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | Split local optimistic updates from cross-screen data-change events. |
| M9 | Process-status and operations state have semantic drift | [operations-queue-state.md](./operations-queue-state.md) | Define one ownership contract for running/completed/error/queue counts. |
| M10 | Data-change does not suppress completed operations | [operations-queue-state.md](./operations-queue-state.md) | Only after repro, correlate operation ids or targets to terminal data-change events. |
| M11 | Review drawer state is not refresh-safe | [routing-url-state.md](./routing-url-state.md) | Encode drawer context in hash query params and hydrate on mount. |
| M12 | Overview multi-select is not refresh-safe | [routing-url-state.md](./routing-url-state.md), [selection-focus-state.md](./selection-focus-state.md) | Persist or otherwise recover bulk selection per category. |
| M13 | Contextual deep links are missing | [routing-url-state.md](./routing-url-state.md) | Define URL contracts for Review, IndexLab, Component Review, and Storage focused states. |
| M14 | IndexLab picker requires session state | [routing-url-state.md](./routing-url-state.md), [selection-focus-state.md](./selection-focus-state.md) | Encode picker brand/product/run state in URL and hydrate before store read. |
| M15 | PIF variant popover uses a 30-second stale window | [drawer-modal-freshness.md](./drawer-modal-freshness.md) | Lower stale time or invalidate on relevant PIF events. |
| M16 | Component Review impact drawer uses a 60-second stale window | [drawer-modal-freshness.md](./drawer-modal-freshness.md) | Lower stale time or invalidate on relevant component/enum events. |
| M17 | BrandManager bypasses shared data-change mutation pattern | [auxiliary-registries.md](./auxiliary-registries.md) | Convert BrandManager mutations to `useDataChangeMutation`. |
| M18 | Component-review batch paths have manual/broad invalidation leftovers | [selection-focus-state.md](./selection-focus-state.md) | Add backend events where missing, then narrow frontend invalidation to affected scopes. |
| M19 | Run-summary telemetry is capped at 6000 events | [billing-cost-telemetry.md](./billing-cost-telemetry.md) | Add truncation flag, raise cap, or move telemetry to paginated reader. |
| M20 | `crawl_sources.sources[]` has no pagination | [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Add cursor or limit/offset pagination on SQL query and UI. |
| M21 | HTML artifacts have no HTTP serve route | [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Decide user-facing vs internal-only; add route only if user-facing. |
| M22 | crawl4ai extractions are write-only | [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Project into SQL/API or document debug-only cleanup policy. |
| M23 | Storage run detail freshness is stale-window based | [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Subscribe to active run pulses and refetch visible detail. |
| M24 | Query-key scope contract is incomplete | [test-coverage-invariants.md](./test-coverage-invariants.md) | Document event scope expectations next to source registry and add focused tests. |
| M25 | Mutation response shapes do not consistently return changed entities | [test-coverage-invariants.md](./test-coverage-invariants.md) | Return canonical changed entities for high-traffic mutations. |
| M26 | Catalog sortable finder columns are hardcoded in tests | [test-coverage-invariants.md](./test-coverage-invariants.md) | Derive expected lists from `FINDER_MODULES`. |
| M27 | Finder-specific knob schemas are not tied to rendered controls | [test-coverage-invariants.md](./test-coverage-invariants.md) | Add schema-to-rendered-control contract test. |
| M28 | Cross-finder cascade data-state invariants are thin | [test-coverage-invariants.md](./test-coverage-invariants.md) | Populate affected projections, delete CEF variant, assert cascade cleanup. |
| M29 | Prompt wording assertions are brittle | [test-coverage-invariants.md](./test-coverage-invariants.md) | Replace wording assertions with structural prompt assertions. |
| M30 | No root regenerate-all codegen entry point | [codegen-drift.md](./codegen-drift.md) | Add approved root codegen script only with explicit package-script approval. |
| M31 | LLM phase generator is a super-generator | [codegen-drift.md](./codegen-drift.md) | Document or split only when it becomes hard to maintain. |
| M32 | Finder typegen has opt-in coverage | [codegen-drift.md](./codegen-drift.md) | Decide universal typegen vs documented opt-in criteria. |
| M33 | Broader generated-code checks are still needed before closing Registry/O(1) stage work | [codegen-drift.md](./codegen-drift.md) | Run agreed codegen/check sequence and inspect generated diffs. |
| M34 | Indexing action errors are terse | [loading-error-ux.md](./loading-error-ux.md) | Route failures through global error UX with clearer recovery messages. |
| M35 | Retry/backoff UX is not explicit | [loading-error-ux.md](./loading-error-ux.md) | Add query retry/backoff defaults and visible retry state. |
| M36 | Process-status payload naming is mixed snake/camel | [websocket-schema.md](./websocket-schema.md) | Normalize at the WS boundary and keep internal shape consistent. |
| M37 | WS channel handlers need local try/catch isolation | [websocket-schema.md](./websocket-schema.md) | Wrap per-channel handling and log rejects without state mutation. |
| M38 | LLM stream chunks need stronger validation | [websocket-schema.md](./websocket-schema.md) | Validate chunk shape and size before append. |

## Proof Pattern

- Behavioral changes need tests first.
- UI freshness/error changes need GUI proof.
- Generated-code changes need drift check proof.
- Data projection changes need rebuild proof.
