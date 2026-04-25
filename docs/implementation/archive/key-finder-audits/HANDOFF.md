# Category Audit Report Generator — Handoff

**Date:** 2026-04-23
**Status:** Shipped + validated via generated category reports and per-key doc trees. Studio's Generate Key Finder Audit Reports button now calls the all-reports backend route.
**Test count:** 99/99 category-audit checks via in-process Node test harness · GUI TypeScript `npx tsc -b` green · normal `node --test` / Vite build currently blocked by sandbox `spawn EPERM`.
**Latest output:** `.workspace/reports/<category>-key-finder-audit.{html,md}` plus `.workspace/reports/per-key/<category>/...` for mouse, keyboard, and monitor. Latest per-key counts: mouse 76 written / 4 reserved, keyboard 99 / 4, monitor 109 / 4.

If you're picking this up cold, read this doc top-to-bottom once. Everything you need is linked from here.

---

## 1. What this is

A generator that produces per-category audit reports (paired HTML + Markdown) describing **every input the keyFinder pipeline consumes for every field** in a category — contract shape, enum, aliases, search hints, cross-field constraints, component relations, extraction guidance, resolved global fragments, tier bundles.

The report's job: **be a self-contained handoff document** an auditor (human or LLM) reads to produce a change-report of what to edit in Field Studio. The generator is the brief, the auditor's output is the deliverable.

The report has been proven to work end-to-end: two independent LLM runs consumed a generated brief and produced change-reports (see `.workspace/reports/audits/mouse_*.md`) that match the quality bar of the hand-authored originals in `docs/audits/keys/*.md`, with full 80-of-80 field coverage versus the originals' partial coverage.

---

## 2. The loop (how auditing works with this tool)

```
┌─ Field rules live at category_authority/<cat>/_generated/
│
├─ generateCategoryAuditReport()  ── reads rules + knownValues + component_db
│                                     + field_groups + global fragments + tier bundles
│                                   emits .workspace/reports/<cat>-key-finder-audit.{html,md}
│
├─ generatePerKeyDocs()           ── emits .workspace/reports/per-key/<cat>/<group>/<field_key>.{html,md}
│                                     with full field contract order + example-bank recipe per key
│
├─ Handoff .md to reviewer (human or LLM with web search)
│
├─ Reviewer produces a Change Report matching the shape in Auditor task §Part 1
│                                   (Verdict, Coverage, Audit standard, References spot-checked,
│                                    Highest-risk corrections, Field-by-field patches,
│                                    Enum cleanup, Component DB additions, Group audit, Flags)
│
├─ Human owner applies agreed-upon changes in Field Studio
│
├─ Recompile category rules (existing studio route: POST /studio/:category/compile)
│
└─ Regenerate the audit report → diff against prior run → loop
```

Rolling filenames mean each regeneration OVERWRITES the prior pair. Git is the audit trail.

### Operator rule: what "update DB" means here

Current system in one paragraph: the Key Finder audit generator reads compiled category rules from `category_authority/<cat>/_generated/`, emits category and per-key handoff reports, the reviewer returns a Field Studio change file, and the approved authoring change belongs in the durable control-plane map. Compile is the projection step that regenerates `_generated/*` and refreshes runtime SQL.

When the human points at Key Finder or a per-key Field Studio change file and says **update DB**, do this:

| Change-file section | Edit target |
|---|---|
| Mapping Studio - Enum Data Lists | `category_authority/<category>/_control_plane/field_studio_map.json` -> `data_lists[]` |
| Mapping Studio - Component Source Mapping | `category_authority/<category>/_control_plane/field_studio_map.json` -> `component_sources[]` |
| Key Navigator panels | `category_authority/<category>/_control_plane/field_studio_map.json` -> `field_overrides.<field_key>` |
| Key order / groups | `category_authority/<category>/_control_plane/field_key_order.json` and `field_overrides.*.ui.group`, only when explicitly requested |

Do not edit `_generated/*`, SQLite files, compiler, runtime, schema, API, or UI source code for a settings change. The human normally compiles after the map edit. If a setting does not appear in generated artifacts after compile, report that as a separate implementation gap.

---

## 3. Architecture

### Feature folder

```
src/features/category-audit/
├── index.js                    Public API
├── reportBuilder.js            Orchestrator: extract → render → write
├── reportData.js               Pure extractor: raw rules → ReportData
├── patternDetector.js          Enum signature grouping + suspicious-value detection
├── reportStructure.js          Shared structural blocks consumed by both renderers
├── reportHtml.js               HTML renderer (dark theme, TOC, collapsible details)
├── reportMarkdown.js           MD renderer — same content, plain skin
├── teaching.js                 Static prose for Part 1 (14 sections) + auditor task + audit standard
├── adapters/
│   └── keyFinderAdapter.js     renderKeyFinderPreview() — uses fieldRuleRenderers
├── api/
│   └── categoryAuditRoutes.js  POST /category-audit/:category/generate-report, /generate-per-key-docs, /generate-all-reports
├── tests/                      11 test files, 95 tests
└── README.md                   Domain contract
```

### Phase 0 — preparatory refactor (ALREADY DONE, don't re-do)

Five pure field-rule → prompt-text renderers were extracted out of `src/features/key/keyLlmAdapter.js` into `src/core/llm/prompts/fieldRuleRenderers.js`:

- `buildPrimaryKeyHeaderBlock`
- `buildFieldGuidanceBlock`
- `buildFieldContractBlock`
- `buildSearchHintsBlock`
- `buildCrossFieldConstraintsBlock`
- plus helpers `joinList`, `resolveDisplayName`

This lets category-audit reuse them without crossing feature boundaries (CLAUDE.md: features may only import core/ + shared/). A future indexing-audit adapter would import the same renderers.

`keyFinderPreviewPrompt.test.js` is the byte-parity safety net — if you ever touch those renderers, run `node --test src/features/key/tests/keyLlmAdapter.test.js src/features/key/tests/keyFinderPreviewPrompt.test.js` first and after.

### Public API

```js
import {
  generateCategoryAuditReport,   // orchestrator
  generatePerKeyDocs,             // one HTML+MD brief per non-reserved key
  extractReportData,              // pure extractor (for tests / alternate renderers)
  registerCategoryAuditRoutes,    // HTTP surface
} from 'src/features/category-audit/index.js';

// Synchronous file I/O + rendering, no LLM, no network
await generateCategoryAuditReport({
  category: 'mouse',
  consumer: 'key_finder',            // enum today; 'indexing' when adapter added
  loadedRules,                        // from loadFieldRules(category)
  fieldGroups,                        // JSON.parse(field_groups.json)
  globalFragments,                    // { identityIntro, evidenceContract, ... } resolved strings
  tierBundles,                        // parsed keyFinderTierSettingsJson
  compileSummary,                     // optional _compile_report.json subset
  outputRoot,                         // .workspace/reports
  now,                                // injectable Date for tests
}) => { htmlPath, mdPath, generatedAt, stats }

await generatePerKeyDocs({
  category: 'mouse',
  loadedRules,
  fieldGroups,
  globalFragments,
  tierBundles,
  compileSummary,
  outputRoot,                         // .workspace/reports
}) => { basePath, written, skipped, reservedKeysPath, generatedAt, counts }
```

### Consumer adapter pattern

`adapters/keyFinderAdapter.js` knows how to render per-key preview text for the keyFinder consumer. When indexing-audit arrives, add `adapters/indexingAdapter.js` with the same `renderPromptPreview(rule, fieldKey, opts) → preview` shape and register it in `reportBuilder.js`'s `SUPPORTED_CONSUMERS` set. Zero refactor of extractors or renderers.

---

## 4. How to regenerate reports (exact commands)

### From the command line

```bash
cd "C:/Users/Chris/Desktop/Spec Factory"
node --input-type=module -e "
import { loadFieldRules } from './src/field-rules/loader.js';
import { resolveGlobalPrompt } from './src/core/llm/prompts/globalPromptRegistry.js';
import { generateCategoryAuditReport, generatePerKeyDocs } from './src/features/category-audit/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const reportsDir = path.resolve('.workspace', 'reports');
const FRAGMENTS = ['identityIntro','identityWarningEasy','identityWarningMedium','identityWarningHard','siblingsExclusion','evidenceContract','evidenceVerification','evidenceKindGuidance','valueConfidenceRubric','scalarSourceTierStrategy','scalarSourceGuidanceCloser','unkPolicy','discoveryHistoryBlock','discoveryLogShape'];
const globalFragments = {};
for (const k of FRAGMENTS) { try { globalFragments[k] = resolveGlobalPrompt(k); } catch { globalFragments[k] = ''; } }
const tierBundles = { easy: { model: 'claude-haiku-4-5' }, medium: { model: 'claude-sonnet-4-6', thinking: true, thinkingEffort: 'low', webSearch: true }, hard: { model: 'claude-sonnet-4-6', useReasoning: true, thinking: true, thinkingEffort: 'high', webSearch: true }, very_hard: { model: 'claude-opus-4-7', useReasoning: true, thinking: true, webSearch: true }, fallback: { model: 'claude-sonnet-4-6' } };
for (const cat of ['mouse', 'keyboard', 'monitor']) {
  const loaded = await loadFieldRules(cat);
  const fieldGroups = JSON.parse(await fs.readFile(path.join('category_authority', cat, '_generated', 'field_groups.json'), 'utf8'));
  let compileSummary = null; try { compileSummary = JSON.parse(await fs.readFile(path.join('category_authority', cat, '_generated', '_compile_report.json'), 'utf8')); } catch {}
  await generateCategoryAuditReport({ category: cat, consumer: 'key_finder', loadedRules: loaded, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot: reportsDir });
  await generatePerKeyDocs({ category: cat, loadedRules: loaded, fieldGroups, globalFragments, tierBundles, compileSummary, outputRoot: reportsDir });
}
console.log('done');
"
```

### From the HTTP route

```
POST /api/v1/category-audit/:category/generate-all-reports
Body: { "consumer": "key_finder" }
Response: { categoryReport: { htmlPath, mdPath, generatedAt, stats }, perKeyDocs: { basePath, counts, reservedKeysPath, generatedAt } }
```

The route handler also exposes the lower-level `generate-report` and `generate-per-key-docs` endpoints for scripts, but Studio should use `generate-all-reports` so category and per-key artifacts stay in sync. The route handler returns `false` for unmatched paths (the dispatcher contract is `result !== false` = handled). Do not reintroduce `null` returns.

---

## 5. Report structure (what the auditor actually reads)

Section order, top to bottom:

1. **Header** — category name + generated timestamp + stats line
2. **Auditor task (read this first)** — `AUDITOR_TASK_BODY` in `teaching.js`. Tells the reviewer what to produce, names the return-format template exactly (mirrors the keyboard-audit shape: Verdict / Coverage / Audit standard / References spot-checked / Highest-risk corrections / Field-by-field patches / Enum cleanup / Component DB additions / Group audit / Flags).
3. **Audit standard (the bar you apply)** — `AUDIT_STANDARD_BODY` in `teaching.js`. The explicit evaluation criteria: Visual-answerable tier A/B/C framework, enum discipline with value-count thresholds, guidance discipline, contract discipline, evidence discipline, component discipline.
4. **Summary** — metrics table + top-10 highest-risk enums + category-level cross-field constraint inventory (only appears if constraints exist).
5. **Part 1 — How the keyFinder pipeline works** — 14 teaching sub-sections (purpose, template skeleton, field rule anatomy, contract value, filter UI, enum policies, tier routing, **field groups**, bundling, cross-field constraints, component relations, evidence, reserved keys, what `reasoning_note` is FOR/NOT FOR).
6. **Part 2 — Generic category prompt (compiled)** — template text with every category-level slot resolved to final wording. Runtime slots shown as labeled placeholders.
7. **Part 3 — Tier bundles** — easy/medium/hard/very_hard/fallback → model/reasoning/thinking/webSearch.
8. **Part 4 — Enum inventory** — every enum: policy, value count, filter-UI rendering, detected signature, full value list, suspicious values.
9. **Part 5 — Component DB inventory** — per component type: entities + properties + which fields are identities / subfields.
10. **Part 6 — Field groups** — overview table + per-group collapsible detail (members with contract/priority/enum/component summary, cross-group constraint couplings, 5 audit prompts per group).
11. **Part 7 — Per-key detail** — one block per `field_key` in group order. Every key starts with the full field contract authoring order (`priority.required_level`, `priority.availability`, `priority.difficulty`, `contract.type`, `contract.shape`, enum/filter, evidence/source, examples) and the 5-10 product example-bank recipe. Only after that does it show contract, enum/aliases/hints/constraints/component, and extraction guidance.

Standalone per-key docs mirror the same order and add the full compiled prompt + per-slot breakdown, so they are the right working surface when authoring a single key.

---

## 6. Current state — what's shipped

- **Phase 0 refactor:** complete. 70/70 keyFinder safety-net tests green post-extraction (byte-parity preserved).
- **Phase 1 feature:** complete. 99/99 category-audit checks green through direct in-process Node test imports. Normal `node --test` is blocked in this sandbox by `spawn EPERM`.
- **Phase 2 routes:** complete. `generate-report`, `generate-per-key-docs`, and `generate-all-reports` are available through `registerCategoryAuditRoutes`.
- **Phase 3 GUI button:** complete. `CompileReportsTab.tsx` calls `generate-all-reports` and displays category report paths plus the per-key docs root/counts.
- **Phase 4 smoke:** three categories generate cleanly for both category-level and per-key outputs.

Reports currently exist at:
- `.workspace/reports/mouse-key-finder-audit.{html,md}` and `.workspace/reports/per-key/mouse/` — 76 keyFinder docs, 4 reserved
- `.workspace/reports/keyboard-key-finder-audit.{html,md}` and `.workspace/reports/per-key/keyboard/` — 99 keyFinder docs, 4 reserved
- `.workspace/reports/monitor-key-finder-audit.{html,md}` and `.workspace/reports/per-key/monitor/` — 109 keyFinder docs, 4 reserved

Validated LLM-produced change reports:
- `.workspace/reports/audits/mouse_key_finder_audit_change_report.md` — 80/80 fields, 1,497 lines, from one LLM run
- `.workspace/reports/audits/mouse-key-finder-audit-change-report.md` — 80/80 fields, 1,409 lines, independent run
- Both converge on the same highest-risk findings — format is reproducible.

---

## 7. Findings the first LLM audit surfaced (real bugs to fix)

These are validated by **two independent LLM runs**. Not speculation — both reports caught the same items. Listed in rough priority order:

### A. `constraints` / `cross_field_constraints` prompt rendering (fixed)

Compiled rules store `constraints` as a string DSL (e.g. `"sensor_date <= release_date"`). The live renderer now normalizes both `constraints` DSL and structured `cross_field_constraints`, so cross-field constraints reach live keyFinder prompts and generated audit previews.

Concrete affected field: `sensor_date` (mouse) has `constraints: ["sensor_date <= release_date"]`; regenerated reports should list it as a live cross-field constraint to audit, not as a renderer gap.

### B. Global fragments not rendering into Part 2 (fixed)

Both LLM reviewers flagged: "the compiled prompt shows `SOURCE_TIER_STRATEGY` and `VALUE_CONFIDENCE_GUIDANCE` as not configured even though the registry summary has text." Fixed in `reportStructure.js` with explicit slot-to-fragment mapping for `SOURCE_TIER_STRATEGY`, `SCALAR_SOURCE_GUIDANCE_CLOSER`, and `VALUE_CONFIDENCE_GUIDANCE`. Covered by `reportMarkdown.test.js`.

### C. Enum pollution in `mouse` category

Multiple confirmed:
- `switch_type` contains `eqwe`, `yay`, unknown sentinels, mixed switch identities + mechanism classes → split into a closed mechanism enum (`mechanical | optical | optical-mechanical | inductive`) and keep model identities in `switch`.
- `connectivity` has `1`, `2.5`, `n/a`, `unk`, and three duplicate 2.4 GHz spellings → normalize.
- `coating` has `A`, `help` → clean to a small canonical finish vocabulary.
- `feet_material` has `l` → clean.
- `colors` is a 77-value closed enum owned by CEF. Either remove from keyFinder scope or split into CEF-managed base-color taxonomy.

### D. Component DB pollution

- `encoder_steps` contains a `hellow` string value. Should be numeric. Fix in the component_db/encoders.json source or in the compile step.
- Sensor + switch databases need current 2026 entries (Razer Focus Pro 50K Gen-3, Logitech HITS, Gen-4 optical).

### E. Type-contract mismatches

- `rgb`, `thumb_rest`, `flawless_sensor` are typed as strings but behave as booleans → change contract.type to boolean, drop the enum.
- `sensor_date` is a string with rounding → should be a date type.

### F. Empty `reasoning_note` across the board

100% of all 80 mouse keys, 103 keyboard keys, 113 monitor keys have empty `ai_assist.reasoning_note`. The audit cycle is exactly designed to fill these in — the LLM change reports propose paste-ready text. Apply those in Field Studio.

---

## 8. Deferred / open items (explicit non-goals this session)

1. **Benchmark ingestion / scoring.** Mouse benchmark data lives in `.workspace/reports/mouseData.xlsm`, sheet `dataEntry`, range `C2:BT83`. The audit docs now tell reviewers how to use benchmark examples, but the app still needs a category-agnostic benchmark runner that compares extracted outputs to those cells.
2. **Per-key "Consumer output shape" block in Part 7** (Option D from earlier). Would pull from published output to show what an extracted value actually renders as on the consumer site. Decided out of scope — Hub is downstream of the contract; auditors shape the contract, not retrofit from Hub state.
3. **Indexing pipeline adapter.** Architecture supports it (see `adapters/` + `SUPPORTED_CONSUMERS` in `reportBuilder.js`). Not implemented — wait until the indexing pipeline itself has stable per-key prompt generation worth auditing.
4. **`mouse_spec_guidelines.txt` cross-reference.** Originally considered referencing the hand-authored EG-HBS guidelines doc. User confirmed those won't exist going forward — removed from plan.

---

## 9. Design decisions + rationale

- **Feature-first feature folder (`src/features/category-audit/`).** Not under `src/features/key/` because the audit is category-scoped, cross-cutting, and will serve multiple consumers (keyFinder today, indexing tomorrow). Not under `src/features/studio/` because the audit is a read-only view, not a field-rule editor.
- **Preparatory refactor of 5 renderers into `src/core/llm/prompts/fieldRuleRenderers.js`.** Chosen over re-exporting from `src/features/key/index.js` because CLAUDE.md prohibits features importing other features' internals. The 5 renderers take a `fieldRule` and return a string block — pure core/llm/prompts concern, not keyFinder-specific.
- **Adapter pattern for consumers.** Each prompt consumer (keyFinder today, indexing later) registers an adapter exposing `renderPromptPreview(rule, fieldKey, opts)`. Adding a consumer is one file, not a refactor.
- **Rolling filenames, not timestamped.** Single pair per category — git is the audit trail. Avoids unbounded `.workspace/reports/` growth.
- **Two renderers (HTML + MD) walk a shared structure.** `reportStructure.js` produces `Block[]`; HTML and MD renderers each walk it. Adding a new section = edit one file; both output formats pick it up. No duplication.
- **Teaching prose in `teaching.js` as string constants.** Not hand-maintained HTML fragments. The MD renderer outputs markdown; the HTML renderer converts with a tiny inline markdown-to-HTML function (no dependency).
- **Tier A/B/C visual framework in the audit standard.** Explicit distinction between direct-visual fields (one-sentence guidance is enough), subtle-visual fields (where `reasoning_note` earns its keep — threshold rules, unk conditions), and non-visual fields (don't mention views). Added after the user pointed out not all visual fields are equally easy.
- **Enum discipline leads the auditor task.** User emphasized enum + filter-UI as the single biggest lever — every non-numeric value becomes a filter chip. Value-count thresholds (≤10 healthy → 30+ broken) are empirical, stated once in Part 1.6, referenced from the auditor task + audit standard.
- **Web search is explicit permission.** Reviewers have live internet. Told to use it for enum calibration against real products, terminology validation, claim spot-checking. "References spot-checked" section in the return-format template captures the evidence footprint.
- **Skip empty sub-blocks in Part 7.** Earlier versions padded every key with 7 sub-sections full of `(empty)` / `(none)` placeholders. Cut 25–35% of report volume without losing signal. Contract + Extraction-guidance headings still always print so unauthored cells remain visible.
- **Hoist alias-mismatch warning to Summary.** Earlier versions repeated it on every key block (80+ copies per report). Now appears exactly once with the full list of affected fields.

---

## 10. File map

| Path | Purpose |
|---|---|
| `src/core/llm/prompts/fieldRuleRenderers.js` | 5 pure field-rule → prompt-text renderers (NEW in Phase 0, shared with keyFinder) |
| `src/features/key/keyLlmAdapter.js` | MODIFIED — now imports the 5 renderers from fieldRuleRenderers |
| `src/features/category-audit/index.js` | Public API barrel |
| `src/features/category-audit/reportBuilder.js` | Orchestrator — load, extract, render, write |
| `src/features/category-audit/reportData.js` | Pure extractors: rules/known-values/component-db → normalized ReportData |
| `src/features/category-audit/patternDetector.js` | `analyzeEnum()` + `resolveFilterUi()` — signature grouping, suspicious-value detection |
| `src/features/category-audit/reportStructure.js` | Shared blocks the two renderers walk |
| `src/features/category-audit/reportHtml.js` | HTML renderer — dark theme, TOC, collapsible details, XSS-safe |
| `src/features/category-audit/reportMarkdown.js` | Markdown renderer |
| `src/features/category-audit/teaching.js` | Part 1 prose (14 sections) + auditor task + audit standard |
| `src/features/category-audit/adapters/keyFinderAdapter.js` | `renderKeyFinderPreview()` per-key block builder |
| `src/features/category-audit/api/categoryAuditRoutes.js` | POST /category-audit/:category/generate-report, /generate-per-key-docs, /generate-all-reports handler |
| `src/features/category-audit/tests/*.test.js` | 11 test files, 99 assertions total |
| `src/features/category-audit/README.md` | Domain contract per CLAUDE.md rules |
| `.workspace/reports/<cat>-key-finder-audit.{html,md}` | Generated output (rolling, not git-tracked) |
| `.workspace/reports/per-key/<cat>/` | Generated per-key HTML + Markdown briefs (rolling, not git-tracked) |
| `.workspace/reports/audits/mouse_*.md` | LLM-produced change reports (proof the loop works) |
| `docs/audits/keys/*.md` | Hand-authored original audits — quality benchmarks for the LLM output |

---

## 11. Extending the tool

### Add a new teaching section

1. Write the body as a string constant in `teaching.js`.
2. Push onto the array in `composeTeachingSections()`.
3. Regenerate — both HTML and MD pick it up automatically.

### Add a new consumer adapter (e.g. indexing)

1. Create `adapters/indexingAdapter.js` exporting `renderIndexingPreview(rule, fieldKey, opts) → preview`.
2. Add `'indexing'` to `SUPPORTED_CONSUMERS` in `reportBuilder.js`.
3. Dispatch to the correct adapter based on `consumer` arg in `buildPerKeySections` (current code hardcodes keyFinder — needs a small switch).
4. Filename convention: `<category>-<consumer>-audit.{html,md}` already in place.

### Add a new structural block type

Edit `reportStructure.js`'s Block union, then handle it in both `reportHtml.js:renderBlock()` and `reportMarkdown.js:renderBlock()`. Existing block kinds: `paragraph`, `bulletList`, `table`, `codeBlock`, `details`, `subheading`, `note`.

### Add a new pattern detector heuristic

Edit `patternDetector.js`. `analyzeEnum()` returns the analysis object that both Part 4 and per-key Part 7 consume. Don't add contract-type-specific logic here — the `filterUi` dispatch is already clean.

---

## 12. Tests

```bash
# Feature tests
node --test src/features/category-audit/tests/*.test.js

# Phase 0 safety net (run before any edit to fieldRuleRenderers.js)
node --test src/features/key/tests/keyLlmAdapter.test.js src/features/key/tests/keyFinderPreviewPrompt.test.js

# Downstream
node --test src/features/key/tests/*.test.js src/core/llm/prompts/tests/*.test.js
node --test src/features/indexing/pipeline/shared/tests/*.test.js src/engine/tests/*.test.js
node --test src/field-rules/tests/*.test.js src/features/studio/api/tests/*.test.js
```

Last verified: 2026-04-22. All green.

---

## 13. References

- **Original hand-authored audits (quality benchmarks):**
  - `docs/audits/keys/mouse_extraction_guidance_audit.md`
  - `docs/audits/keys/keyboard_extraction_guidance_audit.md`
  - `docs/audits/keys/monitor_extraction_guidance_audit.md`
- **LLM-produced change reports (proof of loop):** `.workspace/reports/audits/mouse_*.md`
- **keyFinder context:** `src/features/key/README.md`
- **Prompt fragments domain:** `src/core/llm/prompts/README.md`
- **Field rules loader:** `src/field-rules/loader.js` → `loadFieldRules(category, opts)`
- **Global prompt registry:** `src/core/llm/prompts/globalPromptRegistry.js` → `resolveGlobalPrompt(key)` + `GLOBAL_PROMPT_KEYS`
- **Tier bundles:** `settingsRegistry.keyFinderTierSettingsJson` (string-form JSON; parse at consumer)
- **Compiler output path convention:** `category_authority/<category>/_generated/{field_rules.json, known_values.json, field_groups.json, component_db/*.json, _compile_report.json}`
- **Planning artifact from initial design session:** `C:\Users\Chris\.claude\plans\refactored-roaming-hearth.md`

---

## 14. Known issues / tech debt (explicit)

1. **Regenerate existing `.workspace/reports` artifacts.** Older generated reports still contain the pre-fix constraints warning until the reports are regenerated from the updated generator.
2. **`encoder_steps: "hellow"`.** §7.D. Fix in source component DB or the compile step.
3. **Benchmark runner missing.** §8.1. The reports know how to use benchmark examples, but the app does not yet score Key Finder output against `.workspace/reports/mouseData.xlsm`.

---

**End of handoff.** If you're still uncertain after reading this, open the sibling `src/features/category-audit/README.md` (domain contract) and one of the `.workspace/reports/audits/mouse_*.md` files (sample LLM output). Those two plus this doc are the complete picture.
