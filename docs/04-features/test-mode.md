# Test Mode

> **Purpose:** Document the field contract audit dashboard and its backend test-mode routes.
> **Prerequisites:** [feature-index.md](./feature-index.md), [../03-architecture/routing-and-gui.md](../03-architecture/routing-and-gui.md)
> **Last validated:** 2026-04-10

## Overview

Test Mode provides an automated field contract audit surface. It validates every field rule against synthesized good, reject, and repair values, caches results in the `field_audit_cache` SpecDb table, and renders a per-field breakdown in the GUI.

The `/test-mode` route is not part of `PAGE_REGISTRY`. It is mounted directly inside `AppShell` in `tools/gui-react/src/App.tsx`.

## Key Files

| Role | Path |
|------|------|
| GUI page | `tools/gui-react/src/pages/test-mode/TestModePage.tsx` |
| GUI audit renderer | `tools/gui-react/src/pages/test-mode/FieldContractAudit.tsx` |
| GUI types | `tools/gui-react/src/pages/test-mode/types.ts` |
| Backend route handler | `src/app/api/routes/testModeRoutes.js` |
| Backend route context | `src/app/api/routes/testModeRouteContext.js` |
| Field contract test runner | `src/tests/fieldContractTestRunner.js` |
| Failure value derivation | `src/tests/deriveFailureValues.js` |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/test-mode/audit?category=<cat>` | Read cached audit result from `field_audit_cache` table |
| `POST` | `/api/v1/test-mode/validate` | Run full field contract audit, persist result to DB, return results |

## Data Flow

1. User selects a category and clicks "Run Audit" on the `/test-mode` page.
2. `POST /api/v1/test-mode/validate` runs `fieldContractTestRunner` against compiled field rules, known values (merged with discovery enums), and component DBs.
3. Results are persisted to `field_audit_cache` in the category SpecDb.
4. On page load, `GET /api/v1/test-mode/audit` returns cached results if available.

## Domain Invariants

- Test mode depends on a seeded SpecDb with compiled field rules.
- Discovery enum values are merged into known values before audit execution.
- Cached audit results survive page refreshes and tab switches via both DB persistence and React Query `staleTime: Infinity`.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `tools/gui-react/src/pages/test-mode/TestModePage.tsx` | GUI page structure and query patterns |
| source | `tools/gui-react/src/App.tsx` | `/test-mode` mounted inside `AppShell`, outside `PAGE_REGISTRY` |
| source | `src/app/api/routes/testModeRoutes.js` | Backend route handler and DB persistence |
| source | `src/app/api/routes/testModeRouteContext.js` | Route context factory |
| source | `src/tests/fieldContractTestRunner.js` | Test runner entry point |

## Related Documents

- [Feature Index](./feature-index.md) - complete feature lookup table.
- [Routing and GUI](../03-architecture/routing-and-gui.md) - route map showing `/test-mode` inside AppShell.
- [Review Workbench](./review-workbench.md) - related field validation workflows.
