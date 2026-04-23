# `src/features/extraction/plugins/crawl4ai/`

## Purpose

Transform-phase extraction plugin. For each successfully fetched URL, calls
a Python sidecar that runs `crawl4ai` on the already-rendered HTML and
persists one JSON artifact per URL at
`{runDir}/extractions/crawl4ai/<hash12>.json`. Produces raw collection
output only — no field candidates. The later bundle + LLM-reviewer phases
read these artifacts.

## Public API (The Contract)

- `crawl4aiPlugin` — the transform-phase plugin object registered in
  `src/features/extraction/plugins/pluginRegistry.js::EXTRACTION_PLUGIN_REGISTRY`.
  Conforms to the EXTRACTION_PLUGIN_REGISTRY shape (`name`, `phase`,
  `concurrent`, `onExtract`, `summarize`).
- `createCrawl4aiClient(opts)` — factory returning `{ start, stop, extract }`.
  One subprocess per IndexLab run, constructed in `src/pipeline/runProduct.js`
  and injected into the transform ctx via `ctxExtensions.crawl4aiClient`.
- `persistCrawl4aiArtifact(opts)` — writes a single JSON file. Returns
  metadata or `null` on failure. Idempotent on content_hash.

Re-exported from `src/features/extraction/index.js` for pipeline-layer use.

## Dependencies

- **Allowed imports from outside this folder:**
  - `src/shared/contentHash.js` — SHA-256 + 12-char slice for filenames.
  - `node:child_process`, `node:fs`, `node:path` — stdlib only.
- **Forbidden:**
  - Direct SQL / specDb access — plugin output is persisted to disk only
    in this phase. SQL projection is the responsibility of downstream
    phases (bundle + LLM reviewer).
  - Cross-feature imports (publisher, field-candidates, key-finder).
  - Hardcoded category / product names.

## Python sidecar

Python code lives at `pipeline-extraction-sidecar/pipeline_extraction_sidecar/`
(see that README for install + protocol). The Node-side code spawns the
sidecar on first use, NOT at pipeline boot — runs with `crawl4aiEnabled=false`
never pay the Python boot cost.

## Domain Invariants

1. **Sidecar receives only `{id, url, html, features}`.** The client strips
   any other keys before send. No env vars, no secrets, no auth tokens.
2. **Artifact filename = `<contentHash.slice(0,12)>.json`.** Same 12-char
   prefix as `html_file`, so downstream phases can join by content_hash.
3. **Idempotent writes.** Persister does temp-then-rename so readers never
   see half-written files. Repeated runs on the same content_hash overwrite
   in place.
4. **Failure is non-fatal.** Any plugin error (sidecar crash, timeout,
   JSON parse failure) returns `{status:'failed', reason}` and the run
   continues with screenshots + video + HTML intact.
5. **No FieldCandidate emission here.** This phase produces raw artifacts
   only. Candidate production belongs to the later LLM reviewer phase.
6. **The Node client auto-restarts the sidecar up to 3 times per run.**
   After exhaustion, remaining extract() calls reject immediately;
   bridge logs `crawl4ai_sidecar_error` with reason `max_restarts_exceeded`.
