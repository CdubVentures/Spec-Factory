# Target Hierarchy Structure

## Decision

Yes, this reorganization should have an explicit target hierarchy.

## Backend Target (`src/`)

```text
src/
  app/
    cli/
    api/
    bootstrap/

  features/
    catalog-identity/
      application/
      domain/
      contracts/
      infrastructure/
      index.js
    studio-authoring/
      application/
      domain/
      contracts/
      infrastructure/
      index.js
    runtime-intelligence/
      indexing-lab/
        application/
        domain/
        contracts/
        infrastructure/
        index.js
      runtime-ops/
        application/
        domain/
        contracts/
        infrastructure/
        index.js
      shared/
        contracts/
        types/
        mappers/
      index.js
    review-curation/
      application/
      domain/
      contracts/
      infrastructure/
      index.js
    publishing-learning/
      application/
      domain/
      contracts/
      infrastructure/
      index.js
    settings-authority/
      application/
      domain/
      contracts/
      infrastructure/
      index.js

  shared-core/
    primitives/
    contracts/
    types/

  infrastructure/
    db/
    storage/
    ws/
    process/
    external/
```

## Frontend Target (`tools/gui-react/src/`)

```text
tools/gui-react/src/
  app/
    router/
    shell/
    bootstrap/

  features/
    catalog-identity/
      pages/
      components/
      stores/
      hooks/
      api/
      types/
      index.ts
    studio-authoring/
      pages/
      components/
      stores/
      hooks/
      api/
      types/
      index.ts
    runtime-intelligence/
      indexing-lab/
        pages/
        components/
        stores/
        hooks/
        api/
        types/
        index.ts
      runtime-ops/
        pages/
        components/
        stores/
        hooks/
        api/
        types/
        index.ts
      shared/
        components/
        stores/
        hooks/
        api/
        types/
      index.ts
    review-curation/
      pages/
      components/
      stores/
      hooks/
      api/
      types/
      index.ts
    publishing-learning/
      pages/
      components/
      stores/
      hooks/
      api/
      types/
      index.ts
    settings-authority/
      pages/
      components/
      stores/
      hooks/
      api/
      types/
      index.ts

  shared/
    ui/
    lib/
    types/

  infrastructure/
    api/
    ws/
    query/
    persistence/
```

## Import Direction Rule

```text
app -> features -> shared-core/shared -> infrastructure
```

- No direct imports into another feature's internal files.
- Cross-feature calls must go through each feature's public `index` contract.

## Tab-to-Feature Grouping (Target Order)

Use this order for top-level product navigation grouping:

1. `catalog-identity`
   Tabs: `Overview`, `Selected Product`, `Categories`, `Catalog`
2. `studio-authoring`
   Tabs: `Field Rules Studio`, `Field Test` (drawer entry)
3. `runtime-intelligence`
   Tabs: `Indexing Lab`, `Runtime Ops`
4. `review-curation`
   Tabs: `Review Grid`, `Review Components`
5. `publishing-learning`
   Tabs: `Billing & Learning`
6. `settings-authority`
   Tabs: `Pipeline Settings`, `Review LLM`, `Storage`

`settings-authority` is intentionally ordered after `publishing-learning` in this target grouping.
