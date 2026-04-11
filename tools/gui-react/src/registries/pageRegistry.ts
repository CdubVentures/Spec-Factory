// WHY: Single Source of Truth for all routable pages. Adding a new page = add one
// entry here + create the feature folder. App.tsx derives <Route> elements from
// ROUTE_ENTRIES. TabNav.tsx derives tab arrays from GLOBAL_TABS / CATALOG_TABS / OPS_TABS / SETTINGS_TABS.
// ── Interfaces ──────────────────────────────────────────────────────

export interface TabDef {
  readonly path: string;
  readonly label: string;
  readonly dividerAfter?: boolean;
  readonly dividerBefore?: boolean;
}

export interface RouteEntry {
  readonly path: string;
  readonly isIndex: boolean;
  readonly loader: () => Promise<Record<string, unknown>>;
  readonly exportName: string;
}

interface PageEntry {
  readonly path: string;
  readonly label: string;
  readonly tabGroup: 'global' | 'catalog' | 'ops' | 'settings';
  readonly loader: () => Promise<Record<string, unknown>>;
  readonly exportName: string;
  readonly dividerAfter?: boolean;
  readonly dividerBefore?: boolean;
}

// ── Registry ────────────────────────────────────────────────────────

export const PAGE_REGISTRY: readonly PageEntry[] = Object.freeze([
  // ── Global group (far left, always accessible) ────────────────
  { path: '/categories',  label: 'Categories',          tabGroup: 'global',  loader: () => import('../features/catalog/components/CategoryManager.tsx'),             exportName: 'CategoryManager' },
  { path: '/brands',      label: 'Brands',              tabGroup: 'global',  loader: () => import('../features/studio/components/BrandManager.tsx'),                   exportName: 'BrandManager' },
  { path: '/colors',      label: 'Colors',              tabGroup: 'global',  loader: () => import('../features/color-registry/components/ColorRegistryPage.tsx'),      exportName: 'ColorRegistryPage' },
  { path: '/units',       label: 'Units',               tabGroup: 'global',  loader: () => import('../pages/unit-registry/UnitRegistryPage.tsx'),                     exportName: 'UnitRegistryPage' },
  { path: '/billing',     label: 'Billing',              tabGroup: 'global',  loader: () => import('../pages/billing/BillingPage.tsx'),                               exportName: 'BillingPage' },

  // ── Catalog group ───────────────────────────────────────────────
  { path: '/',            label: 'Overview',            tabGroup: 'catalog', loader: () => import('../pages/overview/OverviewPage.tsx'),                            exportName: 'OverviewPage' },
  { path: '/product',     label: 'Selected Product',    tabGroup: 'catalog', loader: () => import('../pages/product/ProductPage.tsx'),                              exportName: 'ProductPage' },
  { path: '/catalog',     label: 'Catalog',             tabGroup: 'catalog', loader: () => import('../features/catalog/components/CatalogPage.tsx'),                 exportName: 'CatalogPage',dividerAfter: true },
  { path: '/studio',      label: 'Field Rules Studio',  tabGroup: 'catalog', loader: () => import('../features/studio/components/StudioPage.tsx'),                   exportName: 'StudioPage', dividerAfter: true },

  // ── Ops group ───────────────────────────────────────────────────
  { path: '/indexing',           label: 'Indexing Lab',        tabGroup: 'ops', loader: () => import('../features/indexing/components/IndexingPage.tsx'),              exportName: 'IndexingPage' },
  { path: '/runtime-ops',        label: 'Runtime Ops',         tabGroup: 'ops', loader: () => import('../features/runtime-ops/components/RuntimeOpsPage.tsx'),        exportName: 'RuntimeOpsPage' },
  { path: '/publisher',          label: 'Publisher',           tabGroup: 'ops', loader: () => import('../pages/publisher/PublisherPage.tsx'),                         exportName: 'PublisherPage',           dividerBefore: true, dividerAfter: true },
  { path: '/review',             label: 'Review Grid',         tabGroup: 'ops', loader: () => import('../features/review/components/ReviewPage.tsx'),                 exportName: 'ReviewPage',             disabledOnAll: true },
  { path: '/review-components',  label: 'Review Components',   tabGroup: 'ops', loader: () => import('../pages/component-review/ComponentReviewPage.tsx'),            exportName: 'ComponentReviewPage',    disabledOnAll: true },
  { path: '/llm-settings',       label: 'Review LLM',         tabGroup: 'ops', loader: () => import('../pages/llm-settings/LlmSettingsPage.tsx'),                   exportName: 'LlmSettingsPage',        dividerAfter: true },
  { path: '/storage',            label: 'Storage',             tabGroup: 'ops', loader: () => import('../pages/storage/StoragePage.tsx'),                             exportName: 'StoragePage' },

  // ── Settings group (far-right) ─────────────────────────────────
  { path: '/llm-config',         label: 'LLM',                tabGroup: 'settings', loader: () => import('../features/llm-config/components/LlmConfigPage.tsx'),          exportName: 'LlmConfigPage' },
  { path: '/pipeline-settings',  label: 'Pipeline',            tabGroup: 'settings', loader: () => import('../features/pipeline-settings/components/PipelineSettingsPage.tsx'), exportName: 'PipelineSettingsPage' },
]);

// ── Derived exports ─────────────────────────────────────────────────

function toTabDef(entry: PageEntry): TabDef {
  return {
    path: entry.path,
    label: entry.label,
    ...(entry.dividerAfter ? { dividerAfter: true } : {}),
    ...(entry.dividerBefore ? { dividerBefore: true } : {}),
  };
}

export const GLOBAL_TABS: readonly TabDef[] = PAGE_REGISTRY
  .filter((e) => e.tabGroup === 'global')
  .map(toTabDef);

export const CATALOG_TABS: readonly TabDef[] = PAGE_REGISTRY
  .filter((e) => e.tabGroup === 'catalog')
  .map(toTabDef);

export const OPS_TABS: readonly TabDef[] = PAGE_REGISTRY
  .filter((e) => e.tabGroup === 'ops')
  .map(toTabDef);

export const SETTINGS_TABS: readonly TabDef[] = PAGE_REGISTRY
  .filter((e) => e.tabGroup === 'settings')
  .map(toTabDef);

export const ROUTE_ENTRIES: readonly RouteEntry[] = PAGE_REGISTRY.map((e) => ({
  path: e.path,
  isIndex: e.path === '/',
  loader: e.loader,
  exportName: e.exportName,
}));
