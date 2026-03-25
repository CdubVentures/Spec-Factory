# Anti-Patterns

> **Purpose:** Identify the repository patterns that new work must not introduce, even if legacy code still contains examples of them.
> **Prerequisites:** [../01-project-overview/conventions.md](../01-project-overview/conventions.md), [./canonical-examples.md](./canonical-examples.md), [../03-architecture/auth-and-sessions.md](../03-architecture/auth-and-sessions.md)
> **Last validated:** 2026-03-24

## Route Logic In `src/api/guiServer.js`

Wrong:

```js
// do not add ad hoc endpoint matching here
if (req.url === '/api/v1/example-items') {
  res.end('...');
}
```

Why it is wrong:

- `src/api/guiServer.js` is the composition root, not the place for feature-specific endpoint logic.
- Bypassing the registered route families skips the audited dispatch order and makes endpoint ownership hard to trace.

Do instead:

- Add or extend a family registrar such as `src/features/settings/api/configRoutes.js` or `src/app/api/routes/infra/categoryRoutes.js`.
- If a new family is required, wire it through `src/app/api/routeRegistry.js`, `src/app/api/guiRouteRegistration.js`, and `src/api/guiServer.js`.

## Raw `fetch()` Calls From GUI Components

Wrong:

```tsx
const res = await fetch('/api/v1/example-items');
const data = await res.json();
```

Why it is wrong:

- It duplicates the API base, headers, and error formatting already centralized in `tools/gui-react/src/api/client.ts`.
- It encourages per-component networking rules instead of React Query plus a shared client contract.

Do instead:

- Use `tools/gui-react/src/api/client.ts`.
- Wrap reads and writes in React Query hooks or mutation handlers like `tools/gui-react/src/features/studio/state/useStudioPageMutations.ts` and `tools/gui-react/src/hooks/useAuthoritySnapshot.js`.

## Treating Browser State As Canonical Truth

Wrong:

```tsx
localStorage.setItem('runtime-settings', JSON.stringify(nextSettings));
```

Why it is wrong:

- Browser storage is only a convenience layer for session continuity.
- Canonical settings already persist through `src/features/settings-authority/index.js` and the `configRoutes` API surface.

Do instead:

- Persist canonical settings through the verified domain route:
  - `PUT /api/v1/ui-settings`
  - `PUT /api/v1/runtime-settings`
  - `PUT /api/v1/storage-settings`
  - `PUT /api/v1/llm-policy` for the composite global LLM policy
  - `PUT /api/v1/llm-settings/:category/routes` for category-scoped LLM matrices
- Reserve browser storage for derived continuity like `tools/gui-react/src/stores/tabStore.ts`, `tools/gui-react/src/stores/collapseStore.ts`, and `tools/gui-react/src/features/indexing/state/indexlabStore.ts`.

## Writing New Mutable JSON Or CSV "Databases"

Wrong:

```js
await fs.writeFile('data/example-items.json', JSON.stringify(rows));
```

Why it is wrong:

- The repo already has canonical mutable stores: SQLite via `src/db/specDb.js` and authored config under `category_authority/`.
- New ad hoc state files create a second source of truth that the GUI, CLI, and tests will drift from.

Do instead:

- Put operational mutable data in SpecDb through `src/db/specDb.js`.
- Put authored category or global control-plane data under the existing `category_authority/` contracts such as `category_authority/_runtime/user-settings.json` and `category_authority/*/sources.json`.

## Deep-Importing Another Feature's Internals

Wrong:

```js
import { addBrand } from '../catalog/identity/brandRegistry.js';
```

Why it is wrong:

- It bypasses the published feature boundary and couples new code to internal file layout.
- The repo already exposes public feature entrypoints for shared use.

Do instead:

- Import from public feature contracts when they exist:
  - `src/features/catalog/index.js`
  - `src/features/indexing/index.js`
  - `src/features/review/index.js`
  - `src/features/settings-authority/index.js`

## Adding New GUI Escape Hatches: `any`, `@ts-ignore`, Or Inline Styles

Wrong:

```tsx
// @ts-ignore
const row: any = data;
return <div style={{ color: 'red' }}>{row.label}</div>;
```

Why it is wrong:

- The root rules for `tools/gui-react/` forbid new `any`, `@ts-ignore`, and inline styles.
- The repo still contains some legacy inline-style usage, but that is debt, not a green light for new code.

Do instead:

- Define explicit interfaces before the component, as in `tools/gui-react/src/App.tsx`.
- Prefer class-based styling and existing semantic tokens, as in `tools/gui-react/src/features/catalog/components/CatalogPage.tsx`.
- When a new primitive is needed, add it deliberately instead of bypassing the type system or styling system.

## Inventing A Login Or JWT Middleware Layer

Wrong:

```js
app.use(requireJwt());
app.post('/login', ...);
```

Why it is wrong:

- The live runtime has no verified operator-auth flow, no auth routes, and no auth/session tables.
- Introducing auth assumptions into documentation or code would contradict the audited runtime contract.

Do instead:

- Treat workstation access as the current operator boundary.
- If auth work is ever explicitly commissioned, document it as a new boundary change and re-audit `src/api/guiServer.js`, `src/app/api/routeRegistry.js`, and `src/db/specDbSchema.js`.

## Implementation-Coupled Tests

Wrong:

```js
test('source file still mentions feature flag', async () => {
  const text = await fs.readFile('src/example.js', 'utf8');
  assert.match(text, /ENABLE_EXAMPLE_FLAG/);
});
```

Why it is wrong:

- It locks tests to file layout and string presence instead of observable behavior.
- The repo rules explicitly reject broad repo-string audits as a permanent test strategy for retirements or behavior changes.

Do instead:

- Test through public behavior the way `src/publish/tests/publishingPipeline.publish.test.js` does: build local fixtures, call the public function, and assert on outputs, written artifacts, or returned summaries.
- For one-time cleanup audits, use a temporary script or checklist instead of a permanent brittle test.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-level bans on new mutable JSON databases, GUI `any`/`@ts-ignore`, and auth assumptions |
| source | `src/api/guiServer.js` | server is a composition root, not a feature-route implementation surface |
| source | `src/app/api/routeRegistry.js` | endpoint ownership is organized by registered route families |
| source | `tools/gui-react/src/api/client.ts` | shared GUI REST client wrapper |
| source | `tools/gui-react/src/features/studio/state/useStudioPageMutations.ts` | canonical mutation pattern through `api.post()` |
| source | `tools/gui-react/src/hooks/useAuthoritySnapshot.js` | canonical React Query + API client fetch pattern |
| source | `tools/gui-react/src/stores/tabStore.ts` | browser storage as derived session continuity |
| source | `tools/gui-react/src/stores/collapseStore.ts` | browser storage as derived session continuity |
| source | `tools/gui-react/src/features/indexing/state/indexlabStore.ts` | browser storage as derived session continuity |
| source | `src/features/settings-authority/index.js` | canonical settings persistence boundary |
| source | `src/db/specDb.js` | canonical operational mutable data boundary |
| source | `src/features/catalog/index.js` | public feature entrypoint available for cross-boundary imports |
| source | `src/features/indexing/index.js` | public feature entrypoint available for cross-boundary imports |
| source | `src/features/review/index.js` | public feature entrypoint available for cross-boundary imports |
| source | `docs/03-architecture/auth-and-sessions.md` | verified absence of current auth/session subsystem |
| test | `src/publish/tests/publishingPipeline.publish.test.js` | public-behavior test structure |

## Related Documents

- [Canonical Examples](./canonical-examples.md) - Shows the approved patterns that replace each anti-pattern here.
- [Conventions](../01-project-overview/conventions.md) - Captures the repo rules that make these anti-patterns invalid.
- [Auth and Sessions](../03-architecture/auth-and-sessions.md) - Documents the current no-auth runtime boundary.
