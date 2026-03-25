function createPageStub(exportName) {
  return `export const ${exportName} = {}; export default ${exportName};`;
}

export const PAGE_REGISTRY_MODULE_STUBS = Object.freeze({
  '../pages/overview/OverviewPage.tsx': createPageStub('OverviewPage'),
  '../pages/product/ProductPage.tsx': createPageStub('ProductPage'),
  '../features/catalog/components/CategoryManager.tsx': createPageStub('CategoryManager'),
  '../features/catalog/components/CatalogPage.tsx': createPageStub('CatalogPage'),
  '../features/studio/components/StudioPage.tsx': createPageStub('StudioPage'),
  '../features/indexing/components/IndexingPage.tsx': createPageStub('IndexingPage'),
  '../features/pipeline-settings/components/PipelineSettingsPage.tsx': createPageStub('PipelineSettingsPage'),
  '../features/runtime-ops/components/RuntimeOpsPage.tsx': createPageStub('RuntimeOpsPage'),
  '../pages/llm-settings/LlmSettingsPage.tsx': createPageStub('LlmSettingsPage'),
  '../features/review/components/ReviewPage.tsx': createPageStub('ReviewPage'),
  '../pages/component-review/ComponentReviewPage.tsx': createPageStub('ComponentReviewPage'),
  '../features/llm-config/components/LlmConfigPage.tsx': createPageStub('LlmConfigPage'),
  '../pages/billing/BillingPage.tsx': createPageStub('BillingPage'),
  '../pages/storage/StoragePage.tsx': createPageStub('StoragePage'),
});
