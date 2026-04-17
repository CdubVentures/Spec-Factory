# CEF Feature Audit

Deterministic end-to-end validation of the Color & Edition Finder pipeline. Covers the 9 T-scenarios from `docs/features-html/cef-validation-tests.html` using `runColorEditionFinder`'s built-in test seams (`_callLlmOverride`, `_callIdentityCheckOverride`) — no network, no real LLM.

## Running

```
node tools/feature-audit-tests/cef/run.js
```

Options:
- `--only=T1,T2` — run a subset

Outputs:
- Console: per-scenario PASS/FAIL summary, final count, report path
- File: `tools/feature-audit-tests/cef/report.html` — single-file standalone report
- Exit code: 0 all-pass, 1 any-fail

Runtime: typically under 2 seconds total.

## Scenarios

| ID | Title | Gate |
| --- | --- | --- |
| T1 | Gate 1 Palette Rejection | Gate 1 |
| T2 | Gate 2 Judge Rejection (Hallucination Filter) | Gate 2 |
| T3 | Best Baseline — Complete Discovery | Happy path |
| T4 | Data Protected from Weak Run | Gate 2 (protection) |
| T5 | Stability — Same Data, No Churn | Stability |
| T6 | Label Upgrade via preferred_label | Label quality |
| T7 | Progressive Enrichment — 3 Runs | Accumulation |
| T8 | Wrong-Product Variant Hard-Delete + PIF Cascade | PIF cascade |
| T9 | Discontinued Variant Preserved | Preservation |

Each scenario definition lives in `scenarios.js` as a data object (id, title, steps, final assertions).

## Architecture

- `run.js` — CLI. Iterates scenarios, drives each via `runColorEditionFinder`, captures per-step CEF + PIF JSON state, runs assertion closures, aggregates into the HTML report.
- `scenarios.js` — pure scenario definitions. Each has `steps[]` (canned LLM payloads + optional pre/post hooks) and a `finalAssertions()` closure.
- `testEnv.js` — per-scenario isolation: temp `productRoot` under `.tmp/feature-audit/cef/`, in-memory SpecDb, AppDb stub, PIF seed/read helpers.
- `report.js` — single-file HTML renderer (inline CSS, matches `docs/features-html/` style).
- `fixtures/palette.js` — re-exports `EG_DEFAULT_COLORS` as `{ name, hex, css_var }` triples.
- `fixtures/compiledRules.js` — minimal fields + known_values fixture for the candidate gate.

## What this replaces

The prior approach was to run the 9 scenarios manually through the GUI with real LLMs following prompts in `docs/features-html/cef-validation-tests.html`. We confirmed empirically that every 2026 model tested (gpt-5.4-mini, deepseek-chat, gemini-2.5-flash-lite, gemini-3-flash-preview, gemini-2.5-flash) refuses to echo canned fake atoms — RLHF anti-fabrication training overrides the prompt. Result: false-green tests.

This tool bypasses the LLM entirely using the orchestrator's existing test seams, so Gate 1, Gate 2, label upgrades, data protection, and PIF cascade can all be exercised deterministically.

The HTML manual doc stays as reference for the behaviors being verified.

## Per-scenario state

After a run, each scenario's throwaway `productRoot` is preserved at `.tmp/feature-audit/cef/<id>-<timestamp>/` for postmortem inspection. Contents:

- `<productId>/product.json` — minimal product checkpoint
- `<productId>/color_edition.json` — CEF run history, variant_registry, selected
- `<productId>/product_images.json` — PIF state (only for T8)

Nothing in `.workspace/` is touched.

## Adding a new scenario

1. Add an object to `SCENARIOS` in `scenarios.js` — follow the T-shape: `id`, `title`, `description`, `gate`, `productId`, `steps[]`, `finalAssertions()`.
2. Steps: `label`, `cannedDiscovery` (required), `cannedJudge` (null for Run 1, object or function for Run 2+), optional `preStep` / `postStep` hooks.
3. `finalAssertions({ stepResults, productId, readCef, readPif, specDb }) => Check[]`.
4. Use the `check(name, pass, actual, expected)` helper exported from `scenarios.js`.

No test-runner wiring needed — `run.js` picks it up automatically.
