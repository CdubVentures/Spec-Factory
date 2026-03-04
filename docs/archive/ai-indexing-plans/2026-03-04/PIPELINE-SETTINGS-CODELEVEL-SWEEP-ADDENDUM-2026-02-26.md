# Pipeline Settings Code-Level Sweep Addendum - 2026-02-26

## Direct answer to your question
No, the first report was a full **tuning.csv + settings contract/UI** audit, not a literal full-code constant inventory.

This addendum is the code-level second pass I just ran.

## What this second pass covered
- `src/config.js` env/config knobs extraction (all `parseIntEnv/parseFloatEnv/parseBoolEnv/parseJsonEnv` keys + direct `process.env.*` usage).
- Cross-check between config env knobs and documented knobs in `implementation/ai-indexing-plans/tuning.csv`.
- Heuristic scan for uppercase hardcoded constants in core pipeline modules (`src/pipeline`, `src/search`, `src/research`, `src/retrieve`, `src/engine`, `src/extract`, `src/llm`).

## Findings

### 1) Config env knob coverage vs tuning inventory
- `parse*Env(...)` knob keys in `src/config.js`: **267**
- Of these, keys not mentioned in `tuning.csv` text: **49**
- Artifact:
  - `implementation/ai-indexing-plans/config-env-knobs-missing-from-tuning-2026-02-26.csv`

Examples from that 49-key gap:
- `LANE_CONCURRENCY_SEARCH`
- `LANE_CONCURRENCY_FETCH`
- `LANE_CONCURRENCY_PARSE`
- `LANE_CONCURRENCY_LLM`
- `LLM_MAX_OUTPUT_TOKENS_*_FALLBACK` keys
- `RUNTIME_SCREENCAST_*` keys
- `AUTHORITY_SNAPSHOT_ENABLED`

### 2) Tuning env references not backed by config env usage
- Explicit env/planned-env references in tuning inventory with no `src/config.js` env usage match: **23**
- Artifact:
  - `implementation/ai-indexing-plans/tuning-explicit-env-not-in-config-any-usage-2026-02-26.csv`

This 23-key set is mostly:
- Visual asset knobs (`VISUAL_ASSET_*`)
- Planned worker knobs (`WORKERS_SEARCH`, `WORKERS_FETCH`, `WORKERS_PARSE`, `WORKERS_LLM`)

### 3) Hardcoded constant sweep confirms additional non-UI constants
- Heuristic scan surfaced hardcoded uppercase constants in runtime paths (examples):
  - `DEFAULT_TIER_WEIGHTS` (`src/retrieve/tierAwareRetriever.js`)
  - `DOC_KIND_WEIGHTS` (`src/retrieve/tierAwareRetriever.js`)
  - `IDENTITY_MATCH_BONUS` (`src/research/serpReranker.js`)
  - `DEFAULT_NO_PROGRESS_LIMIT` (`src/pipeline/runOrchestrator.js`)
- Many are already represented in `tuning.csv` as hardcoded/no-control, but this confirms more code-level constants exist beyond GUI exposure.

## Confidence / remaining gap
- We now have high confidence on:
  - Documented tuning inventory coverage
  - Config env inventory coverage
  - Major hardcoded constant hotspots
- We do **not** yet have a mathematically complete AST-level inventory of every numeric/string literal used as a tuning threshold across all modules.

## Additional artifacts generated in this pass
- `implementation/ai-indexing-plans/config-env-knobs-missing-from-tuning-2026-02-26.csv`
- `implementation/ai-indexing-plans/tuning-knobs-not-backed-by-config-env-2026-02-26.csv`
- `implementation/ai-indexing-plans/tuning-explicit-env-not-in-config-any-usage-2026-02-26.csv`
- `implementation/ai-indexing-plans/ast-knob-inventory.snapshot.json`

## CI enforcement added
- Generator: `scripts/generateAstKnobInventory.js`
- Snapshot gate test: `test/astKnobInventorySnapshot.test.js`
- NPM commands:
  - `npm run audit:knobs` (check snapshot drift)
  - `npm run audit:knobs:write` (refresh snapshot)
- Current snapshot metrics:
  - scanned JS files: `299`
  - detected env knobs: `382`
  - detected knob-like hardcoded constants: `39`
  - detected knobs not represented in tuning inventory: `157`

## Recommended next step to guarantee “every setting”
- Expand detector coverage to include:
  - contract-backed knobs
  - exported constant knobs in non-`src` runtime surfaces where relevant
  - hardcoded threshold literals used in control-flow/comparison logic
- Keep CI gate strict by requiring snapshot refresh + documentation update when inventory changes.
