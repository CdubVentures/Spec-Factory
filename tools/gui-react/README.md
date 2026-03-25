## Purpose

TypeScript + React GUI for Spec Factory. Serves operational dashboards,
review workflows, settings management, catalog editing, and real-time
pipeline monitoring. Built with Vite, served as static assets by the
backend HTTP server on the same port.

## Public API (The Contract)

- **Entry:** `src/main.tsx` → `src/App.tsx` (HashRouter)
- **Route registry:** `src/registries/pageRegistry.ts` — SSOT for all routable pages. Adding a page = one entry here + the component file.
- **API client:** `src/api/client.ts` — thin REST wrapper, base `/api/v1`. Use `api.parsedGet/parsedPost` for validated responses.
- **State:** Zustand stores in `src/stores/` (app-level) and `src/features/*/state/` (feature-scoped).
- **Types:** Generated from backend schemas via `scripts/generateManifestTypes.js` and `scripts/generateRuntimeOpsTypes.js`. Never manually duplicate backend shapes.
- **Design system:** `src/shared/ui/` — atomic primitives. Features consume these; never define one-off primitives inside features.

## Dependencies

- **Allowed:** React, React Router, Zustand, TanStack React Query, Radix UI, Recharts, Vite
- **Backend type sources:** `src/shared/settingsRegistry.js`, `src/features/indexing/api/contracts/`
- **Forbidden:** Direct Node/filesystem access, backend module imports, `any`/`@ts-ignore`/`@ts-nocheck`

## Domain Invariants

- No inline styles (`style={{...}}`). Use semantic tokens only.
- No hardcoded CSS values (`px`, hex, raw `rem`). Use design-system tokens.
- All component props must have explicit `interface` or `type` definitions.
- Frontend types derived from backend schemas via codegen — never manually duplicated.
- Features import shared state through barrel exports (`features/*/index.ts`), not internal `state/` paths.
- Components should be as stateless as possible. Derive state via selectors and hooks.
- WebSocket channels: `events`, `process`, `data-change`, `indexlab-event` — coordinated by `AppShell.tsx`.
- Query invalidation on category/run change is managed centrally by `AppShell.tsx`, not by individual components.
