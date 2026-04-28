# Frontend Cross-Screen Data-Sharing Audits

Date: 2026-04-28
Scope: `tools/gui-react/**` plus backend events/caches that drive GUI state.

This index is the active backlog. Stale or resolved findings were removed from the per-audit files.

## Work Queues

Use these three docs as the working backlog:

- [high-priority-work.md](./high-priority-work.md) - data-loss, corruption, transport validation, user-trust, and phase-gating risks.
- [medium-priority-work.md](./medium-priority-work.md) - workflow correctness, propagation, freshness, response-shape, and maintainability issues.
- [low-priority-work.md](./low-priority-work.md) - polish, cleanup, documentation, and deferred guardrail issues.

## Audit Set

| File | Domain | Current severity |
|---|---|---|
| [high-priority-work.md](./high-priority-work.md) | High priority work queue | HIGH |
| [medium-priority-work.md](./medium-priority-work.md) | Medium priority work queue | MEDIUM |
| [low-priority-work.md](./low-priority-work.md) | Low priority work queue | LOW |
| [review-overview-data-sync.md](./review-overview-data-sync.md) | Review grid / Overview catalog sync | LOW-MEDIUM |
| [field-studio-propagation.md](./field-studio-propagation.md) | Field Studio propagation | MEDIUM |
| [finder-cross-screen-propagation.md](./finder-cross-screen-propagation.md) | Finder cross-screen propagation | HIGH |
| [indexlab-storage-runtime-ops-sync.md](./indexlab-storage-runtime-ops-sync.md) | IndexLab / Storage / Runtime Ops sync | MEDIUM |
| [settings-config-propagation.md](./settings-config-propagation.md) | Settings/config propagation | MEDIUM |
| [operations-queue-state.md](./operations-queue-state.md) | Operations / queue state | MEDIUM-HIGH |
| [selection-focus-state.md](./selection-focus-state.md) | Selection / drawer focus state | HIGH |
| [server-side-caches.md](./server-side-caches.md) | Server in-memory caches | LOW-MEDIUM |
| [drawer-modal-freshness.md](./drawer-modal-freshness.md) | Drawer/modal freshness | MEDIUM |
| [auxiliary-registries.md](./auxiliary-registries.md) | Brand/color/unit registries | MEDIUM |
| [evidence-pipeline.md](./evidence-pipeline.md) | Evidence pipeline | LOW |
| [billing-cost-telemetry.md](./billing-cost-telemetry.md) | Billing/cost telemetry | MEDIUM |
| [data-authority-snapshot.md](./data-authority-snapshot.md) | Data authority snapshot query | LOW |
| [websocket-schema.md](./websocket-schema.md) | WebSocket schema/transport | HIGH |
| [routing-url-state.md](./routing-url-state.md) | URL/deep-link state | MEDIUM |
| [test-coverage-invariants.md](./test-coverage-invariants.md) | Cross-screen/rebuild test coverage | HIGH |
| [codegen-drift.md](./codegen-drift.md) | Codegen drift | HIGH |
| [loading-error-ux.md](./loading-error-ux.md) | Loading/error UX | HIGH |
| [run-artifact-read-paths.md](./run-artifact-read-paths.md) | Run artifacts/read paths | HIGH |
| [appdb-specdb-boundary.md](./appdb-specdb-boundary.md) | AppDb/SpecDb boundary | LOW |

## Working Priority

1. Fix data-loss and corruption risks first: rebuild coverage, dual-write proof, WS validation, screencast cache.
2. Fix user trust next: global errors, rollback visibility, connection status, loading skeletons.
3. Fix stale focus/selection state: Review drawer deletion, Overview selection, IndexLab picker.
4. Fix workflow polish: deep links, drawer freshness, Storage detail refresh.
5. Fix maintainability backlog: codegen drift, registry propagation, cache cleanup, low-severity docs/tests.
