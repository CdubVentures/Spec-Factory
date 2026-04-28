# Low Priority Work Queue

Date: 2026-04-28
Scope: Active low-priority audit issues only.

Use this queue for polish, cleanup, and maintainability work after High and Medium items are handled or explicitly deferred.

| ID | Issue | Source | Work Shape |
|---|---|---|---|
| L1 | Review optimistic patches do not synchronously patch Overview | [review-overview-data-sync.md](./review-overview-data-sync.md) | Defer unless latency is visible; then add shared Review-to-Catalog patch helper. |
| L2 | `publishConfidenceThreshold` local invalidation is broad | [review-overview-data-sync.md](./review-overview-data-sync.md) | Narrow local invalidation to active category. |
| L3 | PIF `image-processed` does not update `pif_variant_progress` unless ring semantics change | [finder-cross-screen-propagation.md](./finder-cross-screen-propagation.md) | Keep watch item unless rings move to raw image counts. |
| L4 | Settings queries rely on implicit stale-time defaults | [settings-config-propagation.md](./settings-config-propagation.md) | Add explicit small or zero stale times where settings are edited live. |
| L5 | No central knob-consumer registry | [settings-config-propagation.md](./settings-config-propagation.md) | Add consumer annotations if more knob-driven UI drift appears. |
| L6 | Command Console selection can persist after row deletion | [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | Prune selected ids when deletion events remove visible rows. |
| L7 | Data-change domain mapping is not easy to audit from source | [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | Improve source registry/generated resolver documentation. |
| L8 | Optimistic operation stub can vanish silently on POST failure | [operations-queue-state.md](./operations-queue-state.md) | Keep failed stub briefly and show toast or inline error. |
| L9 | LLM stream chunks are lost on WS drop | [operations-queue-state.md](./operations-queue-state.md) | Accept unless stream continuity becomes a requirement. |
| L10 | Direct field-key-order PUT may miss `reviewLayoutByCategory` invalidation | [server-side-caches.md](./server-side-caches.md) | Wire invalidation only if that cache is active. |
| L11 | `reviewLayoutByCategory` may be unused | [server-side-caches.md](./server-side-caches.md) | Confirm and delete if dead. |
| L12 | Component/enum cache invalidation plumbing may be dead | [server-side-caches.md](./server-side-caches.md) | Remove dead plumbing or add WHY comment. |
| L13 | Discovery history drawer has no explicit freshness contract | [drawer-modal-freshness.md](./drawer-modal-freshness.md) | Add explicit freshness policy only if stale-data complaints appear. |
| L14 | Unit registry has no cross-feature event contract | [auxiliary-registries.md](./auxiliary-registries.md) | Add unit events only when a second consumer exists. |
| L15 | 404 or rejected evidence is not visually surfaced in Review | [evidence-pipeline.md](./evidence-pipeline.md) | Add rejected-evidence indicator in Review evidence drawer. |
| L16 | No cross-system evidence enum-sync test | [evidence-pipeline.md](./evidence-pipeline.md) | Add parity test if evidence kinds change again. |
| L17 | Orphaned billing-event counters are not surfaced | [billing-cost-telemetry.md](./billing-cost-telemetry.md) | Show telemetry warning counters when non-zero. |
| L18 | Billing dashboard freshness is timer-based | [billing-cost-telemetry.md](./billing-cost-telemetry.md) | Add `billing-updated` only if immediate cost freshness matters. |
| L19 | Broad data-authority snapshot invalidation intent is undocumented | [data-authority-snapshot.md](./data-authority-snapshot.md) | Add WHY comment near event/domain mapping. |
| L20 | Data-authority observability payload is not clearly consumed | [data-authority-snapshot.md](./data-authority-snapshot.md) | Document reserved payload or split endpoint when another consumer appears. |
| L21 | Data-authority polling plus invalidation is redundant | [data-authority-snapshot.md](./data-authority-snapshot.md) | Raise stale time or remove polling once invalidation confidence is high. |
| L22 | No data-authority cascade-scope regression test | [data-authority-snapshot.md](./data-authority-snapshot.md) | Add invariant if query becomes performance-sensitive. |
| L23 | Discovery history drawer state is not persistent | [routing-url-state.md](./routing-url-state.md) | Defer unless shareable discovery-history links are needed. |
| L24 | No deletion-to-route auto-close contract | [routing-url-state.md](./routing-url-state.md) | Pair with selection-focus deletion pruning. |
| L25 | Component Review flagged items are row-index based | [selection-focus-state.md](./selection-focus-state.md) | Store stable entity ids instead of row indexes. |
| L26 | Future multi-category selection mismatch | [selection-focus-state.md](./selection-focus-state.md) | Keep selection category-scoped. |
| L27 | PIF variant ring click does not sync Review filter | [selection-focus-state.md](./selection-focus-state.md) | Defer unless ring-to-review drilldown is expected. |
| L28 | Some registries probably need generated consumers | [codegen-drift.md](./codegen-drift.md) | Generate constants when drift appears or registry pipeline is touched. |
| L29 | `tsconfig.tsbuildinfo` is tracked | [codegen-drift.md](./codegen-drift.md) | Remove from tracking only with explicit cleanup approval. |
| L30 | Codegen script test coverage is sparse | [codegen-drift.md](./codegen-drift.md) | Add generator smoke tests. |
| L31 | Stale-refetch indication is inconsistent | [loading-error-ux.md](./loading-error-ux.md) | Reuse Billing stale/refetch pattern on high-traffic pages. |
| L32 | Empty-state copy is inconsistent | [loading-error-ux.md](./loading-error-ux.md) | Standardize `EmptyState` primitive/copy contract. |
| L33 | Error boundary does not catch async failures | [loading-error-ux.md](./loading-error-ux.md) | Cover through global query/mutation error UX. |
| L34 | Global Suspense fallback is undifferentiated | [loading-error-ux.md](./loading-error-ux.md) | Defer until route-level skeletons exist. |
| L35 | Screenshot directory candidate resolution is duplicated | [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Extract shared screenshot path candidate helper. |
| L36 | No explicit AppDb `categories` table | [appdb-specdb-boundary.md](./appdb-specdb-boundary.md) | Add only if UI/API needs SQL category inventory. |
| L37 | AppDb `settings` table reserved sections are undocumented | [appdb-specdb-boundary.md](./appdb-specdb-boundary.md) | Add schema comment or README note. |
| L38 | Cross-DB brand reference is contract-only | [appdb-specdb-boundary.md](./appdb-specdb-boundary.md) | Document rename cascade or add fan-out if drift is reproduced. |
| L39 | Negative invalidation-scope tests are sparse | [test-coverage-invariants.md](./test-coverage-invariants.md) | Add small negative invariants for broad templates. |
| L40 | Runtime event interface is loose | [websocket-schema.md](./websocket-schema.md) | Tighten when touching runtime event consumers. |
| L41 | Data-change validation is stronger server-side than UI-side | [websocket-schema.md](./websocket-schema.md) | Add defensive UI-side guard. |
| L42 | Test-progress WS channels are unused or partially wired | [websocket-schema.md](./websocket-schema.md) | Remove unused channel types/subscriptions or document owner. |
| L43 | Heartbeat handling is implicit | [websocket-schema.md](./websocket-schema.md) | Pair heartbeat state with connection status work. |

## Proof Pattern

- Prefer cleanup without new tests unless behavior changes.
- Add tests only where the AGENTS.md test budget requires them.
- Keep low-priority work small and avoid broad refactors.
