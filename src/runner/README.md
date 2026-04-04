## Purpose

Single-pass product run orchestrator — executes one discovery + crawl cycle for a queued product.

## Public API (The Contract)

**`runUntilComplete.js`** — async orchestrator:
- `runUntilComplete({ storage, config, s3key, mode, specDb })` — main entry point

## Dependencies

Allowed: `src/pipeline/`, `src/categories/`, `src/features/indexing/`, `src/queue/`, `src/logger.js`
Forbidden: Other feature folders, GUI code

## Domain Invariants

- Single-pass execution — runs one `runProduct` call per invocation
- Queue state is updated (markRunning → recordResult) within the orchestrator
