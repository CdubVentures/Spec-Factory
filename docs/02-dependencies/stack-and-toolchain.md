# Stack and Toolchain

> **Purpose:** Record the exact live stack, resolved direct dependency versions, and runtime/tooling compatibility notes so an arriving LLM does not guess the framework mix.
> **Prerequisites:** [../01-project-overview/scope.md](../01-project-overview/scope.md), [../01-project-overview/conventions.md](../01-project-overview/conventions.md)
> **Last validated:** 2026-03-25

## Runtime and Build Toolchain

| Dependency | Version | Purpose | Category |
|-----------|---------|---------|----------|
| Node.js | `v24.13.1` | audit/build/test runtime observed locally | runtime |
| npm | `11.8.0` | package manager observed locally | runtime |
| `package.json` engines.node | `>=20` | minimum supported Node version | compatibility |
| Vite | `6.4.1` resolved | GUI dev server and build | gui build |
| TypeScript | `5.9.3` resolved | GUI type-check/build | gui build |
| Tailwind CSS | `3.4.19` resolved | GUI styling toolchain | gui styling |
| PostCSS | `8.5.6` resolved | GUI CSS processing | gui styling |
| Mermaid CLI | `11.12.0` resolved | diagram rendering utility | docs tooling |

## Root Package Direct Dependencies

| Dependency | Version | Purpose | Category |
|-----------|---------|---------|----------|
| `@aws-sdk/client-s3` | `3.985.0` | S3 storage and run-data relocation | production |
| `@mozilla/readability` | `0.6.0` | readable article extraction fallback | production |
| `ajv` | `8.17.1` | JSON Schema validation | production |
| `ajv-formats` | `3.0.1` | JSON Schema format validators | production |
| `better-sqlite3` | `12.6.2` | synchronous SQLite persistence | production |
| `cheerio` | `1.2.0` | static DOM parsing | production |
| `chokidar` | `4.0.3` | filesystem watching for realtime bridge/import flows | production |
| `crawlee` | `3.16.0` | browser-backed crawling/orchestration | production |
| `jsdom` | `28.1.0` | DOM emulation/HTML parsing utilities | production |
| `pdf-parse` | `1.1.4` | PDF text extraction | production |
| `playwright` | `1.58.2` | browser automation and GUI contract tests | production |
| `semver` | `7.7.4` | version comparison helpers | production |
| `ws` | `8.19.0` | WebSocket server/client support | production |
| `zod` | `4.3.6` | trust-boundary schema validation | production |
| `@mermaid-js/mermaid-cli` | `11.12.0` | diagram rendering | development |
| `@yao-pkg/pkg` | `6.13.1` | executable packaging | development |
| `esbuild` | `0.25.12` | packaging/build utility | development |

## GUI Package Direct Dependencies

| Dependency | Version | Purpose | Category |
|-----------|---------|---------|----------|
| `@dnd-kit/core` | `6.3.1` | drag-and-drop UI primitives | production |
| `@dnd-kit/sortable` | `10.0.0` | sortable drag-and-drop lists | production |
| `@dnd-kit/utilities` | `3.2.2` | drag-and-drop helpers | production |
| `@radix-ui/react-dialog` | `1.1.15` | modal/dialog primitives | production |
| `@radix-ui/react-select` | `2.2.6` | select primitives | production |
| `@radix-ui/react-tabs` | `1.1.13` | tab primitives | production |
| `@radix-ui/react-tooltip` | `1.2.8` | tooltip primitives | production |
| `@tanstack/react-query` | `5.90.21` | GUI data fetching and caching | production |
| `@tanstack/react-table` | `8.21.3` | tabular UIs | production |
| `@tanstack/react-virtual` | `3.13.18` | virtualized lists/tables | production |
| `react` | `18.3.1` | GUI framework | production |
| `react-dom` | `18.3.1` | DOM renderer | production |
| `react-hotkeys-hook` | `5.2.4` | keyboard shortcuts | production |
| `react-router-dom` | `6.30.3` | HashRouter route handling | production |
| `recharts` | `2.15.4` | charts and metrics panels | production |
| `zustand` | `5.0.11` | lightweight client state stores | production |
| `@types/react` | `18.3.28` | React type definitions | development |
| `@types/react-dom` | `18.3.7` | React DOM type definitions | development |
| `@vitejs/plugin-react` | `4.7.0` | React Vite integration | development |
| `autoprefixer` | `10.4.24` | CSS vendor prefixing | development |
| `postcss` | `8.5.6` | CSS processing | development |
| `tailwindcss` | `3.4.19` | design utility generation | development |
| `typescript` | `5.9.3` | type-check/build | development |
| `vite` | `6.4.1` | dev server/build | development |

## Compatibility Notes

- Backend is pure JavaScript ESM even though the GUI package is TypeScript.
- The GUI route model is `HashRouter`, not filesystem routing.
- The audit observed resolved versions from lockfiles, which are newer than some declared semver ranges.
- The current GUI build baseline under `npm run gui:build` is green. Verified on 2026-03-25: the Vite build completed successfully and wrote `tools/gui-react/dist/`.
- The current `node --test` baseline under Node `v24.13.1` is green. Verified on 2026-03-25: `npm test` passed with `5827` passing tests.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| config | `package.json` | Root scripts, Node engine, declared backend dependencies |
| config | `package-lock.json` | Exact resolved backend dependency versions |
| config | `tools/gui-react/package.json` | GUI scripts and declared frontend dependencies |
| config | `tools/gui-react/package-lock.json` | Exact resolved GUI dependency versions |
| config | `tools/gui-react/vite.config.ts` | Vite usage and dev proxy boundary |
| command | `npm run gui:build` | current GUI build baseline is green and produces the served `tools/gui-react/dist/` bundle |
| command | `npm test` | current Node `v24.13.1` suite baseline is green on the audited worktree (`5827` passing tests) |

## Related Documents

- [Setup and Installation](./setup-and-installation.md) - Uses this stack inventory to define exact local setup.
- [Environment and Config](./environment-and-config.md) - Maps runtime configuration onto this toolchain.
- [Frontend Architecture](../03-architecture/frontend-architecture.md) - Shows how the GUI stack is composed in code.
