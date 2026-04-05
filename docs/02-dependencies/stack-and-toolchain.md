# Stack and Toolchain

> **Purpose:** Declare the live stack and exact dependency identities so an LLM does not guess frameworks or services.
> **Prerequisites:** [../01-project-overview/scope.md](../01-project-overview/scope.md)
> **Last validated:** 2026-04-04

## Runtime Truth

| Concern | Live value | Evidence |
|---------|------------|----------|
| Backend language | JavaScript ESM | `package.json`, `src/app/api/guiServer.js` |
| Frontend language | TypeScript + React | `tools/gui-react/package.json`, `tools/gui-react/src/App.tsx` |
| Backend HTTP runtime | Node `http` | `src/app/api/guiServerRuntime.js` |
| Frontend router | `HashRouter` | `tools/gui-react/src/App.tsx` |
| Test runner | Node built-in test runner | `package.json` `"test": "node --test --test-force-exit"` |
| Browser automation | Playwright + Crawlee | `package.json`, `src/features/crawl/` |
| Persistence | `better-sqlite3` + local filesystem | `package.json`, `src/db/`, `src/core/storage/storage.js` |
| GUI build | Vite + TypeScript + Tailwind | `tools/gui-react/package.json`, `tools/gui-react/vite.config.ts` |
| Packaging | `@yao-pkg/pkg` + repo scripts | `package.json`, `tools/build-exe.mjs` |

## Observed Tool Versions

| Tool | Version | Source |
|------|---------|--------|
| Node.js | `v24.13.1` | `node -v` |
| npm | `11.8.0` | `npm -v` |
| Minimum supported Node | `>=20` | `package.json` `engines.node` |

## Root Package Dependencies

Source files:

```text
package.json
package-lock.json
```

### Production Dependencies

| Package | Declared | Resolved | Primary use |
|---------|----------|----------|-------------|
| `@duckduckgo/autoconsent` | `^14.64.0` | `14.64.0` | cookie-consent automation |
| `@mozilla/readability` | `^0.6.0` | `0.6.0` | article/readability extraction |
| `ajv` | `^8.17.1` | `8.17.1` | schema validation |
| `ajv-formats` | `^3.0.1` | `3.0.1` | AJV format validators |
| `better-sqlite3` | `^12.6.2` | `12.6.2` | AppDb + SpecDb persistence |
| `cheerio` | `^1.2.0` | `1.2.0` | server-side DOM parsing |
| `chokidar` | `^4.0.3` | `4.0.3` | watcher-based runtime updates |
| `crawlee` | `^3.16.0` | `3.16.0` | crawl orchestration |
| `jsdom` | `^28.1.0` | `28.1.0` | DOM emulation |
| `pdf-parse` | `^1.1.4` | `1.1.4` | PDF extraction |
| `playwright` | `^1.58.2` | `1.58.2` | browser automation + e2e |
| `playwright-autoconsent` | `^1.0.4` | `1.0.4` | Playwright consent helpers |
| `semver` | `^7.7.4` | `7.7.4` | version comparison |
| `sharp` | `^0.34.5` | `0.34.5` | image processing |
| `ws` | `^8.19.0` | `8.19.0` | WebSocket transport |
| `zod` | `^4.3.6` | `4.3.6` | schema validation |

### Development Dependencies

| Package | Declared | Resolved | Primary use |
|---------|----------|----------|-------------|
| `@mermaid-js/mermaid-cli` | `^11.12.0` | `11.12.0` | docs diagram rendering |
| `@yao-pkg/pkg` | `^6.3.0` | `6.13.1` | Windows packaging |
| `esbuild` | `^0.25.0` | `0.25.12` | build/packaging utility |

## GUI Package Dependencies

Source files:

```text
tools/gui-react/package.json
tools/gui-react/package-lock.json
```

### Production Dependencies

| Package | Declared | Resolved | Primary use |
|---------|----------|----------|-------------|
| `@dnd-kit/core` | `^6.3.1` | `6.3.1` | drag-and-drop primitives |
| `@dnd-kit/sortable` | `^10.0.0` | `10.0.0` | sortable lists |
| `@dnd-kit/utilities` | `^3.2.2` | `3.2.2` | DnD utilities |
| `@radix-ui/react-dialog` | `^1.1.4` | `1.1.15` | dialog primitives |
| `@radix-ui/react-select` | `^2.1.4` | `2.2.6` | select primitives |
| `@radix-ui/react-tabs` | `^1.1.2` | `1.1.13` | tabs |
| `@radix-ui/react-tooltip` | `^1.1.6` | `1.2.8` | tooltips |
| `@tanstack/react-query` | `^5.62.0` | `5.90.21` | data fetching/cache |
| `@tanstack/react-table` | `^8.20.0` | `8.21.3` | tables |
| `@tanstack/react-virtual` | `^3.11.0` | `3.13.18` | virtualization |
| `react` | `^18.3.1` | `18.3.1` | UI runtime |
| `react-dom` | `^18.3.1` | `18.3.1` | DOM renderer |
| `react-hotkeys-hook` | `^5.2.4` | `5.2.4` | keyboard shortcuts |
| `react-router-dom` | `^6.28.0` | `6.30.3` | `HashRouter` routing |
| `recharts` | `^2.15.0` | `2.15.4` | charts |
| `zustand` | `^5.0.2` | `5.0.11` | client state |

### Development Dependencies

| Package | Declared | Resolved | Primary use |
|---------|----------|----------|-------------|
| `@types/react` | `^18.3.12` | `18.3.28` | React types |
| `@types/react-dom` | `^18.3.1` | `18.3.7` | React DOM types |
| `@vitejs/plugin-react` | `^4.3.4` | `4.7.0` | Vite React plugin |
| `autoprefixer` | `^10.4.20` | `10.4.24` | CSS prefixing |
| `postcss` | `^8.4.49` | `8.5.6` | CSS pipeline |
| `tailwindcss` | `^3.4.16` | `3.4.19` | styling |
| `typescript` | `^5.7.2` | `5.9.3` | type-check/build |
| `vite` | `^6.0.3` | `6.4.1` | dev server/build |

## Anti-Assumptions

- Do not assume AWS/S3 support from older docs or stale install artifacts. `@aws-sdk/client-s3` is not a current direct dependency in `package.json`.
- Do not assume Express, Fastify, Nest, or Next.js. The repo uses Node `http` plus custom dispatch.
- Do not assume a separate frontend package manager workspace. The GUI is a nested package under `tools/gui-react/`.
- Do not assume TypeScript on the backend. The backend source remains JavaScript ESM.

## Validation Snapshot

| Proof | Result |
|------|--------|
| `npm run gui:build` | pass on 2026-04-04 |
| `npm test` | pass on 2026-04-04 |
| `npm run env:check` | fail on 2026-04-04 with `Missing keys in config manifest: PORT` |

## Read Next

- [Environment and Config](./environment-and-config.md)
- [External Services](./external-services.md)
- [Frontend Architecture](../03-architecture/frontend-architecture.md)
- [Backend Architecture](../03-architecture/backend-architecture.md)

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | root scripts, Node engine, direct dependency declarations |
| config | `package-lock.json` | exact resolved root dependency versions |
| config | `tools/gui-react/package.json` | GUI scripts and direct dependency declarations |
| config | `tools/gui-react/package-lock.json` | exact resolved GUI dependency versions |
| source | `src/app/api/guiServerRuntime.js` | backend runtime technology assumptions |
| source | `tools/gui-react/src/App.tsx` | router/runtime model |
| config | `tools/gui-react/vite.config.ts` | Vite usage |
| command | `node -v` | observed Node version |
| command | `npm -v` | observed npm version |

## Related Documents

- [Environment and Config](./environment-and-config.md) - maps these tools onto runtime configuration surfaces.
- [External Services](./external-services.md) - shows which dependencies cross a process or network boundary.
- [Backend Architecture](../03-architecture/backend-architecture.md) - explains how the backend stack is composed in code.
- [Frontend Architecture](../03-architecture/frontend-architecture.md) - explains how the GUI stack is composed in code.
