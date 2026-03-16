# Spec Factory — AGENTS.md

This file is read at session start and after every context compaction.  
It defines **non-negotiable rules** for any agent working in this repo when the assignment is **testing, live validation, debugging, rollout hardening, or optimization**.

---

## Mission of this AGENT

This AGENT is for work where the goal is to:

- run live tests against real models / real search / real traffic-like flows
- validate that the system works end to end, not just in isolated unit tests
- debug blockers using evidence, not guesswork
- optimize defaults, knobs, pacing, and model usage **without reducing truthfulness, explainability, or stability**
- harden the rollout so the site does not fail in production

**Primary success rule:** reliability and correctness come before speed, completeness, or feature expansion.

---

## Rule application (precedence + conflicts)

- Multiple `AGENTS.md` files may exist across the repo.

- **Nearest-file rules win** (the `AGENTS.md` closest to the file(s) being edited overrides higher-level rules).

- If a rule conflicts with an explicit human request, **STOP** and surface the conflict, **unless the user has specified that they are overriding that stop/ask behavior and wants you to proceed until finished**:

  - Quote the conflicting rule(s) and the human request.
  - Explain the smallest compliant alternative.
  - Do **not** proceed until the conflict is resolved, **unless the user has explicitly instructed you to continue through completion despite intermediate stop/ask checkpoints**.

---

## Mandatory STATE declaration (before any action)

Before any action (analysis, file edits, commands, plans, live runs, debugging, or commit steps), **start every response with exactly one** of:

- `[STATE: CONTRACT]`
- `[STATE: CHARACTERIZATION]`
- `[STATE: MACRO-RED]`
- `[STATE: MACRO-GREEN]`
- `[STATE: REFACTOR]`
- `[STATE: LIVE-VALIDATION]`
- `[STATE: BLOCKED]`

Additional rules:

- Exactly **one** STATE line per response.
- No file edits / commands / live runs / commit steps without declaring STATE first.
- If the correct state is unclear, default to `[STATE: CONTRACT]`.

State meanings:

- **CONTRACT**: Define or confirm scope, boundaries, rollout gate, inputs, outputs, invariants, and proof requirements.
- **CHARACTERIZATION**: Lock down current real behavior before changing it; ideal for legacy behavior and live-failure reproduction.
- **MACRO-RED**: Write the full failing test / proof matrix first.
- **MACRO-GREEN**: Implement the minimum required to make the agreed tests and proof checks pass.
- **REFACTOR**: Improve structure only after green; no behavior change allowed.
- **LIVE-VALIDATION**: Run real traffic / browser / model / queue / runtime-ops validation and collect evidence.
- **BLOCKED**: Progress is blocked by an ambiguity, architectural conflict, missing dependency, or unreproducible failure.

---

## Release-priority rule (non-negotiable)

When a rollout has named blockers or gates, the agent must work in this order:

1. **Known release blocker first**
2. **Proof of blocker resolution second**
3. **Only then foundation or feature expansion**
4. **Only after that tuning / optimization / broader rollout**

For the current rollout pattern, the agent must assume:

- **CP-0 / deterministic GUI lane stability** is a release gate
- **CP-1 / repair-signal handoff into durable queue execution** is a release gate
- Discovery-control-plane expansion must **not** start until active blocker gates are truly green in real behavior

**No phase drift:** if a blocking gate is red, the agent must not wander into unrelated implementation, cleanup, or optimization work.

---

## Core development philosophy

### TDD is non-negotiable

Every line of production code must be written in response to a failing test, characterization, or agreed proof obligation.

**RED → GREEN → REFACTOR**

- **RED**: Write failing tests / proof checks first.
- **GREEN**: Implement the minimum to make them pass.
- **REFACTOR**: Improve structure only after green.

### Real-proof rule

For testing / debugging / rollout work, **test green alone is not enough** when the change affects runtime orchestration, queues, search, model routing, browser flows, or GUI operations.

For these cases, completion requires:

- targeted automated proof
- full-suite regression proof
- at least one real run or live validation flow
- runtime-ops / GUI evidence when applicable
- explicit statement of what is proven vs not yet proven

---

## Contract-first Macro-TDD sequence (required)

For any new boundary / module / feature / rollout gate:

1. **Define the contract**
   - Inputs, outputs, errors, invariants, trust boundaries
   - Rollout phase / gate it belongs to
   - What is explicitly out of scope

2. **Write the full test / proof matrix**
   - Happy path
   - Edge cases
   - Null / empty / invalid
   - Failure routing
   - Negative assertions
   - Live-proof requirements when relevant

3. **Implement minimum code to pass**
   - No speculative features
   - No stealth refactors
   - No broad rewrites unless the contract explicitly calls for them

4. **Run proof in layers**
   - Targeted tests
   - Broader feature / integration tests
   - Full suite
   - Real or browser-backed validation if the contract requires it

5. **If complexity rises, recurse**
   - Extract a helper boundary with its own contract and test matrix

### Retirement / knob-removal testing rule

When a setting, knob, flag, payload field, or helper is retired, tests must focus on observable behavior and public contracts only.

Required proof:
- resolved config no longer carries it
- settings/API surfaces no longer accept or emit it
- relevant UI surface no longer exposes it
- live run still works

Disallowed by default:
- large repo-wide string-search tests
- tests that assert raw source text in many unrelated files
- retirement tests that couple to comments, labels, or file layout instead of behavior

If a broad cleanup audit is needed, use a one-time audit script or checklist, not a permanent brittle test file.

---



## Test exemptions (no-test changes)

The TDD mandate applies to **behavior** — logic that can produce wrong outputs.
The following change types are **exempt** from writing new tests:

- **Environment / config knobs** — Adding, renaming, or changing values in
  `.env`, `.env.example`, `src/core/config.*`, or `astro.config.*`.
  (Validation schemas like Zod already guard these at the trust boundary.)

- **CSS-only changes** — Token swaps, theme value tweaks, spacing/sizing
  adjustments, new utility classes, Tailwind config changes.
  (Visual correctness is verified by human eye via the Light/Dark Theme Gate,
  not unit tests.)

- **Static content / copy** — Changing text strings, alt text, aria labels,
  meta descriptions, or MDX prose (not frontmatter schema changes).

- **Docs-only** — Changes confined to `/docs`, `DOMAIN.md`, `README`,
  or inline comments.

- **Dependency version bumps** — Updating a lockfile or patch version
  (human-approved per dependency discipline).

**What is NOT exempt:**

- Anything that changes runtime branching, data transformation, or output shape.
- New or modified Zod schemas (these ARE behavior).
- CSS changes that involve JS-driven logic (dynamic classes, computed styles).

**Rule of thumb:** If the change can't produce a wrong *computed result* at
runtime, skip the test ceremony. If you're unsure, default to testing.

---

## Escalation mandate (The Loop Breaker)

- **Max 3 implementation attempts:** If the same failing behavior remains red after 3 consecutive implementation attempts, the agent is forbidden from continuing to guess.

  The agent must:

  - switch to `[STATE: BLOCKED]`
  - summarize what is known, what was tried, and the current evidence
  - ask for architectural direction or propose the smallest decision the human must make

- **No invented business logic:** If routing, acceptance policy, authority rules, or rollout semantics are ambiguous, do not guess.

---

## Testing / debugging / optimization priorities

### 1. Reliability before expansion

The agent must prefer:

- making deterministic lanes stable
- proving repair / retry / queue handoffs
- proving event emission and observability
- preventing wrong-value regressions

over:

- adding more sources
- turning on more models
- chasing fill-rate only
- broad performance tuning before correctness is stable

### 2. Correctness before speed

Do not optimize a path that is not yet proven correct.

### 3. Explainability before autonomy

If a system is “working” but the agent cannot explain why a value, queue event, or routing decision happened, the work is not complete.

### 4. Measure before tuning

Every optimization pass must define:

- baseline
- changed knobs / defaults
- expected effect
- before/after evidence
- regression checks

No “tuning by feel.”

---

## Live validation rules (non-negotiable)

When validating runtime behavior, the agent must use a layered proof model.

### Minimum proof stack for runtime-critical work

1. **Targeted automated test(s)** for the exact branch or defect
2. **Feature/integration test(s)** for the surrounding path
3. **Full-suite rerun** after the change
4. **Real run / browser-backed validation** when the behavior depends on live search, real fetches, model calls, queues, runtime ops, or GUI state
5. **Human-verifiable evidence** captured in the canonical log

### Real-run proof requirements (non-negotiable)

**Every testing phase MUST include at least one fully-enabled live run.** This is the primary proof — not unit tests, not script-based validation, not flag-off regression. The live run with real search, real LLM, real fetch, real products is what proves the system works.

"Fully enabled" means ALL of the following are active simultaneously:

- `searchProvider` set to `google` (the default for all live runs — best result quality). Only use an alternative provider if explicitly testing provider-specific behavior.
- `llmEnabled: true` with real API keys configured in `.env`
- `discoveryEnabled: true`
- Real product from the catalog (not synthetic test data)
- Real network fetches via Playwright headless browser
- Real search queries hitting real search engines
- Real LLM extraction/validation calls
  
  The following are always active and do not need to be specified in run commands because they cannot be turned off:
- SERP triage (deterministic + LLM reranking)
- Domain classification
- Evidence locking
- Core/Deep gate enforcement

**Do NOT substitute mock runs, dry runs, script-based validation, or flag-off checks as the primary proof.** Those are supplementary regression checks. The live run is what matters.

**Proof hierarchy (most authoritative → least):**

1. Fully-enabled live run with real product, real search, real LLM
2. Live server validation (API calls against running server)
3. Full-suite automated tests (4800+ tests)
4. Targeted automated tests
5. Script-based config/registry validation

Levels 2-5 are valuable but NEVER replace level 1.

When a real run completes, capture ALL of:

- run ID
- product / scenario (category + product-id + brand + model)
- start time + end time + exit code
- search queries executed (count + examples)
- pages fetched (count)
- LLM calls made (count)
- sources accepted (count + hosts + tiers)
- identity gate status
- fields filled vs total fields
- output artifacts produced
- what the run proves and what it does **not** prove

---

### Live-run commands reference (for all agents)

These commands are the standard operating procedure for every testing phase. Copy and adapt as needed.

#### 1. Start the server stack

```bash
# Option A: dev-stack-control (starts both API + GUI)
node tools/dev-stack-control.js start-stack
# API: http://localhost:8788
# GUI: http://localhost:5183

# Option B: API server only (if GUI is not needed)
node src/api/guiServer.js
```

#### 2. Verify server health

```bash
# Health check
curl -s http://localhost:8788/api/v1/health
# Expected: {"ok":true}

# List categories
curl -s http://localhost:8788/api/v1/categories
# Expected: ["keyboard","monitor","mouse","mouse_run_sync_gui"]
```

#### 3. Start a fully-enabled live run

**Mouse — Razer Viper V3 Pro (standard test product):**
```bash
curl -s -X POST http://localhost:8788/api/v1/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "category": "mouse",
    "productId": "mouse-razer-viper-v3-pro",
    "brand": "Razer",
    "model": "Viper V3 Pro",
    "mode": "indexlab",
    "searchProvider": "google",
    "llmEnabled": true,
    "discoveryEnabled": true,
    "maxUrlsPerProduct": 30,
    "maxRunSeconds": 300
  }'
```

**Mouse — Logitech G Pro X Superlight 2 (alternative test product):**
```bash
curl -s -X POST http://localhost:8788/api/v1/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "category": "mouse",
    "productId": "mouse-logitech-g-pro-x-superlight-2",
    "brand": "Logitech",
    "model": "G Pro X Superlight 2",
    "mode": "indexlab",
    "searchProvider": "google",
    "llmEnabled": true,
    "discoveryEnabled": true,
    "maxUrlsPerProduct": 30,
    "maxRunSeconds": 300
  }'
```

**Template for any product (replace placeholders):**
```bash
curl -s -X POST http://localhost:8788/api/v1/process/start \
  -H "Content-Type: application/json" \
  -d '{
    "category": "<CATEGORY>",
    "productId": "<PRODUCT_ID>",
    "brand": "<BRAND>",
    "model": "<MODEL>",
    "mode": "indexlab",
    "searchProvider": "google",
    "llmEnabled": true,
    "discoveryEnabled": true,
    "maxUrlsPerProduct": 30,
    "maxRunSeconds": 300
  }'
```

#### 4. Monitor run progress

```bash
# Poll status (running/completed/failed)
curl -s http://localhost:8788/api/v1/process/status
# Key fields: running, exitCode, startedAt, endedAt, run_id
```

Wait for `"running": false` and `"exitCode": 0` before collecting evidence.

#### 5. Locate run output files

Run outputs are split across two locations:

**Primary output (spec + summary + provenance):**
```
%TEMP%/spec-factory/output/runs/<category>/<product-id>/<run-id>/
  spec.json              — final field values
  summary.json           — validation status, needset, publish blockers
  traffic_light.json     — per-field red/yellow/green status
  provenance.json        — per-field evidence chain
  evidence/
    evidence_pack.json   — full evidence pack
    sources.jsonl        — accepted source records (host, tier, identity score)
```

**Trace output (search, fetch, LLM, planner details):**
```
%TEMP%/spec-factory/output/specs/outputs/specs/outputs/_runtime/traces/runs/<run-id>/<product-id>/
  search/                — search query traces (query_hash_NNN.json)
  fetch/                 — page fetch traces (fetch_NNN.json)
  llm/                   — LLM call traces (call_NNN.json)
  planner/               — planner snapshots
  fields/                — field extraction traces
  fetch_html_preview/    — HTML preview captures
  fetch_network_preview/ — network activity captures
```

**IPC output (needset, events, search profile):**
```
%TEMP%/spec-factory/indexlab/ipc_exit_<timestamp>/
  run.json               — run metadata
  search_profile.json    — search queries + results
  needset.json           — field need analysis
  run_events.ndjson      — full event stream
  runtime_screencast/    — screencast frames
```

#### 6. Collect evidence after run completes

**Count trace artifacts:**
```bash
TRACE_DIR="%TEMP%/spec-factory/output/specs/outputs/specs/outputs/_runtime/traces/runs/<RUN_ID>/<PRODUCT_ID>"
echo "Search:" && ls "$TRACE_DIR/search/" | wc -l
echo "Fetch:" && ls "$TRACE_DIR/fetch/" | wc -l
echo "LLM:" && ls "$TRACE_DIR/llm/" | wc -l
```

**Read accepted sources:**
```bash
cat "%TEMP%/spec-factory/output/runs/<CATEGORY>/<PRODUCT_ID>/<RUN_ID>/evidence/sources.jsonl"
```

**Read run summary:**
```bash
node -e "const s = require('%TEMP%/spec-factory/output/runs/<CATEGORY>/<PRODUCT_ID>/<RUN_ID>/summary.json'); console.log('validated:', s.validated, 'confidence:', s.confidence, 'fields_below_pass:', s.fields_below_pass_target.length, 'publishable:', s.publishable)"
```

**Read spec field fill rate:**
```bash
node -e "const s = require('%TEMP%/spec-factory/output/runs/<CATEGORY>/<PRODUCT_ID>/<RUN_ID>/spec.json'); const total = Object.keys(s).filter(k => !['id','brand','model','base_model','category'].includes(k)).length; const filled = Object.entries(s).filter(([k,v]) => !['id','brand','model','base_model','category'].includes(k) && v !== 'unk').length; console.log(filled + '/' + total + ' fields filled')"
```

#### 7. Verify config defaults at runtime

```bash
node -e "
import { loadConfig, loadDotEnvFile } from './src/config.js';
loadDotEnvFile();
const c = loadConfig();
console.log('searchProvider:', c.searchProvider);
console.log('llmEnabled:', c.llmEnabled);
console.log('enableSourceRegistry:', c.enableSourceRegistry);
console.log('enableDomainHintResolverV2:', c.enableDomainHintResolverV2);
console.log('enableQueryCompiler:', c.enableQueryCompiler);
console.log('enableCoreDeepGates:', c.enableCoreDeepGates);
"
```

#### 8. Validate category registry + population gate

```bash
node -e "
import { loadCategoryConfig } from './src/categories/loader.js';
for (const cat of ['mouse', 'keyboard', 'monitor']) {
  const cfg = await loadCategoryConfig(cat, { config: { enableSourceRegistry: true } });
  const reg = cfg.validatedRegistry;
  const gate = cfg.registryPopulationGate;
  console.log(cat, ':', reg.entries.length, 'entries, gate:', gate.passed);
}
"
```

#### 9. Build and verify EffectiveHostPlan

```bash
node -e "
import { loadCategoryConfig } from './src/categories/loader.js';
import { buildEffectiveHostPlan } from './src/features/indexing/discovery/domainHintResolver.js';
const cfg = await loadCategoryConfig('mouse', { config: { enableSourceRegistry: true } });
const plan = buildEffectiveHostPlan({
  domainHints: ['razer.com', 'retailer', 'manual'],
  registry: cfg.validatedRegistry,
  providerName: 'google',
  brandResolutionHints: ['razer.com'],
});
console.log('searchable:', plan.host_groups.filter(g => g.searchable).map(g => g.host));
console.log('excluded:', plan.host_groups.filter(g => !g.searchable).map(g => g.host));
console.log('unresolved:', plan.unresolved_tokens);
"
```

#### 10. Run full test suite

```bash
# Full suite (should be 4800+ tests, 0 failures)
npm test 2>&1 | tail -5

# Single test file
node --test test/<filename>.test.js
```

### Required live-run evidence table format

Every testing phase report MUST include a table like this (fill in all fields):

```markdown
### Fully-Enabled Live Run Evidence

| Field | Value |
|---|---|
| Run ID | `<run-id>` |
| Product / scenario | `<product-id>` (<Brand> <Model>) |
| Settings | discovery-enabled=true, search-provider=google, LLM=enabled |
| Duration | ~X min (HH:MM:SS → HH:MM:SS UTC) |
| Exit code | 0 (success) / non-zero (explain) |
| Search queries | N real Google queries (M results total) |
| Query examples | "Brand Model Field manual", "Brand Model specification" |
| Pages fetched | N real page fetches (Playwright headless) |
| LLM calls | N real LLM extraction/validation calls |
| Sources accepted | N (list hosts + tiers) |
| Identity gate | PASS / CONFLICT / explanation |
| Fields filled | X/Y |
| Output artifacts | list of files produced |
| What this proves | <specific claim about what the live run demonstrates> |
| What this does NOT prove | <honest gaps — e.g., identity gate blocked fill> |
```

If the live run fails or produces unexpected results, that is ALSO evidence — record it, debug it, fix it, re-run.

---

### Runtime-ops proof requirements

If a runtime-ops page exists, the agent must inspect it when validating queue / worker / GUI flows and record:

- the route used (for example, `#/runtime-ops`)
- the specific run IDs inspected
- relevant counters / panels / worker states
- screenshots or saved notes for the canonical log when requested

### Real-proof interpretation rule

The agent must not confuse adjacent proof with actual proof.

Examples:

- “queue is alive” does **not** prove “repair handoff works”
- “domain_backoff happened” does **not** prove “repair_search happened”
- “test passed once” does **not** prove “flake resolved”
- “fill rate improved” does **not** prove “wrong-value rate is safe”

---

## Debugging rules (non-negotiable)

### Symptom-chain debugging

For live failures, the agent must identify the exact drop point in the chain.

Required technique:

1. expected trigger
2. observed event / state
3. next expected transition
4. actual transition
5. first divergence point

### Instrument before guessing

When the failure path is unclear, add temporary or scoped diagnostics at each decision point.

At minimum, log / expose:

- input condition
- classification
- gate result
- chosen branch
- enqueue attempt
- enqueue success/failure
- metric/event emission
- final state

### Characterize before changing behavior

When real behavior contradicts expectations:

- write characterization first
- reproduce the observed behavior in a targeted test if possible
- then write the desired test
- then change logic

### One root-cause target at a time

Do not change five independent systems in one debugging pass.

---

## Optimization rules (non-negotiable)

Optimization work is allowed only when the target path is already correct enough to measure.

### Hard optimization rules

- No optimization without a named bottleneck
- No knob changes without recording old value and new value
- No “maximum everything” defaults unless validated against cost, truthfulness, block rate, and queue pressure
- No shipping tuned defaults unless the user-facing settings are synchronized with those defaults or intentionally reset
- Optimize in bounded passes, not endless thrashing

### Required optimization metrics

Measure the relevant subset of:

- field fill rate
- wrong-value rate
- searches per product
- URLs fetched per product
- time-to-first-citation
- queue latency
- queue depth / backlog
- block / challenge rate
- model latency
- model cost / token usage
- parse success rate by doc type
- repair success rate

### Default-setting discipline

If the task includes GUI knobs or runtime controls:

- agents must run live tests with the actual defaults they recommend
- recommended defaults must be synced back into the product or explicitly documented as temporary test-only values
- no hidden “best settings” that are not reflected in the UI or config

---

## Local AI / live model rules

Models may be run live for validation and optimization, but must follow these boundaries:

### Local / helper models may assist with

- bounded triage
- routing
- unresolved token classification
- safe synonym expansion
- page/chunk prioritization
- screenshot/spec-table triage
- evidence reduction / summarization **after** deterministic capture

### Models may not silently become authoritative for

- canonical facts
- final publication truth
- host or URL invention
- source-authority override
- acceptance-policy override

### Critical-path rule

The system must still succeed with local helper AI disabled unless the human explicitly approves a new dependency model.

### Validation rule

Whenever model behavior is part of the proof, the agent must record:

- model name
- enabled/disabled state
- what role it played
- whether the system still works with the model off

---

## Rollout mechanics (non-negotiable)

### No big-bang flips

For risky changes, the agent must prefer:

- artifact/test-only phase first
- shadow mode second
- canary / limited rollout third
- default-on only after evidence clears gates

### Flag discipline

Every risky rollout step should have:

- a feature flag
- an explicit enable condition
- a rollback path
- a stated exit gate

### Gate semantics

A gate is green only when the required proof has been collected. “Seems good” is not green.

---

## Canonical test / remediation log (non-negotiable)

When the human instructs the agent to continue until fully finished, the agent must maintain **one canonical test log / remediation log** as the source of truth.

That log must capture, in-place:

- each defect or blocker
- reproduction evidence
- tests added
- code changes made
- retest results
- regression results
- live validation results
- screenshots / notes / run IDs when relevant
- final disposition: open / fixed / verified / blocked

### Log discipline

- The log must be updated continuously.
- The agent must repeatedly return to the log and close open items.
- The agent must not stop at “mostly working.”
- Partial success is not closure when known red items remain.

---

## Completion proof for runtime-critical work

Work involving live search, queue routing, repair flows, runtime ops, browser flows, or live model orchestration is only complete when all applicable proof exists:

- targeted test green
- surrounding integration proof green
- full suite green
- real run / browser validation green
- canonical log updated
- remaining uncertainty explicitly listed

If any one of those is missing, the agent must say the work is **partially proven**, not complete.

---

## Characterization wall (legacy / untested code)

If refactoring, extracting, or reorganizing untested or legacy code:

- Write golden-master characterization tests first.
- No behavior changes until current behavior is captured and green.
- Only after characterization can extraction / refactor begin.

---

## Decomposition safety rule (extraction / refactor)

When decomposing, extracting, or refactoring existing code, **existing behavior must never break**.

1. Baseline must be green first.
2. Add characterization tests where coverage is missing.
3. Move in the smallest possible increments.
4. Extracted modules must produce identical outputs for identical inputs.
5. No behavior change during `REFACTOR`.
6. If tests go red during refactor, revert the refactor, not the tests.
7. For runtime-critical flows, require proof on at least one real product/run before declaring extraction complete.

---

## Git operations (strictly local read-only)

- **No network / remote commands:** The agent is forbidden from running `git fetch`, `git pull`, `git push`, or interacting with remotes.
- **No working-tree mutation via git:** The agent is forbidden from running `git checkout`, `git reset`, `git clean`, `git stash`, `git add`, or `git commit`.
- **Safe context only:** Allowed read-only commands include `git status`, `git diff`, `git log`, `git show`.

The human handles syncing, branching, staging, and commits.

---



## Testing rules

- Test behavior over implementation.
- Prefer public APIs and observable outcomes.
- Use Node built-in runner: `node --test`.
- Root `test/` is allowed for integration / E2E / smoke.
- Table-driven tests are preferred for provider matrices, routing matrices, and fallback behavior.
- Negative assertions are required when the contract says something must **never** happen.

### Required test categories when applicable

- characterization
- unit / module
- integration / feature
- regression
- live-validation note or script

---

## Architecture rules for test scaffolding

- Organize new test support code by domain, not generic junk drawers.
- Use explicit public exports from `src/features/<feature>/index.js` when crossing boundaries.
- No circular dependencies.
- No “temporary” helpers in random folders.

---

## Code style & file discipline

- Prefer immutable data and pure functions.
- Prefer early returns over nested conditionals.
- Prefer options objects over long positional parameter lists.
- Keep diagnostics scoped and removable.
- Mark temporary debug instrumentation clearly.
- Remove or downgrade temporary instrumentation once proof is captured, unless it is intentionally promoted to permanent observability.

---

## Dependency discipline

- No new packages without explicit human approval.
- Prefer existing deps and standard APIs.
- If a better result needs a new package, stop and justify it.

---

## Security & secrets

- No hardcoded secrets.
- Use env vars.
- Do not leak server-only values into client code.
- No PII logging.
- When adding diagnostics, avoid dumping sensitive request bodies or tokens.

---

## Data persistence & config discipline

- Mutable runtime state does not belong in ad-hoc JSON files.
- JSON may be used for config / artifacts when intentionally defined as such.
- If a rollout phase calls for a canonical artifact or registry, treat that file as a contract and validate it.
- No hidden config drift between code defaults, UI defaults, and documented defaults.

---

## Single Source of Truth (SSOT)

- Never duplicate canonical domain state.
- Derive whenever possible.
- Caches must be labeled as derived and have invalidation rules.
- UI-only local state is allowed only for temporary presentation concerns.
- For debugging and rollout work, the **canonical test log** is the SSOT for current task status.

---

## Domain Contracts (Local Architecture)

Each domain boundary (`src/core`, `src/shared`, `src/features/<name>`) must contain exactly one structural map: `DOMAIN.md`.

Rules for `DOMAIN.md`:

- Update it only when public API, core data schema, or boundary dependencies change.
- No file trees.
- No test statuses.
- Keep it concise.

---

## Documentation & architecture mapping

- Testing and rollout work must leave behind enough documentation to understand what changed, why, and how it was proven.
- When the human asks for a testing/rollout AGENT or master plan, documentation should clearly separate:
  - blockers
  - proof collected
  - remaining risk
  - next gate

---

## Exception protocol

- No silent rule-bending.
- If an exception is required:
  - explain why
  - propose the smallest possible exception
  - get explicit human approval
  - contain it
  - document cleanup or rollback plan

---

## Bottom-line operating rule

The agent must behave like a release-hardening engineer, not a hopeful coder.

That means:

- prove before claiming green
- debug by evidence, not intuition
- optimize only after correctness is stable
- keep defaults, logs, and UI in sync
- do not move to the next phase while the current gate is still red
- do not declare success until the system is proven in the way the rollout actually depends on


---

## Cumulative tuning log (non-negotiable)

Across the full rollout, the agent must maintain **one cumulative tuning log** as a persistent artifact alongside the canonical test log. This log survives phase boundaries — it is NOT reset between phases.

### Required file

`implementation/ai-indexing-plans/TUNING-LOG.md`

### Purpose

Every knob, default, weight, threshold, and config value that is measured and adjusted during any phase must be recorded so that:

- the next phase inherits the tuned state, not the original defaults
- any agent (including after context compaction) can see what was changed, why, and whether it was promoted
- the Phase 10 full tuning audit has a single source to verify against
- no tuning residue is left in runtime memory, dev panels, or undocumented knowledge

### Every entry must include

- **Phase** — which testing phase made the change
- **Setting** — exact env var, config key, or hardcoded constant name
- **Prior value** — what it was before
- **Tested values** — what was tried
- **Final value** — what was promoted (or "reverted" if rejected)
- **Measured impact** — before/after metrics with evidence
- **Promoted to config?** — Yes (with file path) / No (test-only) / Reverted
- **Server verified?** — Yes / No
- **UI verified?** — Yes / No / N/A
- **Fresh session verified?** — Yes / No / N/A

### Rules

1. **Update on every tuning decision** — during the phase, not after.
2. **Include reversions** — failed experiments are data. Log with "Reverted" and the reason.
3. **No orphaned tuning** — if a runtime value is changed for testing, it must be promoted to config or reverted before the phase exits.
4. **Phase 10 audits against this log** — if an entry is missing, the go/no-go gate cannot clear.
5. **Read this log at session start** — do not assume defaults. Check the log for current tuned state.
6. **Cross-reference with testing phase files** — phase file tuning tables are the working area. The cumulative log is the persistent record. When a phase exits, decisions must be reflected in both.

## Process Safety

- NEVER kill, terminate, or stop Node.js processes that are running Claude Code, Codex, or any AI agent sessions.
- NEVER blindly kill PIDs. Always inspect a PID first (e.g., `ps -p <pid> -o comm=`) to confirm it's not an active Claude, Codex, or agent session before terminating.
- Before running `kill`, `pkill`, `killall`, or similar commands targeting Node.js or unknown PIDs, always verify what the process is.
- When cleaning up processes, explicitly exclude anything matching `claude`, `codex`, or related agent runtimes.

## Multi-Agent Port Isolation (non-negotiable)

When multiple agents work concurrently in this repo, each agent MUST use its own isolated server instance. Shared servers cause run collisions, artifact corruption, and false proof.

### Port Assignment

Each agent session must use a unique port pair. Before starting any server, the agent must declare its ports:

| Agent Slot | API Port | GUI Port | Env Override |
|---|---|---|---|
| Agent A (primary) | 8788 | 5183 | Default — no override needed |
| Agent B | 8789 | 5184 | `PORT=8789 GUI_PORT=5184` |
| Agent C | 8790 | 5185 | `PORT=8790 GUI_PORT=5185` |
| Agent D | 8791 | 5186 | `PORT=8791 GUI_PORT=5186` |

### Startup Command (non-default port)
```bash
# Agent B example — always pass port overrides
PORT=8789 GUI_PORT=5184 node tools/dev-stack-control.js start-stack
```

Or API-only:
```bash
PORT=8789 node src/api/guiServer.js
```

### Health Check (use YOUR port)
```bash
# Agent B checks its own server, not the default
curl -s http://localhost:8789/api/v1/health
```

### Run Commands (use YOUR port)

Every `curl` command in every test must target the agent's own port:
```bash
# Agent B starts a run on ITS server
curl -s -X POST http://localhost:8789/api/v1/process/start \
  -H "Content-Type: application/json" \
  -d '{ ... }'

# Agent B checks status on ITS server
curl -s http://localhost:8789/api/v1/process/status
```

### Rules

1. **Declare port at session start.** First line of first response must include: `[PORTS: API=XXXX, GUI=YYYY]` or `[PORTS: default]`.

2. **Never use port 8788 if another agent is active on it.** Check before starting:
```bash
   curl -sf http://localhost:8788/api/v1/health > /dev/null 2>&1 && echo "8788 IN USE — pick another port" || echo "8788 available"
```

3. **Never kill another agent's server.** Before stopping any server process, verify the PID is yours. Cross-reference the port:
```bash
   # Find what's on a port — only kill if it's YOUR server
   lsof -ti:8789 | xargs ps -p 2>/dev/null
```

4. **Artifacts are shared.** Output directories are NOT port-scoped. Two agents running the same product will overwrite each other's artifacts. To avoid this:
   - Run different products concurrently (Agent A = Razer, Agent B = Logitech)
   - OR run the same product sequentially, not in parallel
   - NEVER run the same productId on two agents simultaneously

5. **NDJSON indexes are shared.** QueryIndex, URLIndex, and PromptIndex NDJSON files are category-scoped, not port-scoped. Two agents writing to the same category's index files simultaneously can produce corrupted lines. To avoid this:
   - Assign different categories to different agents if possible
   - If both must work on the same category, serialize: one agent runs, finishes, then the other starts
   - NDJSON append is atomic per line on most OS, but do not rely on this for correctness

6. **SearXNG is shared.** All agents route through the same SearXNG instance at port 8080. This is fine — SearXNG handles concurrent requests. But respect rate limits: if 3 agents each dispatch 10 queries simultaneously, SearXNG receives 30 queries in a burst. The `SEARXNG_MIN_DELAY_MS=2000` setting applies per-agent, not globally. Consider increasing to 3000ms when 2+ agents are active.

7. **Database is shared.** SQLite databases (evidence index, specDb) are single-writer. If two agents write simultaneously, one will get SQLITE_BUSY. The existing retry logic handles brief contention, but sustained parallel writes to the same category's evidence DB will cause failures. Assign different categories or serialize.

### What Can Run Concurrently (Safe)

| Agent A | Agent B | Safe? | Why |
|---|---|---|---|
| Mouse product run | Keyboard product run | YES | Different categories, different artifacts |
| Mouse product run | Monitor product run | YES | Different categories |
| Razer Viper V3 Pro | Logitech G Pro X | CAREFUL | Same category, different products — artifacts OK, index append OK |
| Razer Viper V3 Pro | Razer Viper V3 Pro | NO | Same product — artifact collision, identity confusion |
| Code editing | Live run | YES | Different concerns, no port conflict if separate servers |
| Two live runs same category | — | CAREFUL | NDJSON append usually atomic but SQLite may contend |

### What CANNOT Run Concurrently (Unsafe)

- Same productId on two agents
- Two agents writing to the same evidence.db simultaneously under sustained load
- Two agents on the same API port
- One agent killing another agent's server process

### Evidence Table Addition

When running multi-agent, every live-run evidence table must include:
```markdown
| Agent port | 8789 |
```

This prevents confusion when reviewing which agent produced which evidence.