# Phase 1 — Axis Simplification + Migration

Covers Phase 1 of `docs/implementation/key feature implemenation/per-key-finder-roadmap.html` (lines 769–828).

Status: **DRAFT — awaiting user approval before execution.**
Declared state at plan start: `[STATE: CONTRACT]`. Execution will cycle through `[STATE: CHARACTERIZATION] → [STATE: MACRO-RED] → [STATE: MACRO-GREEN] → [STATE: REFACTOR]` per the sequencing below.

---

## 1. Objective

Collapse the Field Studio axis vocabulary to the final four-axis shape so that Phase 2 (`keyFinder` LLM config) and Phase 3 (per-key finder feature) can index on a stable, minimal set of values. All ripple edits land in this one plan.

**Final axis shape (post-Phase-1):**

| Axis | Before | After | Mapping rule |
|---|---|---|---|
| `required_level` | `identity` \| `critical` \| `required` \| `expected` \| `optional` (5) | `mandatory` \| `non_mandatory` (2) | `identity`+`critical`+`required` → `mandatory`; `expected`+`optional` → `non_mandatory` |
| `availability` | `always` \| `expected` \| `sometimes` \| `rare` \| `editorial_only` (5) | `always` \| `sometimes` \| `rare` (3) | `always`+`expected` → `always`; `sometimes` → `sometimes`; `rare`+`editorial_only` → `rare` |
| `difficulty` | `easy` \| `medium` \| `hard` (3) | `easy` \| `medium` \| `hard` \| `very_hard` (4) | `very_hard` is a new manual tag; existing values unchanged |
| `effort` | numeric 1–10 (derived) | **DELETED** | Remove the axis entirely; downstream consumers switch to `difficulty` |

**Also deleted (GUI-only vocab never used in production data):** `editorial`, `commerce` (required_level); `instrumented` (difficulty).

**NOT touched (separate concept despite similar name):**
- `effort_level` on finder SQL/JSON stores — describes LLM reasoning budget (`minimal`/`low`/`medium`/`high`/`xhigh`).
- `src/shared/effortFromModelName.js` and callers — extracts reasoning budget from model IDs.
- These stay verbatim.

---

## 2. Entry and exit criteria

**Entry (must hold before starting):**
- Phase 0 characterization suite green on `main` (discoveryRankConstants, needSetStageWrapper, searchPlanEmissionProof, searchProfileStage). These lock pre-migration behavior so we can prove parity.
- Working tree clean or limited to WIP unrelated to the 25 target files.

**Exit (all must be true to close Phase 1):**
1. Every file in §4 migrated to the new vocabulary.
2. All `effort` references in the field-rule domain deleted (see §4.3). `effort_level`/`effortFromModelName` untouched.
3. GUI vocab (`fieldRuleTaxonomy.ts`, `studioPriority.ts`, `studioConstants.ts`, `EditableDataList`, `EditableComponentSource`) matches backend vocabulary: 2/3/4 values.
4. All `category_authority/**/rules*` + `category_authority/**/_generated/field_rules.json` migrated and re-validated by compiler.
5. `_control_plane/field_studio_map.json` files have no `effort` references.
6. `node --test` passes repo-wide.
7. Full GUI dev-server smoke: open Field Studio, confirm dropdowns show new vocab, no TypeScript errors, chips render correctly.

---

## 3. Prerequisites captured from audit (corrections vs roadmap)

The roadmap cited file paths that have since drifted. The plan below uses the **verified paths**.

| Roadmap path | Actual path (verified) |
|---|---|
| `src/features/indexing/pipeline/needSet/automationQueueHelpers.js` | `src/features/indexing/api/builders/automationQueueHelpers.js` |
| `build/generate-types.js` | `src/build/generate-types.js` |
| `src/features/review/reviewGridHelpers.js` | `src/features/review/domain/reviewGridHelpers.js` |
| `src/ingest/compilerArtifactBuilders.js` | `src/field-rules/compilerArtifactBuilders.js` |
| `src/ingest/compilerCategoryInit.js` | `src/field-rules/compilerCategoryInit.js` |
| `needSetStageWrapper.test.js` (root) | `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js` |
| `searchPlanEmissionProof.test.js` (root) | `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js` |
| `searchProfileStageCharacterization.test.js` (root) | `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js` |
| `listFieldsAndFieldReport.test.js` (root) | `src/field-rules/tests/listFieldsAndFieldReport.test.js` |

**New sites discovered during audit (not in the 16-file roadmap list):**

1. `src/field-rules/compiler.js:656,659` — branches on `required_level === 'required'` / `'critical'` for compile output.
2. `src/categories/loader.js:261` — additional `requiredLevel === 'required' || 'critical'` branch (roadmap only named lines 305–320).
3. `src/ingest/compileFieldInference.js:232,251` — branches on `required_level` values for `forceLevel` + `defaultMinEvidence` (roadmap only named the effort formula at line 195–197).
4. `src/ingest/compileFieldRuleBuilder.js:493` — `requiredLevel === 'identity' || 'required' ? 2 : 1` for `min_evidence_refs`.
5. `src/features/publisher/validation/shouldBlockUnkPublish.js:11` — `level === 'identity' || 'required'` gate on publish.
6. `src/engine/fieldRulesEngine.js:154` — `requiredLevel(...) === 'critical'` filter on `getCriticalFields()` (a LIVE function; only `getFieldsForRound` is dead).
7. `src/field-rules/compilerCategoryInit.js:72–84` — starter-field builder WRITES `required_level = 'editorial'` / `'commerce'` when group is editorial/commerce. Must update the mapping to write `'non_mandatory'` instead.
8. `src/indexlab/tests/needSetEngine.schema2-derived.test.js:26–27` — fixtures reference `required_level === 'identity'` / `'optional'`.

---

## 4. File inventory

### 4.1 Update (migrate values in place)

All 5→2 / 5→3 value translations follow the mapping in §1. Every `===` comparison against old values must become the corresponding new value. Rank maps must reduce to the new cardinality.

| # | File | Change |
|---|---|---|
| 1 | `src/shared/discoveryRankConstants.js` | `AVAILABILITY_RANKS` → 3 entries; `DIFFICULTY_RANKS` → 4 entries (add `very_hard: 3`); `REQUIRED_LEVEL_RANKS` → 2 entries; `mapRequiredLevelToBucket` → return `'core'` for `'mandatory'`, `'optional'` for `'non_mandatory'`, drop the `'secondary'` bucket *(or re-map `'secondary'` to `'optional'`; see §7 open decision)* |
| 2 | `src/features/indexing/pipeline/needSet/needsetEngine.js:56,63,626` | `NEED_SCORE_WEIGHTS` → `{ mandatory: 100, non_mandatory: 30 }`; `normalizeRequiredLevel` → collapse to 2 tokens; `missingCriticalFields` filter → `required_level === 'mandatory'`. **Behavior change documented in §6.** |
| 3 | `src/features/indexing/pipeline/needSet/searchPlanningContext.js:40,426` | `isCoreBucket` → `requiredLevel === 'mandatory'`; `secondaryUnresolvedCount` → drop the `expected` branch (collapsed into `mandatory`/`non_mandatory`); recalibrate `productivityScore` call sites |
| 4 | `src/features/indexing/api/builders/automationQueueHelpers.js:9–16` | 5-value priority score map → 2 values. Proposal: `mandatory → 20`, `non_mandatory → 70` (preserves rough mid-bucket rank) — **see §7 open decision** |
| 5 | `src/categories/loader.js:261,308–312` | All `requiredLevel === 'required' \| 'critical' \| 'identity' \| 'expected'` branches → `requiredLevel === 'mandatory'`; the `availability === 'expected'` branch → fold into `availability === 'always'` |
| 6 | `src/ingest/compileAssembler.js:139–176` | `identityKeys` / `criticalKeys` / `expectedEasy` / `expectedSometimes` / `deepFields` partitions → collapse to `mandatoryKeys` / `nonMandatoryKeys`. Ripple: every downstream consumer of these arrays (audit recursively before commit) |
| 7 | `src/build/generate-types.js:101–107` | `isCore` derivation → `requiredLevel === 'mandatory'` |
| 8 | `src/features/review/domain/reviewGridHelpers.js:129` | `required` flag → `level === 'mandatory'` |
| 9 | `src/engine/ruleAccessors.js:6–20` | Keep 4 active accessors (required_level, availability, difficulty, group); **delete** `ruleEffortAccessor` (lines 21–32) |
| 10 | `src/engine/fieldRulesEngine.js:154` | `getCriticalFields` filter → `requiredLevel === 'mandatory'`. Rename to `getMandatoryFields` (call sites: review/overrideWorkflow, qaJudge — update both) |
| 11 | `src/field-rules/compiler.js:656,659` | Collapse both branches to `required_level === 'mandatory'` |
| 12 | `src/ingest/compileFieldInference.js:232,251` | `forceLevel` → `expectedLevel === 'mandatory'`; `defaultMinEvidence` → `finalLevel === 'mandatory' ? 2 : 1` |
| 13 | `src/ingest/compileFieldRuleBuilder.js:493,691,715–719` | `min_evidence_refs` → `requiredLevel === 'mandatory' ? 2 : 1`. Leave `ai_assist.reasoning_note` storage intact (lines 691,715–719 are the per-key extraction guidance scaffolding reused by Phase 3) |
| 14 | `src/features/publisher/validation/shouldBlockUnkPublish.js:11` | `level === 'mandatory'` |
| 15 | `src/field-rules/compilerCategoryInit.js:72–84` | `requiredLevel = 'editorial'` → `'non_mandatory'`; `requiredLevel = 'commerce'` → `'non_mandatory'`; `availability = 'editorial_only'` → `'rare'`. Starter-field builder still emits valid post-migration vocab |
| 16 | `tools/gui-react/src/registries/fieldRuleTaxonomy.ts:18–41,95–105` | `REQUIRED_LEVEL_REGISTRY` → 2 entries; `DIFFICULTY_REGISTRY` → 4 entries (add `very_hard`, drop `instrumented`); `AVAILABILITY_REGISTRY` → 3 entries; remove `editorial`+`commerce` rows; delete `tagCls` `'effort'` kind + `toEffortBand` + `EFFORT_BOUNDS` |
| 17 | `tools/gui-react/src/utils/studioConstants.ts:81–84` | Tooltip text for dropdowns → new vocab |
| 18 | `tools/gui-react/src/features/studio/components/EditableDataList.tsx:296–318` | Enum dropdown options → new vocab |
| 19 | `tools/gui-react/src/features/studio/components/EditableComponentSource.tsx:426–448` | Enum dropdown options → new vocab |
| 20 | `tools/gui-react/src/features/studio/state/studioPriority.ts:14–149` | Rank maps, default profiles, priority grouping → new vocab; **remove** effort derivation branches |
| 21 | `src/features/studio/contracts/studioSchemas.js:11–16` | `PriorityProfileSchema` → remove `effort` field; keep the other three but they are now constrained strings (add `z.enum([...])` for each to enforce the new vocabulary at the trust boundary) |
| 22 | `src/features/studio/contracts/egPresets.js:87,136,185` | Example preset values → new vocab |

### 4.2 Delete (subtractive — no graveyards)

| # | File | What to delete | Why |
|---|---|---|---|
| D1 | `src/engine/fieldRulesEngine.js:190–206` | `getFieldsForRound` method | Dead code — audit grep confirms zero callers outside the file itself |
| D2 | `src/engine/ruleAccessors.js:21–32` | `ruleEffortAccessor` + its export | Effort axis being removed |
| D3 | `src/ingest/compileValidation.js:117,192–194` | Effort validation branch | Effort axis being removed |
| D4 | `src/ingest/compileFieldRuleBuilder.js:431,525–527,699` | Effort normalization blocks | Effort axis being removed |
| D5 | `src/ingest/compileFieldInference.js:195–197` | `easy→3 / medium→6 / hard→8` effort formula | Effort axis being removed |
| D6 | `src/ingest/compileUtils.js:116,124,129` | `default effort = 3` lines | Effort axis being removed |
| D7 | `src/ingest/categoryCompile.js:230,232,468` | Effort propagation | Effort axis being removed |
| D8 | `src/field-rules/compilerArtifactBuilders.js:277–296` | Effort emission into artifacts | Effort axis being removed |
| D9 | `src/field-rules/compiler.js:105,115,121` | Effort lines in compile pipeline | Effort axis being removed |
| D10 | `src/field-rules/compilerCategoryInit.js:94` | `effort: isScore ? 4 : 3` starter-field field | Effort axis being removed |
| D11 | `tools/gui-react/src/registries/fieldRuleTaxonomy.ts:5–14,95–105` | `EFFORT_BOUNDS`, `toEffortBand`, `tagCls('effort')` branch | Effort axis being removed |
| D12 | `src/features/studio/contracts/studioSchemas.js:15` | `effort: z.number().optional()` on `PriorityProfileSchema` | Effort axis being removed |

### 4.3 Keep (explicitly NOT in scope)

- `src/shared/effortFromModelName.js` and its tests.
- `src/shared/resolveEffortLabel.js` and its tests.
- `src/billing/costLedger.js:398` usage of `effort_level`.
- `src/core/llm/client/routing.js` usage of `effort_level`.
- `src/core/finder/finderJsonStore.js` / `finderSqlStore.js` columns named `effort_level`.
- Every test that asserts on `effort_level` as a reasoning-budget token.

These describe LLM reasoning budgets (`minimal`/`low`/`medium`/`high`/`xhigh`), not field-rule effort. Confusing overlap in naming only — roadmap §8 Phase 1 callout (orange warn box) explicitly says do not touch.

### 4.4 Data migration

| Target | Action |
|---|---|
| `category_authority/*/rules*.json` | In-place token rewrite using the mapping in §1. Atomic per file; written through a one-shot migration script under `scripts/migrations/phase-1-axis-collapse.js` |
| `category_authority/*/_generated/field_rules.json` | **Regenerate from source via the compiler** after §4.1 code edits land. Do not hand-edit these — they are artifacts |
| `category_authority/*/_generated/*.json` (remaining artifacts) | Regenerate through `npm run compile` (or equivalent) to pick up new accessor outputs |
| `category_authority/*/_control_plane/field_studio_map.json` | Scan for `effort` references; strip |
| `category_authority/*/_control_plane/*.json` (other) | Scan for stale vocab (`editorial`, `commerce`, `instrumented`, `editorial_only`); rewrite |
| `.workspace/products/**/*.json` | **Read-only, no migration needed.** Product records do not embed field-rule vocabulary — they store values, not rule metadata |
| `.workspace/db/**/spec.sqlite` | **No migration.** Rebuild contract means these can be regenerated from JSON; safer than a schema migration |

**Migration script contract** (`scripts/migrations/phase-1-axis-collapse.js`):
- Input: glob of JSON files under `category_authority/`.
- Output: mutated files with vocabulary translated, effort stripped.
- Dry-run flag prints diffs; real run requires `--commit`.
- Idempotent — running twice is a no-op.
- Logs counts per file: `required_level` migrations, `availability` migrations, `effort` deletions.

---

## 5. Order of operations (Macro-TDD)

Execution is gated by STATE transitions. Each step has a single commit unless coupling forces a larger one (memory: "bundle inseparable coupled changes").

### Step 1 — Characterization snapshots `[STATE: CHARACTERIZATION]`
1.1 Confirm Phase 0 characterization tests are green on current `main`. If any fail, halt with `[STATE: BLOCKED]` and surface the failure before doing anything else.
1.2 Capture the pre-migration snapshot of `category_authority/mouse/_generated/field_rules.json` shape into a characterization test fixture (ensures post-migration shape diffs land where expected).
1.3 Add a targeted characterization test that locks current `missingCriticalFields` output for a fixture with a field at each of the 5 `required_level` values — so the behavior expansion in §6 shows up as a **green new test** rather than a silent drift.

Exit: all characterization tests green; no production code changed.

### Step 2 — Update tests to new vocab first `[STATE: MACRO-RED]`
Tests first so the suite turns red in a targeted, predictable way.

2.1 Rewrite fixtures and assertions in:
- `src/shared/tests/discoveryRankConstants*.test.js` (and `Characterization` variant)
- `src/features/indexing/pipeline/needSet/tests/needSetStageWrapper.test.js`
- `src/features/indexing/pipeline/orchestration/tests/searchPlanEmissionProof.test.js`
- `src/features/indexing/pipeline/searchProfile/tests/searchProfileStageCharacterization.test.js`
- `src/categories/tests/sourceRegistryLoader.test.js`
- `src/categories/tests/categoryGeneratedLoader.test.js`
- `src/ingest/tests/mouse.compile.field-overrides.test.js`
- `src/field-rules/tests/listFieldsAndFieldReport.test.js`
- `src/field-rules/tests/fieldRulesEngine.policy.test.js` (**delete** the `getFieldsForRound` round tests per D1)
- `src/indexlab/tests/needSetEngine.schema2-derived.test.js`

2.2 Run `node --test`. The new assertions fail; count must match expected (record the number as evidence).

Exit: whole suite red in the expected places; no green false-positives.

### Step 3 — Migrate backend code `[STATE: MACRO-GREEN]`
Single bundled commit per CLAUDE.md "bundle inseparable coupled changes". Follow the file order in §4.1 (items 1–15), interleaving the `effort` deletions from §4.2 where they share a file.

3.1 Update §4.1 items 1–15 (non-GUI backend).
3.2 Apply §4.2 deletions D1–D10.
3.3 Run `node --test`. Whole suite green.

Exit: backend green; GUI still showing old vocab, which is OK until Step 4.

### Step 4 — Migrate GUI code `[STATE: MACRO-GREEN]`
4.1 Update §4.1 items 16–22 (GUI + studio contracts).
4.2 Apply §4.2 deletions D11–D12.
4.3 `npm run typecheck` and dev-server smoke: open Field Studio, confirm dropdowns + chips, check for zero TS errors.

Exit: GUI shows new vocab; backend + frontend suites green.

### Step 5 — Data migration `[STATE: MACRO-GREEN]`
5.1 Author `scripts/migrations/phase-1-axis-collapse.js` per §4.4.
5.2 Dry-run against `category_authority/`; review the diff.
5.3 Commit migration run (separate commit from code). Any field whose `required_level` didn't match the mapping fails loud — investigate, don't paper over.
5.4 Regenerate `_generated/field_rules.json` via compiler.
5.5 Run `node --test` one more time; run the compiler validation suite.
5.6 Open Field Studio on mouse category; verify every rule shows the new vocab.

Exit: all exit criteria in §2 satisfied.

### Step 6 — Tidy `[STATE: REFACTOR]`
6.1 Check for orphaned imports (unused `REQUIRED_LEVEL_RANKS` references, old constant imports).
6.2 Check for stale comments referencing the old vocabulary.
6.3 Re-read the diff against this plan; flag any drift.

No new behavior — pure cleanup. If anything behavioral surfaces, revert and go back to MACRO-RED for that slice.

---

## 6. Known behavior change (requires explicit acknowledgement)

**needsetEngine.js:626 — `missingCriticalFields` filter scope expands.**

- **Before:** includes fields where `required_level === 'identity' || 'critical'`.
- **After:** includes fields where `required_level === 'mandatory'` — which is `identity` + `critical` **+ `required`**.

Any field previously tagged `required` is now counted as "missing critical" when unresolved. This changes downstream:
- NeedSet planner seeds (more fields flagged).
- Search planner receives a larger missing-critical set.
- Review UI "required" flag already includes `required` per line 129 (no change there).

**Mitigation:**
- Step 1.3 characterization test explicitly records the expanded set so the diff is visible.
- Mouse category audit: count how many current field rules have `required_level === 'required'` to size the change.
- If the expansion causes runaway planner seeds, the fallback is to split `mandatory` back into two tiers — but that defeats the simplification goal. Prefer adjusting downstream consumers instead.

**User decision point before Step 3 begins:** confirm the behavior expansion is acceptable, or halt and revise the mapping.

---

## 7. Open decisions to lock before execution

| # | Question | Default recommendation |
|---|---|---|
| 7.1 | `mapRequiredLevelToBucket` currently emits three buckets (`core` / `secondary` / `optional`). Post-migration it has only two inputs — what bucket shape should it produce? | Collapse to two buckets (`core` / `optional`). Drop `secondary` callers or fold them into `optional`. Requires auditing `PRIORITY_BUCKET_ORDER` consumers before locking. |
| 7.2 | `automationQueueHelpers.js` priority score map (5 values → 2). What numeric weights? | `mandatory: 20`, `non_mandatory: 70` (preserves queue ordering between mandatory/non-mandatory work). Other values in the range (e.g., 10/80) are equivalent as long as mandatory < non_mandatory. |
| 7.3 | `searchPlanningContext.js:426` `secondaryUnresolvedCount` currently counts `'expected'` specifically. Delete the counter, or repurpose as `nonMandatoryUnresolvedCount`? | Repurpose. Downstream emission block (`searchPlanEmissionProof.test.js`) asserts on the count; deleting it is a behavior change the Phase 1 scope wants to avoid. |
| 7.4 | `fieldRulesEngine.getCriticalFields()` — keep the name or rename to `getMandatoryFields()` to match new vocabulary? | Rename. Otherwise we carry stale vocabulary into the method name and it contradicts CLAUDE.md Subtractive Engineering Mandate. Call sites: review/overrideWorkflow, qaJudge — both internal. |
| 7.5 | Add `z.enum([...])` to `PriorityProfileSchema` to enforce the new vocabulary at the Zod boundary? Currently they're `z.string().optional()`. | Yes. Enforces the migration at the trust boundary and catches stale data early. Per CLAUDE.md: "Validate at trust boundaries with zod or ajv." |

---

## 8. Rollback

If Step 5 data migration fails midway, the JSON → SQL rebuild contract protects us: delete `.workspace/db/**/spec.sqlite`, revert the code commit, re-run the compiler against the untouched rules files. No DB-level rollback is needed because SQL is derived.

If the behavior change in §6 produces measurable regression in planner/search quality, revert the NeedSet + searchPlanningContext commit alone (Steps 3.1 items 2–3) while keeping the rest of the migration. The axis vocabulary will still be collapsed; only the semantic threshold reverts.

---

## 9. Out of scope for this plan (ensured via memory: "don't bundle downstream")

- Phase 2: LLM config `keyFinder` phase + matrices (separate plan).
- Phase 3: per-key finder feature.
- Phase 6: RDF cutover to per-key finder.
- New very_hard tagging for existing rules. (Phase 1 only opens `very_hard` as a valid token; per-field retagging happens later.)
- GUI dashboard (Phase 4).

---

## 10. Acceptance checklist for user approval

Before executing, confirm:
- [ ] Mapping rules in §1 match intent.
- [ ] Behavior expansion in §6 is acceptable.
- [ ] Open decisions in §7 are resolved (or defer to in-flight conversation).
- [ ] Migration script location `scripts/migrations/phase-1-axis-collapse.js` is acceptable.
- [ ] Order of operations (Steps 1–6) is the right sequencing.

On user approval this plan transitions to `[STATE: CHARACTERIZATION]` at Step 1.
