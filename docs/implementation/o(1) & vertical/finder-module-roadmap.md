# Finder Module O(1) & Vertical Roadmap

> **Goal**: Make the Color Edition Finder (CEF) the replicable template so adding
> SKU Finder, Price Finder, Release Date Finder, etc. requires the absolute
> minimum file touches — approaching O(1) — while keeping the full vertical
> (LLM → field rules → publisher → storage → frontend → operations) tight.

---

## Status (as of 2026-04-10)

| Phase | Status | Tests |
|-------|--------|-------|
| **Phase 0**: Fix CEF defects | **DONE** | 30/30 |
| **Phase 1**: Extract generic finder infrastructure | **DONE** | 88/88 → 104/104 |
| **Phase 2**: Module manifest & auto-registration | **DONE** | 261/261 (all suites) |
| **Phase 3**: Metadata contract | Not started | — |
| **Phase 4**: Prove it — build module #2 | Not started | — |

### What was built

**`src/core/finder/`** — generic finder infrastructure:
- `finderModuleRegistry.js` — SSOT manifest registry (CEF is first entry)
- `finderJsonStore.js` — generic per-product JSON store factory
- `finderSqlStore.js` — generic SQL store factory (summary + runs)
- `finderSqlDdl.js` — DDL generator from manifests
- `finderRoutes.js` — generic route handler (5 endpoints + operations lifecycle + field studio gate)
- `finderRouteWiring.js` — dynamic route auto-wiring (ready for async boot)
- `README.md` — domain contract

**Wiring completed:**
- `specDb.js` — `getFinderStore(moduleId)` accessor + backward-compat CEF methods
- `specDbSchema.js` — auto-execs generated DDL at boot (IF NOT EXISTS)
- `seedRegistry.js` — auto-generates reseed surfaces from registry
- `generateLlmPhaseRegistry.js` — emits `finderModuleRegistry.generated.ts` (MODULE_STYLES/LABELS)
- `OperationsTracker.tsx` — imports generated styles/labels from registry

### To add a new finder module

1. Add field rule builder to `EG_PRESET_REGISTRY` in `egPresets.js`
2. Add phase definition to `llmPhaseDefs.js`
3. Create feature folder: `src/features/<name>/` (prompt, schema, orchestrator, store wrapper, routes config)
4. Add 1 entry to `finderModuleRegistry.js`
5. Run codegen: `node tools/gui-react/scripts/generateLlmPhaseRegistry.js`

---

## Original Pre-Implementation Audit (historical context)

Adding a new finder before Phase 1-2 required touching **10 existing files** and creating
**~9 new files**, plus running codegen. Here's the original map:

### Files modified per new module (today)

| # | File | What you add |
|---|------|-------------|
| 1 | `src/core/config/llmPhaseDefs.js` | +1 phase definition object |
| 2 | `src/features/indexing/pipeline/shared/phaseSchemaRegistry.js` | +2 imports, +1 registry entry |
| 3 | `src/db/specDbSchema.js` | +2 CREATE TABLE, +2 CREATE INDEX |
| 4 | `src/db/specDbStatements.js` | +~11 prepared statements |
| 5 | `src/db/specDb.js` | +1 import, +1 store init, +~11 delegating methods |
| 6 | `src/app/api/guiServerRuntime.js` | +2 imports, +1 context call, +1 route def |
| 7 | `src/app/api/routeRegistry.js` | +1 entry in route order array |

### New files created per module (today)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/features/<name>/<name>Finder.js` | Orchestrator |
| 2 | `src/features/<name>/<name>LlmAdapter.js` | Prompt + LLM caller factory |
| 3 | `src/features/<name>/<name>Schema.js` | Zod response schema |
| 4 | `src/features/<name>/<name>Store.js` | JSON SSOT read/write/merge |
| 5 | `src/features/<name>/api/<name>Routes.js` | HTTP route handler |
| 6 | `src/features/<name>/api/<name>RouteContext.js` | Dependency injection factory |
| 7 | `src/features/<name>/index.js` | Public API barrel |
| 8 | `src/db/stores/<name>Store.js` | SQL store factory |
| 9 | `tools/gui-react/src/features/<name>/components/<Name>Panel.tsx` | UI panel |
| 10 | `tools/gui-react/src/features/<name>/api/<name>Queries.ts` | React Query hooks |

### Auto-generated (run codegen script)

| File | Trigger |
|------|---------|
| `llmPhaseTypes.generated.ts` | `node tools/gui-react/scripts/generateLlmPhaseRegistry.js` |
| `llmPhaseRegistry.generated.ts` | same |
| `llmPhaseOverrideTypes.generated.ts` | same |
| `llmPhaseOverridesBridge.generated.ts` | same |

### Also touched per module

| File | What |
|------|------|
| `OperationsTracker.tsx` | +1 entry in `MODULE_STYLES` + `MODULE_LABELS` |
| `LlmConfigPageShell.tsx` | +1 icon in phase icon map |
| `IndexingPage.tsx` | +1 import + panel JSX |

**Total: 7 modified + ~9 created + 3 small UI touches + codegen run**

---

## Known Defects (fix before framework extraction)

| # | Defect | Severity | Location |
|---|--------|----------|----------|
| D1 | `storeFailureAndReturn` references `actualFallbackUsed` from outer scope — ReferenceError on any rejected run | **BUG** | `colorEditionFinder.js:50,65` |
| D2 | No test coverage for rejection/failure paths | **GAP** | `colorEditionFinder.test.js` |
| D3 | GET route returns `color_details: {}`, `edition_details: {}` always empty | **GAP** | `colorEditionFinderRoutes.js:72-73` |
| D4 | GET route editions fallback hardcodes `{}` instead of using `row.editions` | **GAP** | `colorEditionFinderRoutes.js:58` |
| D5 | `MODULE_STYLES`/`MODULE_LABELS` hardcoded per module (not O(1)) | **O(1)** | `OperationsTracker.tsx:10-22` |
| D6 | Publisher frontend doesn't model `metadata_json` — can't review CEF metadata | **GAP** | `publisher/types.ts`, `PublisherPage.tsx` |

---

## Phase 0: Fix CEF Defects

**Goal**: CEF works correctly end-to-end before we extract a framework from it.

### 0.1 — Fix `storeFailureAndReturn` scope bug

Pass `actualFallbackUsed` as a parameter instead of relying on closure.

```
storeFailureAndReturn({ specDb, product, existing, model, fallbackUsed, rejections, raw, productRoot })
```

Both call sites (lines 207, 241) already have `actualFallbackUsed` in scope.

### 0.2 — Write rejection path test matrix

Tests needed:
- Colors hard rejection → `storeFailureAndReturn` persists to JSON + SQL, returns `rejected: true`
- Editions hard rejection → same
- Soft rejection (unknown_enum_prefer_known) → passes through, not a hard reject
- LLM error → returns rejection without persistence (line 161 path)
- Rejected run doesn't set cooldown
- Rejected run increments `run_count` and `next_run_number`
- Second run after rejected run works (no run_number collision)

### 0.3 — Fix GET route metadata gaps

- Populate `color_details` from `selected.color_names` (or remove placeholder)
- Populate `edition_details` from `selected.editions` (or remove placeholder)
- Fix editions fallback: use `row.editions` instead of `{}`

### 0.4 — Verify all green

Run full CEF test suite + engine tests. Baseline must be green before Phase 1.

---

## Phase 1: Extract Generic Finder Infrastructure

**Goal**: Pull the reusable bones out of CEF into shared infrastructure.
CEF continues to work identically — this is a REFACTOR, not a rewrite.
Every extraction step must keep the full test suite green.

### 1.1 — Generic Finder Store (JSON SSOT)

**Extract from**: `colorEditionStore.js`

The JSON read/write/merge/recalculate pattern is identical for any finder.
Every finder stores:

```
{
  product_id, category,
  selected: { ...field values + metadata... },
  cooldown_until, last_ran_at, run_count, next_run_number,
  runs: [{ run_number, ran_at, model, fallback_used, status, selected, prompt, response }]
}
```

**Create**: `src/core/finder/finderStore.js`

```js
export function createFinderStore({ filePrefix }) {
  return {
    read({ productId, productRoot }),
    merge({ productId, productRoot, newDiscovery, run }),
    deleteRun({ productId, productRoot, runNumber }),
    deleteAll({ productId, productRoot }),
  };
}
```

CEF's `colorEditionStore.js` becomes a thin wrapper:
```js
const store = createFinderStore({ filePrefix: 'color_edition' });
export const readColorEdition = store.read;
export const mergeColorEditionDiscovery = store.merge;
```

### 1.2 — Generic SQL Store Factory

**Extract from**: `src/db/stores/colorEditionFinderStore.js`

Every finder has the same SQL shape: summary table + runs table.

**Create**: `src/core/finder/finderSqlStore.js`

```js
export function createFinderSqlStore({ tableName, runsTableName, summaryColumns }) {
  return function factory({ db, category, stmts }) {
    return {
      upsert(row), get(productId), listByCategory(category),
      insertRun(row), listRuns(productId), getLatestRun(productId),
      deleteRunByNumber(productId, runNumber), deleteAllRuns(productId),
      delete(productId),
    };
  };
}
```

### 1.3 — Generic Route Handler (including Operations Lifecycle)

**Extract from**: `colorEditionFinderRoutes.js`

Every finder has the same 5 endpoints:
- `GET /:prefix/:category` — list all
- `GET /:prefix/:category/:productId` — single with runs
- `POST /:prefix/:category/:productId` — trigger run
- `DELETE /:prefix/:category/:productId` — delete all
- `DELETE /:prefix/:category/:productId/runs/:runNumber` — delete single run

**Create**: `src/core/finder/finderRoutes.js`

```js
export function createFinderRouteHandler({
  routePrefix, runFinder, deleteFn, deleteAllFn,
  manifest, config, appDb, getSpecDb, broadcastWs, logger,
}) {
  return function handleRoutes(parts, params, method, req, res) { ... };
}
```

#### Operations lifecycle (the ~65 lines of boilerplate this eliminates)

The POST handler currently duplicates this entire sequence per module.
The generic handler owns it all:

```
POST /:prefix/:category/:productId
│
├─ 1. Determine stages from config
│    const jsonStrictKey = `_resolved${capitalize(manifest.phase)}JsonStrict`;
│    const useWriter = config[jsonStrictKey] === false;
│    const stages = useWriter
│      ? ['Research', 'Writer', 'Validate']
│      : ['LLM', 'Validate'];
│
├─ 2. Register operation
│    op = registerOperation({
│      type: manifest.moduleType,     // ← from manifest ('cef', 'sku', etc.)
│      category, productId,
│      productLabel,                  // ← from specDb.getProduct()
│      stages,
│    });
│
├─ 3. Create stream batcher
│    batcher = createStreamBatcher({ operationId: op.id, broadcastWs });
│
├─ 4. Wire callbacks → run finder
│    result = await runFinder({
│      product, appDb, specDb, config, logger, manifest,
│      onStageAdvance: (name) => updateStage({ id: op.id, stageName: name }),
│      onModelResolved: (info) => updateModelInfo({ id: op.id, ...info }),
│      onStreamChunk: ({ content }) => batcher.push(content),
│    });
│
├─ 5. Terminal state
│    batcher.dispose();
│    if (result.rejected) {
│      failOperation({ id: op.id, error: rejectionReason });
│    } else {
│      completeOperation({ id: op.id });
│    }
│
├─ 6. Emit data-change
│    emitDataChange({
│      broadcastWs,
│      event: `${manifest.routePrefix}-run`,
│      category,
│      entities: { productIds: [productId] },
│      meta: manifest.buildResultMeta?.(result) || { productId },
│    });
│
└─ 7. Error catch
     batcher.dispose();
     failOperation({ id: op.id, error });
```

**Module-specific inputs** (all from manifest):
- `manifest.moduleType` — operation type string ('cef', 'sku', etc.)
- `manifest.phase` — for resolving jsonStrict config key
- `manifest.routePrefix` — for data-change event naming
- `manifest.buildResultMeta(result)` — optional hook for event meta

**Zero per-module operations code.** The generic handler owns the full
register → stage → stream → complete/fail → evict lifecycle.

#### Frontend operations integration (already generic)

The operations infrastructure is already module-agnostic end-to-end:

```
operationsRegistry.js          — generic (type is just a string)
    ↓ broadcastWs('operations')
ws.ts / WsManager              — generic (relays all channels)
    ↓ onmessage
useWsEventBridge.ts:70-79      — generic (upsert/remove by action)
    ↓ zustand
operationsStore.ts             — generic (Map<id, Operation>)
    ↓ selector
OperationsTracker.tsx          — ALMOST generic (MODULE_STYLES/LABELS hardcoded)
```

The only non-generic piece is `OperationsTracker.tsx:10-22` which maps
`type → chipStyle` and `type → label`. This moves to Phase 2.5 (registry-
driven) or can be a simple fallback: unknown types get a neutral chip and
the type string uppercased as the label.

#### Stream batcher integration (already generic)

```
streamBatcher.js               — generic (takes operationId + broadcastWs)
    ↓ broadcastWs('llm-stream')
useWsEventBridge.ts:75-79      — generic (appendStreamText by operationId)
    ↓ zustand
operationsStore.ts:57-64       — generic (append to streamText string)
    ↓ selector
OperationsTracker.tsx:156-158  — generic (StreamPanel renders text)
```

No changes needed. The stream batcher and its WebSocket path are already
fully module-agnostic.

### 1.4 — Generic Orchestrator Base

**Extract from**: `colorEditionFinder.js`

The orchestration flow is identical:
1. Resolve model + wrap callbacks
2. Read existing runs for feed-forward
3. Build or use LLM caller
4. Call LLM
5. Normalize response
6. Validate fields via candidate gate
7. Submit candidates
8. Persist to JSON + SQL
9. Return result

**Create**: `src/core/finder/runFinder.js`

```js
export async function runFinder({
  // Universal deps
  product, appDb, specDb, config, logger, productRoot,
  onStageAdvance, onModelResolved, onStreamChunk,
  _callLlmOverride,
  // Module-specific (from manifest)
  manifest,
}) { ... }
```

The module manifest provides the customization hooks (see Phase 2).

### 1.5 — Wire CEF through generic infrastructure

Replace CEF's internals with the generic versions. CEF's public API stays
identical. All tests must remain green.

---

## Phase 2: Module Manifest & Auto-Registration

**Goal**: Adding a new finder = create folder + define manifest. O(1).

### 2.1 — Define the Finder Module Manifest contract

**Create**: `src/core/finder/finderManifest.js` (Zod schema for manifest)

```js
export const finderManifestSchema = z.object({
  // Identity
  id: z.string(),                    // e.g. 'color-edition-finder'
  phase: z.string(),                 // e.g. 'colorFinder' (llmPhaseDefs id)
  routePrefix: z.string(),           // e.g. 'color-edition-finder'
  moduleType: z.string(),            // e.g. 'cef' (operations tracker type)
  moduleLabel: z.string(),           // e.g. 'CEF' (operations tracker label)
  chipStyle: z.string(),             // e.g. 'sf-chip-accent'

  // Storage
  filePrefix: z.string(),            // e.g. 'color_edition' (JSON filename)
  tableName: z.string(),             // e.g. 'color_edition_finder'
  runsTableName: z.string(),         // e.g. 'color_edition_finder_runs'
  summaryColumns: z.array(z.object({
    name: z.string(),
    type: z.enum(['TEXT', 'INTEGER', 'REAL']),
    default: z.any().optional(),
  })),

  // Fields this finder populates
  fields: z.array(z.string()),       // e.g. ['colors', 'editions']

  // Module-specific hooks (provided by the feature)
  buildPrompt: z.function(),         // (domainArgs) => systemPromptString
  responseSchema: z.any(),           // Zod schema
  mapResponse: z.function(),         // (llmResponse) => { fieldValues, metadata, audit }
  buildLlmUserMessage: z.function(), // (product) => userMessageString
  buildKnownInputs: z.function(),    // (previousRuns) => knownInputsForPrompt

  // Optional hooks
  postValidate: z.function().optional(), // cross-field repair (e.g. reconcileEditionColors)
  cooldownDays: z.number().default(30),
});
```

### 2.2 — CEF exports its manifest

**File**: `src/features/color-edition/colorEditionManifest.js`

```js
export const COLOR_EDITION_FINDER_MANIFEST = {
  id: 'color-edition-finder',
  phase: 'colorFinder',
  routePrefix: 'color-edition-finder',
  moduleType: 'cef',
  moduleLabel: 'CEF',
  chipStyle: 'sf-chip-accent',
  filePrefix: 'color_edition',
  tableName: 'color_edition_finder',
  runsTableName: 'color_edition_finder_runs',
  fields: ['colors', 'editions'],
  buildPrompt: buildColorEditionFinderPrompt,
  responseSchema: colorEditionFinderResponseSchema,
  mapResponse: mapColorEditionResponse,
  buildLlmUserMessage: (product) => JSON.stringify({ brand, base_model, model, variant }),
  buildKnownInputs: buildKnownInputs,
  postValidate: reconcileEditionColors,
  cooldownDays: 30,
};
```

### 2.3 — Auto-discovery in server runtime

**Modify**: `src/app/api/guiServerRuntime.js`

Replace hardcoded imports with manifest scanning:

```js
import { discoverFinderModules } from '../../core/finder/finderDiscovery.js';

const finderModules = discoverFinderModules();
for (const manifest of finderModules) {
  // Auto-register routes, SQL stores, context factories
  registerFinderModule(manifest, { jsonRes, readJsonBody, config, appDb, getSpecDb, ... });
}
```

### 2.4 — Auto-create SQL tables from manifest

**Modify**: `src/db/specDbSchema.js`

Instead of hardcoded DDL, generate from manifests:

```js
import { discoverFinderModules } from '../core/finder/finderDiscovery.js';

export function getFinderDDL() {
  return discoverFinderModules().flatMap(m => [
    buildSummaryTableDDL(m),
    buildRunsTableDDL(m),
  ]);
}
```

### 2.5 — Registry-driven OperationsTracker

**Modify**: `OperationsTracker.tsx`

Replace hardcoded `MODULE_STYLES` / `MODULE_LABELS` with a registry
populated from finder manifests (served via API or codegen).

Today these are the hardcoded maps (lines 10-22):
```ts
const MODULE_STYLES: Record<string, string> = {
  cef: 'sf-chip-accent',
  'brand-resolver': 'sf-chip-info',
  // ... each module added manually
};
const MODULE_LABELS: Record<string, string> = {
  cef: 'CEF',
  'brand-resolver': 'BR',
  // ... each module added manually
};
```

**Two options** (pick one):

**Option A — API-driven**: Add `GET /finder-modules` endpoint that returns
manifest summaries. Frontend fetches at boot, builds the maps dynamically.
Pro: true O(1). Con: extra API call.

**Option B — Codegen-driven**: Extend `generateLlmPhaseRegistry.js` to also
emit a `finderModuleRegistry.generated.ts` with styles/labels from manifests.
Pro: no runtime cost. Con: must run codegen after adding module.

**Option C — Graceful fallback** (simplest, interim): Unknown types get
`sf-chip-neutral` and `type.toUpperCase().slice(0,3)` as label. No map
needed at all. Existing entries kept for polish. New modules work immediately
without any frontend change.

Recommend **Option C now** (1-line change), upgrade to A or B if we reach
5+ modules and want branded chips for each.

### 2.6 — Generic IndexingLab panel

**Create**: `tools/gui-react/src/features/finder-panel/FinderPanel.tsx`

A single generic panel component driven by config:

```tsx
interface FinderPanelConfig {
  moduleId: string;
  label: string;
  routePrefix: string;
  phaseId: string;
  fields: Array<{
    key: string;
    label: string;
    render: 'chip-list' | 'text' | 'date' | 'currency';
    expandable?: string; // metadata key to expand
  }>;
}
```

CEF's panel becomes:
```tsx
<FinderPanel config={COLOR_EDITION_PANEL_CONFIG} category={category} productId={productId} />
```

---

## Phase 3: Metadata Contract

**Goal**: Rich metadata (color_names, edition_details) gets first-class
validation, storage, and publisher review — not orphaned in opaque JSON blobs.

### 3.1 — Add `metadata_schema` to field rules

**Modify**: `category_authority/{cat}/_control_plane/field_studio_map.json`

```json
{
  "colors": {
    "contract": { "shape": "list", "type": "string" },
    "metadata_schema": {
      "color_names": {
        "shape": "record",
        "key_constraint": "self_values",
        "value_type": "string"
      }
    }
  },
  "editions": {
    "contract": { "shape": "list", "type": "string" },
    "metadata_schema": {
      "edition_details": {
        "shape": "record",
        "key_constraint": "self_values",
        "value_type": {
          "display_name": "string",
          "colors": { "shape": "list", "type": "string" }
        }
      }
    }
  }
}
```

`key_constraint: "self_values"` = every key must be a value in the parent
field's validated value array. Engine enforces this generically.

### 3.2 — Engine validates metadata

**Modify**: `src/engine/fieldRulesEngine.js`

Add `validateMetadata(fieldKey, metadata, validatedValue, metadataSchema)`:
- Check keys match `self_values` constraint
- Validate value types
- Return repairs/rejections like `validateField`

### 3.3 — Publisher surfaces metadata for review

**Modify**: Publisher frontend types + render to display `metadata_json`
alongside field values. Reviewer can see "black = Midnight Black" alongside
the color atom.

### 3.4 — GET routes return rich metadata

**Modify**: `colorEditionFinderRoutes.js` GET handler to populate
`color_details` and `edition_details` from the latest run's selected state
instead of returning `{}`.

---

## Phase 4: Prove It — Build Module #2

**Goal**: Build the second finder module (SKU, Price, or Release Date) using
the framework from Phases 1-2. Measure actual file touches.

### 4.1 — Pick the module

Best candidate for module #2: whichever field has the simplest contract
(scalar string or single list, no cross-field repair). Price or release date
are simpler than SKU.

### 4.2 — Build using the framework

Create the feature folder with:
- Manifest (identity, fields, hooks)
- Prompt + schema (module-specific)
- Response mapper (module-specific)
- Panel config (if generic panel is done)

### 4.3 — Measure

**Target**: manifest + 3 custom files (prompt, schema, mapper) + 0 existing
file modifications (auto-registration handles the rest).

If more files were touched, feed back into the framework.

---

## Phase Summary

| Phase | Goal | Key Deliverable | CEF Impact | Status |
|-------|------|----------------|-----------|--------|
| **0** | Fix defects | CEF rejection path works, tests green | Bug fixes | **DONE** |
| **1** | Extract generics | `src/core/finder/` shared infrastructure | CEF rewired, behavior identical | **DONE** |
| **2** | O(1) registration | Manifest + auto-discovery | CEF uses manifest, no more hardcoded wiring | **DONE** |
| **3** | Metadata contract | Engine validates metadata, publisher reviews it | color_names/edition_details validated | Next |
| **4** | Prove it | Module #2 built using framework | Framework validated | Next |

## Actual file touches (completed phases)

| Phase | Existing files modified | New files created | Tests |
|-------|------------------------|-------------------|-------|
| 0 | 4 (bug fixes + test fixtures) | 0 | 30 pass |
| 1 | 2 (CEF store + routes as thin wrappers) | 5 (generic infra + tests) | 104 pass |
| 2 | 5 (specDb, seedRegistry, codegen, OperationsTracker, finderRoutes) | 7 (registry, DDL, SQL store, route wiring, tests, generated TS) | 261 pass |

## Remaining phases

**Phase 3 — Metadata contract**: Add `metadata_schema` to field rules so
`color_names` and `edition_details` get validated by the engine. Publisher
frontend can then review rich metadata alongside field values.

**Phase 4 — Prove it**: Build Release Date Finder, SKU Finder, or Price
Finder using the framework. Target: feature folder + 1 registry entry +
1 EG preset entry + codegen run. Zero other files touched.

Phase 3 can run in parallel with Phase 2 — metadata validation is orthogonal
to registration mechanics.

Phase 4 is the proof. If it's not O(1), iterate on Phases 1-2.
