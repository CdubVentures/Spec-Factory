# Conventions

> **Purpose:** Record the enforced repository rules, code organization patterns, and notable absences so an LLM edits in-bounds.
> **Prerequisites:** [scope.md](./scope.md), [folder-map.md](./folder-map.md)
> **Last validated:** 2026-03-30

## Non-Negotiable Repo Rules

- Rule sources: `AGENTS.md`, `AGENTS.testing.md`, `AGENTS.testsCleanUp.md`, and `CLAUDE.md`.
- Backend/core source is JavaScript ESM. Do not add TypeScript syntax to `src/**/*.js`.
- GUI source under `tools/gui-react/` is TypeScript plus React. New `any`, `@ts-ignore`, and `@ts-nocheck` are forbidden.
- Feature-first organization is required. Do not create generic dumping-ground modules such as `src/utils` or `src/services` for new feature logic when an existing feature boundary owns the behavior.
- Tests use Node's built-in runner via `node --test`.
- `docs/implementation/` is excluded from this documentation pass and is not current-state authority here.

## File Placement Rules

| Concern | Live pattern | Avoid |
|---------|--------------|-------|
| server composition | `src/api/guiServer.js`, `src/api/guiServerRuntime.js` | feature-specific route logic inside `src/api/guiServer.js` |
| mounted API route order | `src/api/guiServerRuntime.js` `routeDefinitions` | treating `src/app/api/routeRegistry.js` as the mounted route-order SSOT |
| backend route handlers | `src/features/<feature>/api/*.js` or `src/app/api/routes/*.js` | ad hoc endpoint branches inside composition roots |
| backend persistence | `src/db/` plus `category_authority/` | new mutable JSON or CSV side databases |
| GUI route metadata | `tools/gui-react/src/registries/pageRegistry.ts` | hardcoding new tabbed routes directly in `App.tsx` or `TabNav.tsx` |
| GUI feature logic | `tools/gui-react/src/features/**` | large stateful logic inside thin page wrappers |
| GUI shared state | `tools/gui-react/src/stores/*.ts` | duplicating canonical category or runtime settings state in page-local stores |
| docs | `docs/01-project-overview/` -> `docs/07-patterns/` | reviving unnumbered topic trees as primary current-state docs |

## Naming and Layout

- Backend files use descriptive JS filenames such as `guiServerRuntime.js`, `runtimeOpsRoutes.js`, `specDbSchema.js`.
- GUI components use PascalCase filenames such as `RuntimeOpsPage.tsx`, `CategoryManager.tsx`, `ReviewPage.tsx`.
- GUI tabbed routes and labels are registry-driven from `tools/gui-react/src/registries/pageRegistry.ts`.
- `tools/gui-react/src/pages/**` contains a mix of thin wrappers and still-live page-local implementations. Check whether the real logic lives in `tools/gui-react/src/features/**` before editing.
- Domain contracts use `DOMAIN.md` where present, for example `src/db/DOMAIN.md`.

## Imports and Dependency Direction

- Features may import `src/core/` and `src/shared/`.
- Cross-feature imports should prefer explicit public entrypoints such as `src/features/catalog/index.js` or `src/features/settings-authority/index.js`.
- GUI network calls go through `tools/gui-react/src/api/client.ts`, `tools/gui-react/src/api/ws.ts`, or feature authority hooks built on top of them.
- Runtime/config keys must be introduced through `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and the `src/features/settings-authority/` contract layer.

## Testing Conventions

- Test runner: `node --test`.
- Current test roots: `test/`, `src/**/tests/`, `tools/gui-react/**/__tests__/`, and `e2e/`.
- Prefer behavior-level tests over implementation-coupled file-content tests.
- Playwright browser coverage is configured in `playwright.config.ts`.
- Validation snapshot from 2026-03-30:
  - `npm run gui:build` passed.
  - `npm run env:check` failed with `Missing keys in config manifest: PORT`.
  - `npm test` failed; visible failures included `src/indexlab/tests/searchPlanBuilder.payload.test.js`, `tools/gui-react/src/features/review/__tests__/reviewLaneGuiContracts.test.js`, multiple runtime-ops GUI contract suites, and `tools/gui-react/src/pages/layout/__tests__/tabNavContract.test.js`.

## Branching, Commit, PR, and Review Conventions

- No checked-in branch naming convention was found.
- No checked-in commit message convention was found.
- No checked-in PR template or GitHub workflow was found.
- The strongest review rules live in the repo guidance files above: characterize first, keep documentation traceable, and do not invent architecture that the code does not implement.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | repo-wide editing, testing, and architecture rules |
| source | `AGENTS.testing.md` | testing-focused repo rules |
| source | `AGENTS.testsCleanUp.md` | test-cleanup repo rules |
| source | `CLAUDE.md` | local repo guidance layered on top of AGENTS |
| source | `src/api/guiServerRuntime.js` | route-order SSOT lives here, not in `routeRegistry.js` |
| source | `src/db/DOMAIN.md` | local domain-boundary contract pattern |
| source | `tools/gui-react/src/registries/pageRegistry.ts` | GUI route/tab registry convention |
| source | `tools/gui-react/src/App.tsx` | registry-driven HashRouter shell |
| source | `tools/gui-react/src/pages/layout/TabNav.tsx` | tabs derive from the page registry |
| config | `package.json` | test runner and root toolchain expectations |
| config | `playwright.config.ts` | Playwright root and base URL |
| command | `npm run gui:build` | successful March 30 GUI build baseline |
| command | `npm run env:check` | failing March 30 env-check baseline |
| command | `npm test` | failing March 30 suite baseline |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where these conventions apply in the repo.
- [Canonical Examples](../07-patterns/canonical-examples.md) - Concrete examples of compliant additions.
- [Anti-Patterns](../07-patterns/anti-patterns.md) - Specific patterns the repo expects you to avoid.
