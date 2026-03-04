# Phase 03 Entrypoint Characterization Test Plan

## Objective

Protect CLI/API behavior while composition roots are split into thin wiring layers.

## Coverage Strategy

### Existing Regression Anchors (Kickoff Evidence)

Executed in Phase 03 kickoff:

```bash
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js
```

Result: `5/5` passing.

### CLI Characterization (Planned)

- Verify command dispatch routes to expected handlers.
- Verify command exit/error behavior remains unchanged.
- Verify key command families continue to call orchestration entrypoints with stable payload shape.

Planned test artifacts:

- `test/cliCompositionRootDispatchContract.test.js`
- `test/cliCompositionRootErrorContract.test.js`
- `test/cliCommandDispatch.test.js` (`IMPLEMENTED`)

#### CLI Slice Staging (03-02 Scoped)

| Slice | Coverage Focus |
|---|---|
| `CLI-S1` | dispatch routing table and handler binding parity |
| `CLI-S2` | runtime/indexing command delegation parity |
| `CLI-S3` | rules/studio compile and ingest command parity |
| `CLI-S4` | review/quality command parity |
| `CLI-S5` | publishing/learning command parity |
| `CLI-S6` | ops/meta/lifecycle command parity |

### API Characterization (Planned)

- Verify route registry wiring covers all current route groups.
- Verify server bootstrap and root path resolution behavior remains stable.
- Verify process lifecycle endpoints preserve success/error semantics.

Planned test artifacts:

- `test/guiServerRouteRegistryWiring.test.js` (`IMPLEMENTED`)
- `test/apiCatalogHelpersWiring.test.js` (`IMPLEMENTED`)
- `test/apiCategoryAliasWiring.test.js` (`IMPLEMENTED`)
- `test/apiSpecDbRuntimeWiring.test.js` (`IMPLEMENTED`)
- `test/apiProcessRuntimeWiring.test.js` (`IMPLEMENTED`)
- `test/apiRealtimeBridgeWiring.test.js` (`IMPLEMENTED`)
- `test/guiServerProcessLifecycleContract.test.js`

#### API Slice Staging (03-03 Scoped)

| Slice | Coverage Focus |
|---|---|
| `API-S1` | request dispatch envelope and bootstrap wiring parity |
| `API-S2` | route registry binding parity across all registered route groups |
| `API-S3` | route helper behavior parity for delegated families |
| `API-S4` | process lifecycle parity (`start/stop/status`) |
| `API-S5` | websocket/watcher event fanout parity |

### Adapter Registry Coverage (Planned)

- Validate every active `CR-*` seam has owner, expiry phase, and replacement contract.

Planned test artifact:

- `test/compositionRootAdapterRegistry.test.js`

## Execution Policy

1. Add characterization tests before each seam extraction.
2. Run focused entrypoint suites after each extraction slice.
3. Run broader data/settings authority suites before marking seam completion.
4. No composition-root split slice is complete unless characterization coverage remains green.

## Validation Command (Planned)

```bash
node --test test/cliCompositionRootDispatchContract.test.js test/cliCompositionRootErrorContract.test.js test/guiServerRouteRegistryWiring.test.js test/guiServerProcessLifecycleContract.test.js test/compositionRootAdapterRegistry.test.js
```

## Phase 03 Task 03-02 Validation Evidence

Commands run:

```bash
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js
node --test test/sourceStrategy.test.js
```

Results:

- `5/5` passing
- `4/4` passing

## Phase 03 Task 03-03 Validation Evidence

Command:

```bash
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js test/runtimeSettingsApi.test.js test/reviewRoutesDataChangeContract.test.js
```

Result: `22/22` passing.

## Implementation Validation Delta (CLI-S1)

Commands run:

```bash
node --check src/cli/spec.js
node --test test/cliCommandDispatch.test.js
```

Results:

- syntax check passing
- `2/2` passing

## Implementation Validation Delta (API-S1 + API-S2 + API-S3 Continued + API-S4 + API-S5)

Commands run:

```bash
node --check src/app/api/routeRegistry.js
node --check src/app/api/catalogHelpers.js
node --check src/app/api/categoryAlias.js
node --check src/app/api/specDbRuntime.js
node --check src/app/api/processRuntime.js
node --check src/app/api/realtimeBridge.js
node --check src/api/guiServer.js
node --test test/apiRealtimeBridgeWiring.test.js test/apiProcessRuntimeWiring.test.js test/apiSpecDbRuntimeWiring.test.js test/apiCategoryAliasWiring.test.js test/apiCatalogHelpersWiring.test.js test/guiServerRouteRegistryWiring.test.js test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js test/runtimeSettingsApi.test.js test/reviewRoutesDataChangeContract.test.js
```

Results:

- syntax check passing
- `38/38` passing
