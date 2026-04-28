# Frontend Cross-Screen Data-Sharing Audits

Date: 2026-04-28
Scope: `tools/gui-react/**` plus backend events/caches that drive GUI state.

This index is the active backlog. Stale or resolved findings were removed from the per-audit files.

## Audit Set

| File | Domain | Current severity |
|---|---|---|
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

## Active Issues by Severity

### Critical

None confirmed after removing stale findings.

### High

1. Full-suite baseline is not clean.
2. PIF runtime JSON read/modify paths need contract tightening.
3. Storage Run Detail B2 durable `run_sources` projection/finalizer coverage is not confirmed.
4. Uneven deleted-DB rebuild coverage for SQL projections.
5. SQL-to-JSON mirror writes need consistent atomicity proof.
6. Shared delete/reset paths need atomic helper coverage.
7. Malformed WS payloads need adversarial store-safety tests.
8. Operations WS messages lack runtime shape validation.
9. Receive-side WS validation is inconsistent across channels.
10. Screencast frame cache is unbounded.
11. No global error toast/notification contract.
12. Mutation rollback is invisible to users.
13. WS disconnect/reconnect state is silent.
14. Major pages lack consistent skeleton/loading structure.
15. Review drawer can keep stale `activeCell` after entity deletion.
16. No codegen drift guard after registry/codegen changes.
17. Run-All fan-out is not visually synchronous (medium-high, grouped here for triage).

### Medium

1. LLM policy edits propagate to other tabs only after save.
2. Field Studio prompt-preview invalidation covers Key Finder but not every finder.
3. Manual enum/list edit model needs a product decision.
4. StudioPage still has manual/broad invalidation paths.
5. Storage detail page lacks active-run refresh.
6. Run-finalize Catalog coverage needs per-run-type audit.
7. IndexLab URL history B3 table/finalization/rebuild path needs confirmation.
8. CommandConsole still has manual/broad invalidation leftovers.
9. Process-status and operations state have semantic drift.
10. Data-change does not suppress completed operations.
11. Review drawer state is not refresh-safe.
12. Overview multi-select is not refresh-safe.
13. Contextual deep links are missing.
14. IndexLab picker requires session state.
15. PIF variant popover uses a 30-second stale window.
16. Component Review impact drawer uses a 60-second stale window.
17. BrandManager bypasses the shared data-change mutation pattern.
18. Component-review batch paths have manual/broad invalidation leftovers.
19. Run-summary telemetry is capped at 6000 events.
20. `crawl_sources.sources[]` has no pagination.
21. HTML artifacts have no HTTP serve route.
22. crawl4ai extractions are write-only.
23. Storage run detail freshness is stale-window based.
24. Query-key scope contract is incomplete.
25. Mutation response shapes do not consistently return changed entities.
26. Catalog sortable finder columns are hardcoded in tests.
27. Finder-specific knob schemas are not tied to rendered controls.
28. Cross-finder cascade data-state invariants are thin.
29. Prompt wording assertions are brittle.
30. No root regenerate-all codegen entry point.
31. LLM phase generator is a super-generator.
32. Finder typegen has opt-in coverage.
33. Broader generated-code checks are still needed before closing Registry/O(1) stage work.
34. Indexing action errors are terse.
35. Retry/backoff UX is not explicit.
36. Process-status payload naming is mixed snake/camel.
37. WS channel handlers need local try/catch isolation.
38. LLM stream chunks need stronger validation.

### Low

1. Review optimistic patches do not synchronously patch Overview.
2. `publishConfidenceThreshold` local invalidation is broad.
3. PIF `image-processed` does not update `pif_variant_progress` unless ring semantics change.
4. Settings queries rely on implicit stale-time defaults.
5. No central knob-consumer registry.
6. Command Console selection can persist after row deletion.
7. Data-change domain mapping is not easy to audit from source.
8. Optimistic operation stub can vanish silently on POST failure.
9. LLM stream chunks are lost on WS drop.
10. Direct field-key-order PUT may miss `reviewLayoutByCategory` invalidation.
11. `reviewLayoutByCategory` may be unused.
12. Component/enum cache invalidation plumbing may be dead.
13. Discovery history drawer has no explicit freshness contract.
14. Unit registry has no cross-feature event contract.
15. 404 or rejected evidence is not visually surfaced in Review.
16. No cross-system evidence enum-sync test.
17. Orphaned billing-event counters are not surfaced.
18. Billing dashboard freshness is timer-based.
19. Broad data-authority snapshot invalidation intent is undocumented.
20. Data-authority observability payload is not clearly consumed.
21. Data-authority polling plus invalidation is redundant.
22. No data-authority cascade-scope regression test.
23. Discovery history drawer state is not persistent.
24. No deletion-to-route auto-close contract.
25. Component Review flagged items are row-index based.
26. Future multi-category selection mismatch.
27. PIF variant ring click does not sync Review filter.
28. Some registries probably need generated consumers.
29. `tsconfig.tsbuildinfo` is tracked.
30. Codegen script test coverage is sparse.
31. Stale-refetch indication is inconsistent.
32. Empty-state copy is inconsistent.
33. Error boundary does not catch async failures.
34. Global Suspense fallback is undifferentiated.
35. Screenshot directory candidate resolution is duplicated.
36. No explicit AppDb `categories` table.
37. AppDb `settings` table reserved sections are undocumented.
38. Cross-DB brand reference is contract-only.
39. Negative invalidation-scope tests are sparse.
40. Runtime event interface is loose.
41. Data-change validation is stronger server-side than UI-side.
42. Test-progress WS channels are unused or partially wired.
43. Heartbeat handling is implicit.

## Working Priority

1. Fix data-loss and corruption risks first: rebuild coverage, dual-write proof, WS validation, screencast cache.
2. Fix user trust next: global errors, rollback visibility, connection status, loading skeletons.
3. Fix stale focus/selection state: Review drawer deletion, Overview selection, IndexLab picker.
4. Fix workflow polish: deep links, drawer freshness, Storage detail refresh.
5. Fix maintainability backlog: codegen drift, registry propagation, cache cleanup, low-severity docs/tests.
