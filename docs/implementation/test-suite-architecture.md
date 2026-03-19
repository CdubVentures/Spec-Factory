# Test Suite Architecture

## Current State

- Runner: `node --test`
- Root-heavy layout: about `796` `.test.js` files under `test/`
- Feature-local layout: `16` `.test.js` files under `src/**/tests`
- Largest root clusters by naming:
  - `indexingOrchestration*.test.js`: `184`
  - `runtimeOps*.test.js`: `31`
- Existing support surface is small:
  - `test/helpers/`
  - `test/fixtures/`
  - `test/support/`

## Immediate Cleanup Applied

- Canonicalized the CLI harness under `test/support/cliJsonHarness.js`
- Updated CLI tests to import from `test/support/`
- Retired the only file that kept a separate root `tests/` tree alive
- Moved command-level CLI contract tests into:
  - `test/contracts/cli/commandDispatch.test.js`
  - `test/contracts/cli/commands/*.test.js`
- Moved top-level CLI integration flows into:
  - `test/integration/cli/phase10Cli.test.js`
  - `test/integration/cli/publishCli.test.js`
  - `test/integration/cli/queueCli.test.js`
  - `test/integration/cli/reviewCli.test.js`
- Moved the contract-driven indexing monolith into:
  - `test/e2e/indexing/contractDriven.test.js`
- Moved the `runtimeOps*.test.js` cluster into:
  - `test/integration/runtime/runtime-ops/*.test.js`
- Replaced the `test/helpers/loadBundledModule.js` esbuild subprocess helper with an in-process `sucrase` loader so GUI contract tests no longer depend on child-process spawn in this sandbox

## Target Hierarchy

Use `src/**/tests/` for feature-level unit and narrow contract tests.
Use root `test/` for cross-feature integration, GUI/API contracts, and heavy end-to-end flows.

```text
test/
  support/
    cli/
    http/
    runtime/
  fixtures/
    cli/
    gui/
    indexing/
  golden/
  characterization/
  contracts/
    api/
    cli/
    gui/
    settings/
  integration/
    api/
    cli/
    gui/
    indexing/
    runtime/
  e2e/
    indexing/
    publish/
    review/

src/
  features/
    <feature>/
      tests/
        unit/
        contract/
```

## Placement Rules

- `src/features/**/tests/unit/`
  - Pure domain logic
  - Small mappers, reducers, validators, scoring helpers
  - No filesystem, HTTP server, browser, or process bootstrap

- `src/features/**/tests/contract/`
  - Public feature API seams
  - Request/response payload shaping
  - Feature-local orchestration contracts with mocked dependencies

- `test/contracts/**`
  - Cross-boundary contracts
  - CLI JSON shape contracts
  - HTTP route response contracts
  - GUI store or controller contracts that span features

- `test/integration/**`
  - Real filesystem, sqlite, route handlers, queue wiring, bridge wiring
  - Multi-module workflows that should stay outside a feature-local folder

- `test/e2e/**`
  - Long-running, seeded, broad pipeline tests
  - Examples: `contractDriven.test.js`, live runtime/product-path proofs

- `test/characterization/**`
  - Legacy behavior capture during refactors
  - Delete only after a stronger replacement exists

## First Migration Waves

### Wave 1: Support Consolidation

- Keep all reusable harnesses under `test/support/`
- Keep generated fixtures under `test/fixtures/`
- Keep snapshots/golden payloads under `test/golden/`

### Wave 2: Root Contract Tests by Surface

Move flat root files into:

- `test/contracts/cli/`
  - `cli*.test.js`
- `test/contracts/api/`
  - route, endpoint, websocket, server-shape contracts
- `test/contracts/gui/`
  - controller/store/panel contract tests that span features

### Wave 3: Integration Buckets

Move broad runtime tests into:

- `test/integration/indexing/`
  - discovery, fetch, search-profile, evidence-index, orchestration wiring
- `test/integration/runtime/`
  - `runtimeOps*.test.js`, process bridge, realtime bridge, worker surfaces
- `test/integration/review/`
  - review lane, queue websocket, mutation flows

### Wave 4: Monolith Decomposition

Split oversized files by behavior slice, not helper type.

Priority candidates:

1. `test/contractDriven.test.js`
   - `test/e2e/indexing/contractDriven.seed.test.js`
   - `test/e2e/indexing/contractDriven.scenario-behavior.test.js`
   - `test/e2e/indexing/contractDriven.review-payloads.test.js`
   - Shared helpers in `test/support/indexing/contractDriven/`

2. `indexingOrchestration*.test.js`
   - Group under `test/integration/indexing/orchestration/`
   - Split by run lifecycle, source lifecycle, planner lifecycle, finalization

## Naming Standard

- Prefer `describe('<boundary>')`
- Prefer `test('<observable behavior>')`
- Use Arrange-Act-Assert ordering inside each test
- Avoid titles that encode implementation details or helper names

Examples:

- Good: `test('returns search fallback metadata when primary engines yield no usable rows')`
- Weak: `test('calls normalizeThing and sets field')`

## Migration Safety Rules

- Move files without assertion changes first
- Run only the moved file set after each batch
- Collapse duplicate tests only after classifying them as KEEP / COLLAPSE / RETIRE / DEFER
- Replace runtime-critical brittle tests before deletion
- Keep root `test/` focused on integration and e2e; push narrow logic tests down to feature folders over time

## Next Practical Batch

1. Group `indexingOrchestration*.test.js` under `test/integration/indexing/orchestration/`
2. Split `test/e2e/indexing/contractDriven.test.js` by seed, scenario, and review payload sections
3. Promote narrow indexing unit tests from root `test/` into `src/features/indexing/**/tests/`
4. Replace remaining direct `esbuild` subprocess helpers in root contract tests with the shared in-process loader
