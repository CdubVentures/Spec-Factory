# High Priority Work Queue

Date: 2026-04-28
Scope: Active high-priority audit issues only.

Use this file as the first work queue. Each item should be handled one at a time with the AGENTS.md state/class rules, test budget, and TDD requirements.

## H1. Full-suite baseline is not clean

Source: [test-coverage-invariants.md](./test-coverage-invariants.md)

Problem: Focused tests and TypeScript checks can pass while full `npm test` remains red from unrelated failures such as mouse contract drift and scalar prompt golden drift.

Work:
- Reproduce the current full-suite failures.
- Separate unrelated baseline failures from the next feature/fix.
- Do not close phase-level work until the full-suite baseline is understood.

Proof:
- Full test command result documented.
- Known unrelated failures either fixed or recorded as separate active issues.

## H2. PIF runtime JSON read/modify paths need contract tightening

Source: [finder-cross-screen-propagation.md](./finder-cross-screen-propagation.md)

Problem: `imageEvaluator.js`, `carouselBuild.js`, and parts of `productImageFinder.js` still use `product_images.json` as a runtime read/modify source. Some writes are valid JSON mirror writes, but runtime reads need SQL-runtime-SSOT review.

Work:
- Audit each PIF JSON read path.
- Keep durable mirror writes where appropriate.
- Move runtime reads to SQL projections unless a specific path is rebuild/debug-only.

Proof:
- Case-by-case table of PIF JSON reads.
- Tests or characterization coverage for any changed runtime read path.

## H3. Storage Run Detail B2 durable projection/finalizer coverage is not confirmed

Source: [run-artifact-read-paths.md](./run-artifact-read-paths.md)

Problem: Removing the route fallback is not enough. The durable contract still needs confirmed `run_sources` SQL projection, finalization write, and rebuild path.

Work:
- Confirm whether `run_sources` exists and is populated at finalization.
- Confirm deleted-DB rebuild path.
- Add or update the missing pieces only after the contract is clear.

Proof:
- Schema/finalizer/rebuild coverage verified.
- Deleted-DB rebuild test or explicit characterization exists.

## H4. Deleted-DB rebuild coverage is uneven

Source: [test-coverage-invariants.md](./test-coverage-invariants.md)

Problem: Multiple rebuild paths have tests, but not every important projection has consistent "delete SQLite table/file -> rebuild from durable JSON -> assert rows" proof.

Work:
- Identify weak projections.
- Add targeted deleted-DB tests for those projections.
- Avoid brittle repo-wide source-text tests.

Proof:
- Rebuild tests assert row counts and representative values from durable JSON.

## H5. SQL-to-JSON mirror writes need consistent atomicity proof

Source: [test-coverage-invariants.md](./test-coverage-invariants.md)

Problem: Dual-write mutation paths need consistent proof that SQL and durable JSON mirrors update together.

Work:
- Inventory high-value dual-write mutations.
- Add tests that assert SQL rows and JSON mirrors after mutation.
- Make repair/rollback behavior explicit where true atomicity is not possible.

Proof:
- Contract tests for each touched mutation class.

## H6. Shared delete/reset paths need atomic helper coverage

Source: [test-coverage-invariants.md](./test-coverage-invariants.md)

Problem: `finderRoutes.js` and `deleteCandidate.js` have SQL-first then JSON-mirror windows without a shared atomic helper.

Work:
- Define the shared delete/reset write contract.
- Create or reuse a helper that coordinates SQL and JSON mirror writes.
- Cover failure/repair behavior.

Proof:
- Tests prove both SQL and JSON mirror state after delete/reset.

## H7. Malformed WS payloads need adversarial store-safety tests

Source: [test-coverage-invariants.md](./test-coverage-invariants.md), [websocket-schema.md](./websocket-schema.md)

Problem: Bad WS messages can reach UI state handlers without enough runtime validation.

Work:
- Add malformed fixtures for operations, data-change, and stream payloads.
- Assert Zustand/query cache state is not corrupted.

Proof:
- Adversarial tests pass.

## H8. Operations WS messages lack runtime shape validation

Source: [websocket-schema.md](./websocket-schema.md)

Problem: Operation upsert/remove payloads are trusted before mutating Zustand.

Work:
- Add runtime guards for operation messages.
- Reject/log malformed messages without state mutation.

Proof:
- Validator tests cover valid and invalid payloads.

## H9. Receive-side WS validation is inconsistent across channels

Source: [websocket-schema.md](./websocket-schema.md)

Problem: Several channel handlers rely on TypeScript casts rather than runtime validation.

Work:
- Add small validators for externally received channels.
- Start with channels that mutate Zustand or query cache.

Proof:
- Each changed channel has positive and negative validation coverage.

## H10. Screencast frame cache is unbounded

Source: [websocket-schema.md](./websocket-schema.md)

Problem: `lastScreencastFrames` can grow during long runs.

Work:
- Add LRU, TTL, or lifecycle cleanup.
- Keep behavior for the latest active frame.

Proof:
- Unit test or characterization proves eviction/cleanup.

## H11. No global error toast/notification contract

Source: [loading-error-ux.md](./loading-error-ux.md)

Problem: Query and mutation failures are often local, silent, or log-only.

Work:
- Define global error notification contract.
- Route shared API/query/mutation errors through it.

Proof:
- UI smoke proof for a representative failed query and mutation.

## H12. Mutation rollback is invisible to users

Source: [loading-error-ux.md](./loading-error-ux.md)

Problem: Optimistic rollback can make UI state jump back without explaining what failed.

Work:
- Pair rollback with toast or inline error.
- Provide retry only when safe.

Proof:
- Test or manual GUI proof for one rollback flow.

## H13. WS disconnect/reconnect state is silent

Source: [loading-error-ux.md](./loading-error-ux.md), [websocket-schema.md](./websocket-schema.md)

Problem: The app can reconnect softly, but users do not see connected/reconnecting/offline state.

Work:
- Add a connection status surface.
- Wire it to WS heartbeat/reconnect state.

Proof:
- GUI proof for connected, reconnecting, and offline states.

## H14. Major pages lack consistent skeleton/loading structure

Source: [loading-error-ux.md](./loading-error-ux.md)

Problem: Overview, Publisher, and Component Review do not have consistent loading structure.

Work:
- Add page-appropriate skeletons and stale-refetch indicators.
- Reuse existing UI primitives.

Proof:
- GUI proof for loading and refetch states.

## H15. Review drawer can keep stale `activeCell` after deletion

Source: [selection-focus-state.md](./selection-focus-state.md)

Problem: Review can stay focused on a product/field that was deleted elsewhere.

Work:
- Subscribe Review focus state to deletion events.
- Close the drawer with a visible notice when active entity disappears.

Proof:
- Test or GUI proof using cross-flow deletion.

## H16. No codegen drift guard after registry/codegen changes

Source: [codegen-drift.md](./codegen-drift.md)

Problem: Registry changes can ship without regenerated outputs.

Work:
- Add an approved validation command that runs codegen and fails on diff.
- Do not change package scripts without explicit approval.

Proof:
- Drift guard catches a generated-file mismatch.

## H17. Run-All fan-out is not visually synchronous

Source: [operations-queue-state.md](./operations-queue-state.md)

Problem: Bulk dispatch shows active rows one at a time, making users think some selected rows did not start.

Work:
- Pre-insert expected optimistic operation stubs before dispatching requests.
- Keep failure handling visible.

Proof:
- GUI proof that all selected rows show queued/running state immediately.
