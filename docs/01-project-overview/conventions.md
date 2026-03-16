# Conventions

> **Purpose:** Record the enforced repository rules, code organization patterns, and notable absences so an LLM edits in-bounds.
> **Prerequisites:** [scope.md](./scope.md), [folder-map.md](./folder-map.md)
> **Last validated:** 2026-03-15

## Non-Negotiable Repo Rules

- Root rule source: `AGENTS.md`.
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
- Runtime/config keys should be introduced through `src/core/config/manifest/*.js` and `src/features/settings-authority/*`, not hardcoded into isolated modules.

## Testing Conventions

- Test runner: `node --test`.
- Primary test roots: `test/` and `tests/`.
- Prefer behavior-level tests over implementation-level tests.
- Existing suite includes GUI contract/browser tests using Playwright, for example `test/runtimeOpsWorkerContractsGui.test.js`.
- Baseline on 2026-03-15 is not fully green; see [../05-operations/known-issues.md](../05-operations/known-issues.md).

## Branching, Commit, PR, Review Conventions

- No checked-in branch naming convention was found.
- No checked-in commit message convention was found.
- No checked-in PR template or GitHub workflow was found.
- The strongest review rules live in `AGENTS.md`: TDD-first, characterization before refactor, docs traceability, no silent rule-bending.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `AGENTS.md` | Repo-wide editing, testing, architecture, and git rules |
| source | `src/db/DOMAIN.md` | Local domain-boundary contract pattern |
| config | `package.json` | test runner and root toolchain expectations |
| config | `tools/gui-react/package.json` | GUI TypeScript/Vite/Tailwind toolchain |
| source | `tools/gui-react/src/App.tsx` | thin route-wrapper pattern in the GUI |

## Related Documents

- [Folder Map](./folder-map.md) - Shows where these conventions apply in the tree.
- [Canonical Examples](../07-patterns/canonical-examples.md) - Concrete examples of compliant additions.
- [Anti-Patterns](../07-patterns/anti-patterns.md) - Specific patterns the repo expects you to avoid.
