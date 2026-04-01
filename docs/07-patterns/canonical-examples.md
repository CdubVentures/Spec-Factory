# Canonical Examples

> **Purpose:** Show the verified repository patterns for adding common work items without inventing new structure.
> **Prerequisites:** [../01-project-overview/conventions.md](../01-project-overview/conventions.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-03-31

## Adding A New API Endpoint

Based on `src/features/settings/api/configRoutes.js`, `src/app/api/routes/infra/categoryRoutes.js`, and `src/api/guiServerRuntime.js`.

Use the existing route-family registrar pattern: dependency injection at the top, `parts` matching inside the returned handler, `jsonRes()` for responses, and `return false` when the route does not match.

```js
// src/features/example/api/exampleRoutes.js
import { emitDataChange } from '../../../core/events/dataChangeContract.js';

export function registerExampleRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    listExamples,
    saveExample,
    broadcastWs,
  } = ctx;

  return async function handleExampleRoutes(parts, _params, method, req, res) {
    if (parts[0] !== 'example-items') {
      return false;
    }

    if (method === 'GET' && !parts[1]) {
      const rows = await listExamples();
      return jsonRes(res, 200, { rows });
    }

    if (method === 'POST' && !parts[1]) {
      const body = await readJsonBody(req).catch(() => ({}));
      const name = String(body?.name || '').trim();
      if (!name) {
        return jsonRes(res, 400, { ok: false, error: 'name_required' });
      }

      const record = await saveExample({ name });
      emitDataChange({
        broadcastWs,
        event: 'example-item-created',
        domains: ['example-items'],
        meta: { id: record.id },
      });
      return jsonRes(res, 201, { ok: true, record });
    }

    return false;
  };
}
```

If you are extending an existing route family, add the branch inside that family's registrar.

If you are creating a brand-new route family, wire it through the live runtime assembly:

1. Add `<key>RouteContext` creation to `src/api/guiServerRuntime.js`.
2. Add `{ key, registrar }` to the `routeDefinitions` array in `src/api/guiServerRuntime.js`.
3. Let `src/app/api/guiRouteRegistration.js` and `src/app/api/routeRegistry.js` consume that `routeDefinitions` array; do not treat `GUI_API_ROUTE_ORDER` as the mounted SSOT.

## Adding A New Page Or View

Based on `tools/gui-react/src/registries/pageRegistry.ts`, `tools/gui-react/src/App.tsx`, and `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`.

The live pattern is:

1. Put real UI ownership in `tools/gui-react/src/features/<feature>/components/`.
2. Add one `PAGE_REGISTRY` entry in `tools/gui-react/src/registries/pageRegistry.ts`.
3. Let `ROUTE_ENTRIES`, `CATALOG_TABS`, `OPS_TABS`, and `SETTINGS_TABS` derive automatically from that entry; `App.tsx` and `TabNav.tsx` consume those derived exports.
4. Only add a `tools/gui-react/src/pages/<route>/` wrapper when the page needs a page-local shell or must preserve a legacy wrapper. `/test-mode` is the current explicit exception mounted outside the registry.

```tsx
// tools/gui-react/src/features/example/components/ExamplePage.tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';

interface ExampleRow {
  id: string;
  name: string;
}

interface ExampleResponse {
  rows: ExampleRow[];
}

export function ExamplePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['example-items'],
    queryFn: () => api.get<ExampleResponse>('/example-items'),
  });

  if (isLoading) return <div className="sf-text-muted">Loading example items...</div>;
  if (error instanceof Error) return <div className="sf-text-danger">{error.message}</div>;

  return (
    <div className="space-y-3 sf-text-primary">
      {data?.rows.map((row) => (
        <div key={row.id} className="sf-surface-panel px-3 py-2">
          {row.name}
        </div>
      ))}
    </div>
  );
}
```

```ts
// tools/gui-react/src/registries/pageRegistry.ts
{
  path: '/example',
  label: 'Example',
  tabGroup: 'ops',
  loader: () => import('../features/example/components/ExamplePage.tsx'),
  exportName: 'ExamplePage',
}
```

## Adding A New Database Migration

Based on `src/db/specDbMigrations.js`.

SpecDb migrations are append-only SQL strings plus optional secondary indexes. Append new entries at the end; do not rebuild the array through self-referential spreads. Keep migrations idempotent; `applyMigrations()` already tolerates duplicate-column errors for compatibility.

```js
// src/db/specDbMigrations.js
export const MIGRATIONS = [
  `ALTER TABLE component_identity ADD COLUMN review_status TEXT DEFAULT 'pending'`,
  `ALTER TABLE component_identity ADD COLUMN aliases_overridden INTEGER DEFAULT 0`,
  `ALTER TABLE example_items ADD COLUMN external_ref TEXT`,
];

export const SECONDARY_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_cv_identity_id ON component_values(component_identity_id);
  CREATE INDEX IF NOT EXISTS idx_example_items_external_ref ON example_items(external_ref);
`;
```

If a migration changes the canonical schema contract, update [data-model.md](../03-architecture/data-model.md) and the nearest domain-specific documentation for that boundary.

## Adding A New Test

Based on `src/publish/tests/publishingPipeline.publish.test.js`.

Use Node's built-in runner, keep setup local to the test file, and assert through public APIs or written artifacts rather than internal implementation details.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publishExampleArtifacts } from '../src/publish/examplePublisher.js';

test('publishExampleArtifacts writes one current artifact', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-example-'));

  try {
    const result = await publishExampleArtifacts({
      config: { helperFilesRoot: tempRoot },
      storage: null,
      category: 'mouse',
      productIds: ['mouse-example'],
    });

    assert.equal(result.published_count, 1);
    assert.equal(result.results[0]?.product_id, 'mouse-example');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
```

## Adding A New Background Job

Based on `src/app/cli/commands/batchCommand.js` and `src/cli/spec.js`.

Long-running work in this repo is usually exposed as an exported worker function plus a thin CLI command factory that returns a `command*` handler object. `src/cli/spec.js` wires that handler into the dispatcher; the worker stays separately testable.

```js
// src/features/example/exampleBatch.js
export async function runExampleBatch({
  storage,
  config,
  category,
  logger = null,
}) {
  const rows = specDb ? specDb.getAllProducts() : [];
  logger?.info?.('example_batch_start', { category, total: rows.length });

  return {
    category,
    processed_count: rows.length,
  };
}
```

```js
// src/app/cli/commands/exampleCommand.js
export function createExampleCommand({ runExampleBatch }) {
  async function commandRunExample(config, storage, args) {
    const category = args.category || 'mouse';
    return runExampleBatch({
      storage,
      config,
      category,
      logger: null,
    });
  }

  return {
    commandRunExample,
  };
}
```

```js
// src/cli/spec.js
import { createExampleCommand } from '../app/cli/commands/exampleCommand.js';

const example = createExampleCommand({
  runExampleBatch,
});

const dispatchCliCommand = createCliCommandDispatcher({
  handlers: {
    'run-example': ({ config, storage, args }) => example.commandRunExample(config, storage, args),
  },
});
```

## Adding A New Service Function

Based on `src/features/catalog/identity/brandRegistry.js`.

Service functions in this repo generally accept an options object, normalize input immediately, return structured `{ ok, ... }` results for expected failures, and persist through a single canonical owner.

```js
// src/features/example/exampleRegistry.js
export async function addExampleItem({ config, name, tags = [] }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    return { ok: false, error: 'name_required' };
  }

  const cleanTags = (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim().toLowerCase())
    .filter(Boolean);

  const registry = await loadExampleRegistry(config);
  const slug = slugify(trimmedName);
  if (registry.items[slug]) {
    return { ok: false, error: 'example_item_exists', slug };
  }

  const record = {
    name: trimmedName,
    tags: cleanTags,
    created_at: new Date().toISOString(),
  };

  registry.items[slug] = record;
  await saveExampleRegistry(config, registry);
  return { ok: true, slug, record };
}
```

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/routes/infra/categoryRoutes.js` | injected route-factory shape and `return false` non-match contract |
| source | `src/features/settings/api/configRoutes.js` | live route-family registrar pattern |
| source | `src/api/guiServerRuntime.js` | route-context assembly and `routeDefinitions` mounting pattern |
| source | `src/app/api/guiRouteRegistration.js` | routeDefinitions consumption path |
| source | `src/app/api/routeRegistry.js` | `GUI_API_ROUTE_ORDER` is not the live mounted SSOT |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | page registry, tab metadata, and derived route pattern |
| source | `tools/gui-react/src/App.tsx` | HashRouter shell and registry-driven route mounting |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | tab derivation from the page registry |
| source | `tools/gui-react/src/features/catalog/components/CatalogPage.tsx` | feature-owned page implementation pattern |
| source | `tools/gui-react/src/api/client.ts` | canonical GUI API client wrapper |
| source | `src/db/specDbMigrations.js` | append-only migration and index pattern |
| source | `src/core/events/dataChangeContract.js` | canonical `emitDataChange` import path for route examples |
| source | `src/app/cli/commands/batchCommand.js` | thin CLI command factory pattern |
| source | `src/cli/spec.js` | CLI command wrapper and dispatcher registration pattern |
| source | `src/app/cli/commandDispatch.js` | handler-dispatch contract |
| source | `src/features/catalog/identity/brandRegistry.js` | service-function options object and structured return pattern |
| test | `src/publish/tests/publishingPipeline.publish.test.js` | Node `node:test` structure with local fixtures and public-API assertions |

## Related Documents

- [Conventions](../01-project-overview/conventions.md) - defines the repo rules these examples follow.
- [API Surface](../06-references/api-surface.md) - shows the live endpoints that follow the route pattern above.
- [Background Jobs](../06-references/background-jobs.md) - maps the real long-running commands and workers.
