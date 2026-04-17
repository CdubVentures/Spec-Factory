# Feature Audit Tests

Standalone, deterministic end-to-end audits for individual feature pipelines. Each folder holds a self-contained tool that runs its feature's scenarios against the real pipeline code using in-process test seams — no network, no LLM, no `.workspace/` contact.

Each tool emits a single-file HTML report showing pass/fail per scenario and per check.

## Why this folder exists

Some pipelines (CEF, PIF, etc.) have behavior that can only be fully validated end-to-end — Gate 1/2 rejection paths, PIF cascade deletion, variant_id stability across runs. Unit tests cover individual functions but can't prove the orchestrator wires them correctly.

Before this folder, we tried running these scenarios manually through the GUI with live LLMs. Modern models refuse to echo canned fake data (RLHF anti-fabrication training), producing false-green results. The fix: use the `_callLlmOverride` test seams already present in the orchestrators to inject deterministic responses.

## Structure

```
tools/feature-audit-tests/
  README.md           — this file
  cef/                — Color & Edition Finder audit (9 scenarios)
  (future)            — pif/, publisher/, etc.
```

Each feature folder owns a `run.js` CLI, scenario definitions, its own test env helpers, and a `report.html` output.

## How to add a new feature audit

1. Create a sibling folder: `tools/feature-audit-tests/<feature>/`.
2. Mirror the CEF layout: `run.js`, `scenarios.js`, `testEnv.js`, `report.js`, `fixtures/`, `README.md`.
3. Use the feature's `_callLlmOverride` (or equivalent test seam) — do not write HTTP mocks.
4. Use `.tmp/feature-audit/<feature>/` for per-scenario product roots.
5. Keep the report style aligned with CEF's for a consistent look.

## Running

No package.json script — run directly:

```
node tools/feature-audit-tests/cef/run.js
```

Exit code: 0 if all pass, 1 if any fail, 2 for bad flags, 3 if the tool itself crashed.
