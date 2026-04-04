# Spec Factory — CLAUDE.md

This file is read at session start and after every context compaction.  
It defines **non‑negotiable rules** for any agent working in this repo.

---

## IndexLab / Spec Factory principles

- Accuracy first (95%+), evidence tiers + confidence gates.
- Need-driven discovery (NeedSet-driven).
- Deterministic indexing (`content_hash` + stable `snippet_id`s).
- GUI proof required for phase completion.

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

Before any action (analysis, file edits, commands, plans, or commit steps), **start every response with exactly one** of:

- `[STATE: CONTRACT]`
- `[STATE: MACRO-RED]`
- `[STATE: MACRO-GREEN]`
- `[STATE: REFACTOR]`
- `[STATE: CHARACTERIZATION]`

Additional rules:
- Exactly **one** STATE line per response.
- No file edits / commands / commit steps without declaring STATE first.
- If the correct state is unclear, default to `[STATE: CONTRACT]` and clarify the next step.

State meanings:
- **CONTRACT**: Define/confirm boundaries (inputs/outputs/errors/invariants) before implementation.
- **MACRO-RED**: Write the full, exhaustive boundary test matrix first (tests should fail).
- **MACRO-GREEN**: Implement the minimum to make the entire test suite pass.
- **REFACTOR**: Improve structure only after tests are green (no behavior changes).
- **CHARACTERIZATION**: Lock down legacy behavior with golden-master tests before refactor/extraction.

---

## Core development philosophy

### TDD is non‑negotiable

Every single line of production code must be written in response to a failing test.

**RED → GREEN → REFACTOR**
- **RED**: Write failing tests first. Zero production code without a failing test.
- **GREEN**: Write the minimum code to make tests pass (no speculative features).
- **REFACTOR**: Only after green, only if valuable, and only if behavior remains identical.

---

## Contract-first Macro‑TDD sequence (required)

For any new boundary/module/feature:

1. **Define the boundary contract**
   - Inputs (types/shapes), outputs, errors, invariants, and trust boundaries.
   - Clarify what is *explicitly* out of scope.
2. **Write an exhaustive boundary test matrix**
   - Happy path + edge cases + null/empty + invalid + throws.
   - Prefer table-driven tests when possible.
3. **Implement minimum code to pass**
   - Treat internals as a black box.
   - No speculative refactors, no extra features.
4. **If complexity rises, recurse**
   - Decompose into a helper boundary with its own contract + test matrix.
   - Repeat the same sequence for the helper.

---

## Test scope calibration (required)

Not every change requires a new automated test.

### Tests REQUIRED for:

- domain logic
- state transitions
- parsers / mappers / transforms
- boundary contracts
- error handling
- accessibility behavior and semantics
- regressions in previously broken behavior
- any change that introduces branching or non-trivial conditions

### Tests NOT REQUIRED for:

- purely visual CSS tweaks with no logic change
- spacing, color, typography, or layout adjustments
- theme-token remaps that do not change behavior contracts
- static text / copy edits
- content/config changes with no new logic
- markup reshuffles that preserve behavior and accessibility

### For CSS / theme / settings changes:
Use the light-theme checkpoint, visual review, and targeted smoke validation instead of forcing unit tests.

A test becomes required only when the change affects:

- conditional rendering
- computed class/state logic
- accessibility semantics
- persisted settings behavior
- cross-theme invariants explicitly protected by contract

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

## Escalation mandate (The Loop Breaker)

- **Max 3 attempts:** If a test suite remains red after 3 consecutive implementation attempts, you are STRICTLY FORBIDDEN from guessing again.
  - You MUST halt, output `[STATE: BLOCKED]`, and ask the human for architectural guidance. Do not hallucinate endless fixes.
- **Zero Assumption:** Do not guess business logic or user intents. If ambiguous, ask for clarification.

## Characterization wall (legacy / untested code)

If refactoring, extracting, or reorganizing untested/legacy code:

- Write **golden‑master characterization tests first** to lock down current behavior.
- No behavior changes until legacy behavior is captured and tests are green.
- Only after characterization can extraction/refactor begin.

---

## Decomposition safety rule (extraction / refactor)

When decomposing, extracting, or refactoring existing code, **existing behavior must never break**.

1. **Baseline must be green first**
   - Run the full suite; if failing, stop and fix baseline failures first.
2. **Write characterization tests first** when coverage is missing
   - These capture current behavior and are the safety net for extraction.
3. **Move in the smallest increments**
   - Extract one responsibility at a time.
   - Run tests after every move.
4. **Behavior identical**
   - Extracted modules must produce identical outputs for identical inputs.
5. **No behavior changes during REFACTOR**
   - Behavior changes require a separate Red→Green change with explicit tests.
6. **If tests go red during refactor**
   - Revert the refactor/extraction (not the tests).
7. **Completion proof**
   - Require E2E proof on at least **one product** before considering the decomposition complete.

---

## Git operations (Strictly Local Read-Only)

- **No Network / Remote Commands:** You are STRICTLY FORBIDDEN from running `git fetch`, `git pull`, `git push`, or interacting with remotes in any way.
- **No Working Tree Mutations:** You are FORBIDDEN from running `git checkout`, `git reset`, `git clean`, `git stash`, `git add`, or `git commit`. You must NEVER overwrite, revert, or alter the local working directory via git.
- **Safe Context Only:** You may ONLY run safe, local, read-only commands (`git status`, `git diff`, `git log`, `git show`) to gather context. The human handles all syncing, branching, and committing.

## Architecture: feature-first / vertical slicing

### Hard rules

- Organize by **domain**, not technical layers.
- No generic junk drawers:
  - `src/utils`, `src/helpers`, `src/services` are prohibited as dumping grounds.
- **Strict boundaries**
  - Features may import `core/` and `shared/`.
  - Features must **not** import other features’ internals.
- Use explicit public contracts for cross-boundary access:
  - `src/features/<feature>/index.js` exports the public API.
- No circular dependencies.

### Canonical structure (preferred)

```text
src/
  app/                 # entrypoints + routing only
  core/                # infra: config, API clients, logging, adapters
  shared/              # universal UI primitives + truly generic utilities
  features/
    <feature>/         # domain boundary (services, validation, transforms, UI, tests)
      index.js         # public API for cross-feature access
      tests/           # unit + feature tests (preferred)
```

---

## Approved refactoring techniques (only these)

- **Preparatory refactoring**
  - Extract before adding capabilities to orchestrators/monoliths.
- **Extract method / composing method**
  - Orchestrators should read like named steps; implementation lives in domain modules.
- **Move responsibility to domain modules**
  - Orchestrator owns sequencing only.
- **Red‑Green‑Refactor extraction**
  - Test new module → pass → wire in → full suite green.

---

## Testing rules

- Test behavior over implementation; test through **public APIs only**.
- Use factories; avoid `let`/`beforeEach` mutation patterns.
- Runner is Node built‑in: `node --test --test-force-exit` (no Jest/Vitest).
- Test placement:
  - Preferred: `src/features/<feature>/tests/` (unit + feature tests)
  - Allowed: root `test/` only for integration / E2E / smoke (not a junk drawer)

### Running the full test suite

**You MUST run the full test suite before considering any task complete.**

```bash
# Full suite (~12s, 7000+ tests, must be 0 failures)
npm test

# Single file
node --test --test-force-exit path/to/file.test.js
```

- If any test fails, investigate and fix before moving on.
- If a test is no longer valid due to a contract change you made, update or remove the test — do not leave broken tests behind.
- Never merge or hand off work with failing tests.

---

## Code style & file discipline

- Prefer immutable data and pure functions.
- Avoid deep nesting; prefer early returns and composition.
- Prefer options objects over positional parameters.
- Prefer `map/filter/reduce` over imperative loops.
- No nested if/else (use early returns or composition).
- File discipline:
  - Soft limit ~700 LOC per file.
  - One primary export per file (additional exports must be clearly subordinate).

- ### Language & Typing Conventions (Hybrid Stack)

- **Backend / Core (Strictly JavaScript)**
  - All core and backend source files are `.js` ESM (`import`/`export`).
  - Do not use TypeScript syntax (`interface`, `type`, `: string`) in these files.
  - Use JSDoc comments for type hinting if necessary, and rely on `zod` or `ajv` for schema validation at trust boundaries.

- **GUI Frontend (`tools/gui-react/` - Strictly TypeScript + React)**
  - **No Escape Hatches:** The use of `any`, `@ts-ignore`, or `@ts-nocheck` is absolutely forbidden.
  - **Explicit Contracts:** All React component props, state shapes, and API response payloads MUST have explicit `interface` or `type` definitions written *before* the component implementation.
  - **Dumb Components:** React components should be as stateless and "dumb" as possible. State must be derived wherever logically possible.
  - **Schema Alignment:** Infer frontend TypeScript types directly from your backend validation schemas whenever possible to maintain a single source of truth. Do not invent custom frontend shapes that deviate from the backend.

### Comments

- No redundant comments.
- Short **“WHY”** comments are allowed for invariants/boundaries.

---

## JS / TS conventions

- Repo default: **`.js` ESM** (`import` / `export`).
- GUI frontend: `tools/gui-react/` is **TypeScript + React**.
- Validate at trust boundaries with **zod** or **ajv**.
- Trust internals; don’t leak `any`-equivalents across boundaries.

---

## ZERO‑DRIFT UI & design system

UI drift and one-off styling are forbidden.

- No hardcoded CSS values in features (`px`, hex, raw `rem`).
- Use semantic tokens only (intent-based naming).
- No one‑off primitives inside features:
  - Build primitives in `src/shared/` first, then consume them.
- No inline styles (`style={{...}}` is banned).
- Separate layout structure from primitive “skin”.

---

## Security & secrets (zero‑trust)

- No hardcoded secrets (API keys, tokens, passwords).
- Use env vars and validate where applicable.
- Respect client/server boundaries; never leak server secrets into client.
- No PII logging.

---

## Dependency discipline

- No new packages and no `package.json` changes without explicit human approval.
- Prefer existing deps and standard APIs over adding libraries.

---

## Runtime data directories

- `.workspace/` is the sole runtime data directory (git-ignored).
  - `global/` — user-settings.json (JSON fallback for boot/seed path; SQL is primary)
  - `runtime/snapshots/` — per-run settings snapshots (capped at 10)
  - `db/{category}/` — per-category SQLite databases (spec.sqlite)
  - `db/app.sqlite` — global app database
  - `runs/` — IndexLab run output (screenshots, video, analysis, traces, checkpoints)
  - `products/` — one product.json per product (rebuild SSOT, created at add time, grown after runs)
  - `output/` — pipeline output artifacts
  - `crawlee/` — Crawlee internal bookkeeping (ephemeral)
- `.server-state/` — server PID + log (git-ignored)
- Do not create other runtime directories. Use OS tmpdir for throwaway work.
- The root `tmp/` directory is banned and gitignored.
- **No root-level artifact directories.** Tools that produce output (Playwright, bundlers, etc.) must write into `.workspace/`, not the project root. If a tool defaults to a root-level folder, override its config to target `.workspace/`.

---

## Data persistence & schemas

- No local file “databases” for mutable state (`.json/.csv/.txt`).
- JSON is config only (immutable).
- DB schema is SSOT; frontend types must mirror/infer from schema.
- No ad‑hoc `fetch` in UI; route I/O through `src/core/api/` or feature services.

---

## Single Source of Truth (SSOT) for state

- **Never duplicate canonical state.** Each piece of domain state must have exactly one owner (DB → API → store → feature state).
- **Derive whenever possible.** Computed values must be derived via selectors / pure functions, not stored as additional state.
- **Keep UI components dumb.** Presentational components receive data via props; stateful logic lives in feature hooks/containers or a unified state manager.
- **Allowed local state (UI-only):** ephemeral UI concerns (input drafts, modal open/close, hover/focus, temporary filters, optimistic “pending” flags) are permitted **only** if clearly scoped and not treated as canonical truth.
- **Caches are derived state.** If caching is required, it must be explicitly labeled as derived and have invalidation rules.

---

## O(1) Feature Scaling & Registry-Driven Architecture

For all code generation, architecture design, and refactoring, you must strictly adhere to the **O(1) Feature Scaling Rule**.

- **The One-File Rule:** Whenever a new standard field, entity, or configuration parameter is added to the system, it MUST require modifying exactly ONE file (the central definition, schema, or registry).
- **No Whack-a-Mole Coding:** You are STRICTLY FORBIDDEN from writing or maintaining code that requires a human to manually touch a database model, an API payload, a state management slice, and a UI component just to add a simple setting or field.
- **Dynamic Derivation:** All TypeScript interfaces (payloads, normalized state, UI props) MUST be dynamically inferred from the central registry (e.g., using mapped types `Record<keyof typeof Registry, ...>`, Zod, or generic schemas). Never manually duplicate registry keys into interfaces.
- **Generic Engines Over Hardcoding:** Serialization, hydration, and UI rendering layers must utilize generic loops that iterate over the registry. 
- **The Abstraction Mandate:** If you find yourself writing repetitive boilerplate or hardcoding specific keys in multiple files for standard fields, STOP immediately, delete the repetitive code, output `[STATE: REFACTOR]`, and build a generic schema-driven abstraction.

## The Subtractive Engineering Mandate (No Dead Code)

LLMs naturally default to additive coding. You are explicitly commanded to practice **subtractive engineering**. 

- **Clean Up Your Mess:** If you refactor a component, change an architectural direction, or replace a legacy function, you MUST actively search for and delete the old code, unused imports, and orphaned TypeScript types. 
- **No Graveyards:** Do not leave commented-out blocks of old code "just in case" or "for reference." If we need old code, we will look at Git history.
- **State & Prop Pruning:** When removing a feature from the UI, you must trace that data back up the tree. Remove the unused props, delete the derived state, and remove the payload from the API response if it is no longer used anywhere else.
- **Refuse to Add to Bloat:** If a file is over 500 lines and filled with legacy fallbacks, you must halt and request to prune the dead code before adding new features to it.

## Configurability & knobs

- No magic numbers for behavior (timeouts/retries/pagination/flags).
- Centralize knobs:
  - GUI / SQL for all runtime settings (API keys, secrets, tuning)
  - `.env` for deploy-only non-secret vars (PORT, LOG_STDOUT)
  - `src/core/config.*` for global config
- Secret keys (`secret: true` in registry) are ignored from env — SQL is sole authority

---
## Domain Contracts (LLM-Optimized Local Architecture)

Each domain boundary (`src/core/`, `src/shared/`, `src/features/<name>/`) must contain exactly one structural map: `README.md`.

This file acts as the **local system prompt** for any LLM agent operating within that specific directory. It defines the stable architectural intent, the public contract, and the strict business rules of the domain. It is NOT a living state document. Do not maintain dynamic state in Markdown.

**Strict Rules for `README.md`:**

- **High-Signal, Low-Noise:** Maximum length is 150 lines. Conserve token space.
- **Trigger for Updates:** Update this file ONLY when the public API, core data schema, or boundary dependencies change.
- **NO File Trees:** File trees cause token bloat and context rot. Use `tree` or `ls` commands to discover current physical files.
- **NO Test Execution Statuses:** Do not track passing/failing tests here. Run `node --test` to discover current status.

**Required Sections within `README.md.md`:**

1. **`## Purpose`:** A 1-2 sentence definition of what this domain boundary is responsible for.
2. **`## Public API (The Contract)`:** Explicitly list what this module exports (e.g., what is exposed in `index.js`). Agents must strictly adhere to this contract when importing this feature elsewhere.
3. **`## Dependencies`:** State what external boundaries this domain is allowed to import from (e.g., "Allowed: `src/core/api`, `src/shared/ui`. Forbidden: Other feature folders").
4. **`## Domain Invariants`:** List the absolute business rules or data constraints that an LLM must never violate when writing logic in this folder.

## Documentation & Architecture Mapping

**Comprehensive documentation is required for this project:**

- File Trees & System Maps: Agents are permitted and encouraged to generate file trees and structural mappings inside a dedicated /docs directory to maintain architectural clarity.
- Living Documentation: Documentation should be updated dynamically as the codebase evolves.

---

## Exception protocol (velocity without breaking rules)

- No silent rule-bending.
- If an exception is required:
  - Explain why it’s required
  - Propose the smallest scope possible
  - Get explicit human approval
  - Contain it and include a plan to remove it



## Process Safety

- NEVER kill, terminate, or stop Node.js processes that are running Claude Code, Codex, or any AI agent sessions.
- NEVER blindly kill PIDs. Always inspect a PID first (e.g., `ps -p <pid> -o comm=`) to confirm it's not an active Claude, Codex, or agent session before terminating.
- Before running `kill`, `pkill`, `killall`, or similar commands targeting Node.js or unknown PIDs, always verify what the process is.
- When cleaning up processes, explicitly exclude anything matching `claude`, `codex`, or related agent runtimes.