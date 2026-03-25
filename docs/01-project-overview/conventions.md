# Conventions

> **Purpose:** Record the enforced repository rules, code organization patterns, and notable absences so an LLM edits in-bounds.
> **Prerequisites:** [scope.md](./scope.md), [folder-map.md](./folder-map.md)
> **Last validated:** 2026-03-24

## Non-Negotiable Repo Rules

- Root rule sources: `AGENTS.md`, `AGENTS.testing.md`, `AGENTS.testsCleanUp.md`, and `CLAUDE.md`.
- Backend/core source is JavaScript ESM. Do not add TypeScript syntax to `src/**/*.js`.
- GUI source under `tools/gui-react/` is TypeScript + React. `any`, `@ts-ignore`, and `@ts-nocheck` are forbidden by repo rules.
- Feature-first organization is required. Do not create generic dumping-ground modules such as `src/utils`, `src/helpers`, or `src/services` for new feature logic.
- Tests use Node built-in test runner via `node --test`.
- No network git commands and no mutating git commands are allowed from the agent workflow.

## File Placement Rules

| Concern | Live pattern | Avoid |
|---------|--------------|-------|
| Backend route handlers | `src/features/<feature>/api/*.js` or `src/app/api/routes/*.js` | adding new route branches directly inside `src/api/guiServer.js` |
| Backend persistence | `src/db/` and `src/db/stores/*.js` | ad hoc SQLite/file writes from feature routes |
| GUI route wrappers | `tools/gui-react/src/pages/**` | large stateful feature logic in `App.tsx` |
| GUI feature logic | `tools/gui-react/src/features/**` | cross-feature internals imports and one-off route-local state managers |
| Shared GUI state | `tools/gui-react/src/stores/*.ts` | duplicating canonical category/tab state in many components |
| Docs | `docs/` numbered hierarchy | reviving old unnumbered topic trees as authority docs |

## Naming and Layout

- Backend files use descriptive JS filenames such as `guiServer.js`, `runtimeOpsRoutes.js`, `specDbMigrations.js`.
- GUI components use PascalCase filenames such as `RuntimeOpsPage.tsx`, `CategoryManager.tsx`, `ReviewPage.tsx`.
- Many route files in `tools/gui-react/src/pages/**` are thin re-export wrappers. Check whether the real logic lives in `tools/gui-react/src/features/**` before editing.
- Domain contracts use `DOMAIN.md` where present, for example `src/db/DOMAIN.md`.

## Imports and Dependency Direction

- Features may import `src/core/` and `src/shared/`.
- Features must not import other features' internals except through explicit exported contracts.
- GUI fetches go through `tools/gui-react/src/api/client.ts` or related authority hooks, not ad hoc transport code spread across components.
- Runtime/config keys should be introduced through `src/shared/settingsRegistry.js`, `src/core/config/manifest/index.js`, and `src/features/settings-authority/*`, not hardcoded into isolated modules.

## Testing Conventions

- Test runner: `node --test`.
- Current test roots: `test/`, `src/**/tests/`, `tools/gui-react/**/__tests__/`, and `e2e/`.
- Prefer behavior-level tests over implementation-level tests.
- Browser coverage uses Playwright through `playwright.config.ts` and checked-in specs under `e2e/settings/`.
- Full-suite proof on 2026-03-24 is still red on the current worktree. Verified failure clusters include the missing `normalizeHost` export in `src/features/indexing/pipeline/shared/queryPlan.js`, a missing `src/features/indexing/search/index.js` import target in brand-resolver tests, catalog type-alignment drift around `QueueProduct`, and several GUI/API harness boot timeouts. Do not assume a green baseline; consult [../05-operations/known-issues.md](../05-operations/known-issues.md) before treating failures as new regressions.

## Branching, Commit, PR, Review Conventions

- No checked-in branch naming convention was found.
- No checked-in commit message convention was found.
- No checked-in PR template or GitHub workflow was found.
- The strongest review rules live in `AGENTS.md`: TDD-first, characterization before refactor, docs traceability, no silent rule-bending.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | Repo-wide editing, testing, architecture, and git rules |
| source | `AGENTS.testing.md` | Additional testing-focused repo rules |
| source | `AGENTS.testsCleanUp.md` | Additional test-cleanup rules |
| source | `CLAUDE.md` | Local repo guidance layered on top of AGENTS |
| source | `src/db/DOMAIN.md` | Local domain-boundary contract pattern |
| config | `package.json` | test runner and root toolchain expectations |
| config | `playwright.config.ts` | Playwright browser-test root and base URL |
| config | `tools/gui-react/package.json` | GUI TypeScript/Vite/Tailwind toolchain |
| source | `tools/gui-react/src/App.tsx` | thin route-wrapper pattern in the GUI |
| command | `npm test` | current full-suite baseline is red on the active worktree; see known-issues for the verified failure clusters |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where these conventions apply in the tree.
- [Canonical Examples](../07-patterns/canonical-examples.md) - Concrete examples of compliant additions.
- [Anti-Patterns](../07-patterns/anti-patterns.md) - Specific patterns the repo expects you to avoid.
