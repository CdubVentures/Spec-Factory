# Canonical Examples

> **Purpose:** Show the verified repository patterns for adding common work items without inventing new structure.
> **Prerequisites:** [../01-project-overview/conventions.md](../01-project-overview/conventions.md), [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-03-23

## Adding A New API Endpoint

Based on `src/features/settings/api/configRoutes.js` and `src/app/api/routes/infra/categoryRoutes.js`.

Use the existing route-family registrar pattern: dependency injection at the top, `parts` matching inside the returned handler, `jsonRes()` for responses, and `return false` when the route does not match.

```js
// src/features/example/api/exampleRoutes.js
import { emitDataChange } from '../../../api/events/dataChangeContract.js';

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

If you are creating a brand-new route family instead of extending an existing one, also wire it through `src/app/api/routeRegistry.js`, `src/app/api/guiRouteRegistration.js`, and the server context assembly in `src/api/guiServer.js`.

## Adding A New Page Or View

Based on `tools/gui-react/src/App.tsx` and `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`.

The live pattern is:

1. Put real UI ownership in `tools/gui-react/src/features/<feature>/components/`.
2. Optionally re-export from `tools/gui-react/src/pages/<route>/` (some routes import directly from features).
3. Register the route lazily in `tools/gui-react/src/App.tsx`.

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

```tsx
// tools/gui-react/src/pages/example/ExamplePage.tsx
export * from '../../features/example/components/ExamplePage';
```

```tsx
// tools/gui-react/src/App.tsx
const ExamplePage = lazyNamedPage(() => import('./pages/example/ExamplePage'), 'ExamplePage');

<Route path="example" element={wrap(ExamplePage)} />
```

## Adding A New Database Migration

Based on `src/db/specDbMigrations.js`.

SpecDb migrations are append-only SQL strings plus optional secondary indexes. Keep them idempotent; `applyMigrations()` already swallows duplicate-column errors.

```js
// src/db/specDbMigrations.js
export const MIGRATIONS = [
  ...MIGRATIONS,
  `ALTER TABLE example_items ADD COLUMN external_ref TEXT`,
];

export const SECONDARY_INDEXES = `
  ${SECONDARY_INDEXES}
  CREATE INDEX IF NOT EXISTS idx_example_items_external_ref ON example_items(external_ref);
`;
```

If a migration changes the canonical schema contract, update `docs/03-architecture/data-model.md` and the nearest `DOMAIN.md` for that boundary.

## Adding A New Test

Based on `test/publishingPipeline.test.js`.

Use Node's built-in runner, keep setup local to the test file, and assert through public APIs or returned artifacts rather than internal implementation details.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runExampleJob } from '../src/daemon/exampleJob.js';

test('runExampleJob records one processed item', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-example-'));

  try {
    const result = await runExampleJob({
      config: { helperFilesRoot: tempRoot },
      storage: null,
      once: true,
    });

    assert.equal(result.mode, 'example-job');
    assert.equal(result.processed_count, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
```

## Adding A New Background Job

Based on `src/daemon/daemon.js`, `src/cli/spec.js`, and `src/app/cli/commandDispatch.js`.

Long-running work in this repo is usually exposed as a CLI command backed by an exported worker function. The worker does the loop; `src/cli/spec.js` handles argument parsing, `EventLogger`, and dispatcher registration.

```js
// src/daemon/exampleJob.js
export async function runExampleJob({
  storage,
  config,
  once = false,
  logger = null,
}) {
  let processedCount = 0;

  do {
    processedCount += 1;
    logger?.info?.('example_job_tick', { processedCount });
    if (once) break;
  } while (true);

  return {
    mode: 'example-job',
    processed_count: processedCount,
  };
}
```

```js
// src/cli/spec.js
async function commandExampleJob(config, storage, args) {
  const logger = new EventLogger({
    storage,
    runtimeEventsKey: config.runtimeEventsKey || '_runtime/events.jsonl',
    context: { category: args.category || 'all' },
  });

  const result = await runExampleJob({
    storage,
    config,
    once: asBool(args.once, false),
    logger,
  });
  await logger.flush();

  return {
    command: 'example-job',
    ...result,
    events: logger.events.slice(-100),
  };
}

const dispatchCliCommand = createCliCommandDispatcher({
  handlers: {
    'example-job': ({ config, storage, args }) => commandExampleJob(config, storage, args),
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
| source | `tools/gui-react/src/App.tsx` | lazy route registration and `wrap()` pattern |
| source | `tools/gui-react/src/App.tsx` (line 23) | direct feature import pattern (some routes skip pages/ re-export) |
| source | `tools/gui-react/src/features/catalog/components/CatalogPage.tsx` | feature-owned page implementation pattern |
| source | `tools/gui-react/src/api/client.ts` | canonical GUI API client wrapper |
| source | `src/db/specDbMigrations.js` | append-only migration and index pattern |
| source | `src/daemon/daemon.js` | exported long-running worker loop pattern |
| source | `src/cli/spec.js` | CLI command wrapper and dispatcher registration pattern |
| source | `src/app/cli/commandDispatch.js` | handler-dispatch contract |
| source | `src/features/catalog/identity/brandRegistry.js` | service-function options object and structured return pattern |
| test | `test/publishingPipeline.test.js` | Node `node:test` structure with local fixtures and public-API assertions |

## Related Documents

- [Conventions](../01-project-overview/conventions.md) - Defines the repo rules these examples follow.
- [API Surface](../06-references/api-surface.md) - Shows the live endpoints that follow the route pattern above.
- [Background Jobs](../06-references/background-jobs.md) - Maps the real long-running commands and workers.
