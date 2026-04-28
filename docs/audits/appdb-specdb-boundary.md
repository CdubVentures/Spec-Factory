# AppDb / SpecDb Boundary Audit

Date: 2026-04-28
Current severity: **LOW**

## Scope

AppDb global state and per-category SpecDb state are mostly separated cleanly. `studio_maps` is a legacy user-settings mirror, while SpecDb `field_studio_map` owns Field Studio runtime behavior. `brand_categories` is seeded from the global brand registry JSON.

## Active Findings

### G1. No explicit `categories` table - LOW

The category list is inferred from filesystem and database presence rather than represented as a queryable AppDb table.

**Fix shape:** Add a categories table only if the UI/API needs category inventory, health, or audit state in SQL.

### G2. `settings` table is an undocumented grab-bag - LOW
**File:** `src/db/appDbSchema.js`

The table contains user sections and internal `_seed_hashes`, but reserved sections are not documented in the schema.

**Fix shape:** Add a short schema comment or README note listing reserved sections and their purpose.

### G3. Cross-DB brand reference is contract-only - LOW

SpecDb product rows reference AppDb brand identifiers without SQL foreign keys because they live in separate database files.

**Fix shape:** Document the rename cascade contract or add a fan-out update if brand rename drift is reproduced.

### G4. AppDb and SpecDb migrations run on separate tracks - INFO

Separate migration runners are acceptable, but cross-DB migrations need explicit coordination.

**Fix shape:** Add a migration note when the first cross-DB migration is introduced.

## Recommended Fix Order

1. **G2** - Document reserved `settings` sections.
2. **G3** - Document or wire brand rename cascade if needed.
3. **G1** - Add categories table only when a SQL category inventory is needed.
4. **G4** - Note cross-track migration rules when relevant.
