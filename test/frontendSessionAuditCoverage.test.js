import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

test('runtime ops control state is session-scoped', () => {
  const runtimeOpsPage = readText('tools/gui-react/src/pages/runtime-ops/RuntimeOpsPage.tsx');
  const workersTab = readText('tools/gui-react/src/pages/runtime-ops/panels/WorkersTab.tsx');
  const workerDrawer = readText('tools/gui-react/src/pages/runtime-ops/panels/WorkerDataDrawer.tsx');
  const documentsTab = readText('tools/gui-react/src/pages/runtime-ops/panels/DocumentsTab.tsx');
  const extractionTab = readText('tools/gui-react/src/pages/runtime-ops/panels/ExtractionTab.tsx');
  const fallbacksTab = readText('tools/gui-react/src/pages/runtime-ops/panels/FallbacksTab.tsx');
  const queueTab = readText('tools/gui-react/src/pages/runtime-ops/panels/QueueTab.tsx');

  assert.equal(runtimeOpsPage.includes('useIndexLabStore'), true, 'runtime run selection should use shared indexlab authority state');
  assert.equal(runtimeOpsPage.includes('runtimeOps:run:'), false, 'runtime run selection should not use an independent runtime-ops persisted key');
  assert.equal(workersTab.includes('runtimeOps:workers:poolFilter:'), true, 'worker pool filter should be session-scoped');
  assert.equal(workersTab.includes('runtimeOps:workers:prefetchTab:'), true, 'worker prefetch tab should be session-scoped');
  assert.equal(workerDrawer.includes('runtimeOps:workers:drawerTab:'), true, 'worker drawer tab should be session-scoped');
  assert.equal(documentsTab.includes('runtimeOps:documents:search:'), true, 'documents search filter should be session-scoped');
  assert.equal(documentsTab.includes('runtimeOps:documents:pageSize:'), true, 'documents page size should be session-scoped');
  assert.equal(extractionTab.includes('runtimeOps:extraction:search:'), true, 'extraction search filter should be session-scoped');
  assert.equal(extractionTab.includes('runtimeOps:extraction:method:'), true, 'extraction method filter should be session-scoped');
  assert.equal(extractionTab.includes('runtimeOps:extraction:status:'), true, 'extraction status filter should be session-scoped');
  assert.equal(fallbacksTab.includes('runtimeOps:fallbacks:host:'), true, 'fallback host filter should be session-scoped');
  assert.equal(fallbacksTab.includes('runtimeOps:fallbacks:result:'), true, 'fallback result filter should be session-scoped');
  assert.equal(queueTab.includes('runtimeOps:queue:lane:'), true, 'queue lane filter should be session-scoped');
});

test('llm settings list controls are session-scoped', () => {
  const uiStore = readText('tools/gui-react/src/stores/uiStore.ts');
  const llmSettingsPage = readText('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

  assert.equal(llmSettingsPage.includes('llmSettings:selectedRoute:'), true, 'selected preset should be session-scoped');
  assert.equal(llmSettingsPage.includes('llmSettings:sortBy:'), true, 'sort-by should be session-scoped');
  assert.equal(llmSettingsPage.includes('llmSettings:sortDir:'), true, 'sort direction should be session-scoped');
  assert.equal(llmSettingsPage.includes('llmSettings:filterRequired:'), true, 'required filter should be session-scoped');
  assert.equal(llmSettingsPage.includes('llmSettings:filterDifficulty:'), true, 'difficulty filter should be session-scoped');
  assert.equal(llmSettingsPage.includes('llmSettings:filterAvailability:'), true, 'availability filter should be session-scoped');
  assert.equal(llmSettingsPage.includes('llmSettings:filterEffortBand:'), true, 'effort-band filter should be session-scoped');
  assert.equal(uiStore.includes('llmSettings:autoSaveEnabled'), true, 'auto-save key ownership should be centralized in uiStore');
  assert.equal(uiStore.includes('llmSettings:autoSave:'), false, 'auto-save key should not be category-scoped');
  assert.equal(llmSettingsPage.includes('llmSettingsAutoSaveEnabled'), true, 'auto-save toggle should read from uiStore');
  assert.equal(llmSettingsPage.includes('setLlmSettingsAutoSaveEnabled'), true, 'auto-save toggle should write through uiStore');
  assert.equal(llmSettingsPage.includes('llmSettings:autoSave:'), false, 'llm settings page should not directly own autosave key strings');
});

test('sidebar product selector chain is session-scoped by category', () => {
  const sidebar = readText('tools/gui-react/src/components/layout/Sidebar.tsx');

  assert.equal(sidebar.includes('usePersistedTab'), true, 'sidebar should use persisted tab state');
  assert.equal(sidebar.includes('sidebar:product:brand:'), true, 'sidebar brand selection should be session-scoped');
  assert.equal(sidebar.includes('sidebar:product:model:'), true, 'sidebar model selection should be session-scoped');
  assert.equal(sidebar.includes('sidebar:product:variant:'), true, 'sidebar variant selection should be session-scoped');
});

test('app header task drawer state is session-scoped', () => {
  const appShell = readText('tools/gui-react/src/components/layout/AppShell.tsx');

  assert.equal(appShell.includes('appShell:header:taskDrawer:open'), true, 'header task drawer open state should be session-scoped');
  assert.equal(appShell.includes('Open Field Test tab'), true, 'header task drawer should expose Field Test tab label inside drawer');
  assert.equal(appShell.includes('appShell:fieldTest:returnPath'), true, 'field test should persist last non-test path for restore');
  assert.equal(appShell.includes('appShell:fieldTest:returnCategory'), true, 'field test should persist last non-test category for restore');
  assert.equal(appShell.includes('handleFieldTestToggle'), true, 'field test button should toggle back to previous tab when active');
});

test('major catalog and product tables persist search/sort per session', () => {
  const overviewPage = readText('tools/gui-react/src/pages/overview/OverviewPage.tsx');
  const productPage = readText('tools/gui-react/src/pages/product/ProductPage.tsx');
  const productManager = readText('tools/gui-react/src/pages/catalog/ProductManager.tsx');
  const brandManager = readText('tools/gui-react/src/pages/studio/BrandManager.tsx');

  assert.equal(overviewPage.includes('persistKey={`overview:table:'), true, 'overview table should persist session table state');
  assert.equal(productPage.includes('persistKey={`product:fields:'), true, 'product field table should persist session table state');
  assert.equal(productManager.includes('persistKey={`catalog:products:table:'), true, 'catalog products table should persist session table state');
  assert.equal(brandManager.includes('persistKey={`catalog:brands:table:'), true, 'catalog brands table should persist session table state');
});

test('indexing runtime nested section toggles are session-scoped', () => {
  const runtimePanel = readText('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');

  assert.equal(runtimePanel.includes('usePersistedToggle'), true, 'runtime panel should use persisted toggle state');
  assert.equal(runtimePanel.includes('indexing:runtime:runSetupDiscovery'), true, 'run setup/discovery section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:fetchThroughput'), true, 'fetch throughput section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:dynamicRenderingOcr'), true, 'dynamic rendering + ocr section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:plannerTriage'), true, 'planner + triage section should be session-scoped');
  assert.equal(runtimePanel.includes('const plannerTriageLocked = !discoveryEnabled;'), true, 'planner + triage section should lock when discovery is disabled');
  assert.equal(runtimePanel.includes('open={plannerTriageLocked ? false : plannerTriageOpen}'), true, 'planner + triage section should stay closed while discovery is disabled');
  assert.equal(runtimePanel.includes('blocked: discovery disabled'), true, 'planner + triage section should explain discovery lock with a red flag reason');
  assert.equal(runtimePanel.includes('indexing:runtime:roleRouting'), true, 'role routing section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:fallbackRouting'), true, 'fallback routing section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:routeSnapshot'), true, 'route snapshot section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:resumePolicy'), true, 'resume policy section should be session-scoped');
  assert.equal(runtimePanel.includes('indexing:runtime:convergenceTuning'), true, 'convergence tuning section should be session-scoped');
});

test('indexing event stream nested watch toggles are session-scoped and default closed', () => {
  const eventStreamPanel = readText('tools/gui-react/src/pages/indexing/panels/EventStreamPanel.tsx');

  assert.equal(eventStreamPanel.includes('nestedPersistScope'), true, 'event stream nested toggles should share a persisted scope token');
  assert.equal(eventStreamPanel.includes('usePersistedToggle(`indexing:eventStream:nested:${nestedPersistScope}:overview`, false)'), true, 'indexing lab nested watch toggle should be session-scoped and default closed');
  assert.equal(eventStreamPanel.includes('usePersistedToggle(`indexing:eventStream:nested:${nestedPersistScope}:panelControls`, false)'), true, 'panel controls nested watch toggle should be session-scoped and default closed');
  assert.equal(eventStreamPanel.includes('usePersistedToggle(`indexing:eventStream:nested:${nestedPersistScope}:sessionData`, false)'), true, 'session data nested watch toggle should be session-scoped and default closed');
  assert.equal(eventStreamPanel.includes('usePersistedToggle(`indexing:eventStream:nested:${nestedPersistScope}:eventFeed`, false)'), true, 'event stream feed nested watch toggle should be session-scoped and default closed');
});

test('studio key navigator selection and nested sections are session-scoped', () => {
  const studioPage = readText('tools/gui-react/src/pages/studio/StudioPage.tsx');
  const workbenchDrawer = readText('tools/gui-react/src/pages/studio/workbench/WorkbenchDrawer.tsx');

  assert.equal(studioPage.includes('studio:keyNavigator:selectedKey:'), true, 'selected key should be session-scoped by category');
  assert.equal(studioPage.includes('studio:keyNavigator:selectedGroup:'), true, 'selected group filter should be session-scoped by category');
  assert.equal(studioPage.includes('studio:keyNavigator:section:contract:'), true, 'contract section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:priority:'), true, 'priority section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:parse:'), true, 'parse section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:enum:'), true, 'enum section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:components:'), true, 'components section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:constraints:'), true, 'constraints section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:evidence:'), true, 'evidence section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:uiDisplay:'), true, 'ui/display section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:searchHints:'), true, 'search hints section should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:section:fullRuleJson:'), true, 'full rule json details should be session-scoped');
  assert.equal(studioPage.includes('studio:keyNavigator:enumSourceTab:'), true, 'key navigator nested enum source tab should be session-scoped');
  assert.equal(workbenchDrawer.includes('studio:workbench:enumSourceTab:'), true, 'workbench nested enum source tab should be session-scoped');
  assert.equal(studioPage.includes('if (!selectedKey || !activeFieldKeys.includes(selectedKey)) {'), true, 'key navigator should auto-select first available key when selection is empty or stale');
  assert.equal(studioPage.includes('if (!selectedGroup) return;'), true, 'key navigator should normalize stale persisted group filters');
  assert.equal(studioPage.includes('const mapSeedVersion = useMemo(() => {'), true, 'mapping studio seeding should not depend only on wbMap.version');
});

test('catalog add-product and add-brand drawers are session-scoped', () => {
  const productManager = readText('tools/gui-react/src/pages/catalog/ProductManager.tsx');
  const brandManager = readText('tools/gui-react/src/pages/studio/BrandManager.tsx');

  assert.equal(productManager.includes('catalog:products:drawerOpen:'), true, 'add/edit product drawer open state should be session-scoped');
  assert.equal(productManager.includes('catalog:products:selectedProduct:'), true, 'selected product should be session-scoped');
  assert.equal(productManager.includes('catalog:products:addDraft:brand:'), true, 'add-product brand draft should be session-scoped');
  assert.equal(productManager.includes('catalog:products:addDraft:model:'), true, 'add-product model draft should be session-scoped');
  assert.equal(productManager.includes('catalog:products:addDraft:variant:'), true, 'add-product variant draft should be session-scoped');
  assert.equal(productManager.includes('catalog:products:addDraft:seedUrls:'), true, 'add-product seed-urls draft should be session-scoped');
  assert.equal(productManager.includes('catalog:products:addDraft:status:'), true, 'add-product status draft should be session-scoped');

  assert.equal(brandManager.includes('catalog:brands:drawerOpen:'), true, 'add/edit brand drawer open state should be session-scoped');
  assert.equal(brandManager.includes('catalog:brands:selectedBrand:'), true, 'selected brand should be session-scoped');
  assert.equal(brandManager.includes('catalog:brands:addDraft:name:'), true, 'add-brand name draft should be session-scoped');
  assert.equal(brandManager.includes('catalog:brands:addDraft:aliases:'), true, 'add-brand aliases draft should be session-scoped');
  assert.equal(brandManager.includes('catalog:brands:addDraft:categories:'), true, 'add-brand categories draft should be session-scoped');
  assert.equal(brandManager.includes('catalog:brands:addDraft:website:'), true, 'add-brand website draft should be session-scoped');
});
