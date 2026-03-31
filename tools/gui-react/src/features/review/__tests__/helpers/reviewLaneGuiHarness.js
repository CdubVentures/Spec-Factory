import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SpecDb } from '../../../../../../../src/db/specDb.js';
import { seedSpecDb } from '../../../../../../../src/db/seed.js';
import { buildComponentIdentifier } from '../../../../../../../src/utils/componentIdentifier.js';
import { skipIfSpawnEperm } from '../../../../../../../src/shared/tests/helpers/spawnEperm.js';
import {
  PRODUCT_A,
  PRODUCT_B,
  makeStorage,
  writeJson,
  seedFieldRules,
  seedComponentDb,
  seedKnownValues,
  seedWorkbookMap,
  seedLatestArtifacts,
  buildFieldRulesForSeed,
  replaceCandidateRow,
  findFreePort,
  waitForServerReady,
  apiJson,
  getItemFieldStateId,
  getStrictKeyReviewState,
  upsertStrictKeyReviewState,
  stopProcess,
} from '../../../../../../../src/features/review/tests/fixtures/reviewLaneFixtures.js';

export {
  PRODUCT_A,
  PRODUCT_B,
  getItemFieldStateId,
  getStrictKeyReviewState,
};

export const CATEGORY = 'mouse_contract_lane_matrix_gui';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

const PRODUCTS = {
  [PRODUCT_A]: {
    identity: { brand: 'Acme', model: 'Orbit X1' },
    fields: { weight: '49', dpi: '35000', sensor: 'PAW3950', connection: '2.4GHz' },
    provenance: {
      weight: { value: '49', confidence: 0.95 },
      dpi: { value: '35000', confidence: 0.97 },
      sensor: { value: 'PAW3950', confidence: 0.98 },
      connection: { value: '2.4GHz', confidence: 0.98 },
    },
    candidates: {
      weight: [
        { candidate_id: 'p1-weight-1', value: '49', score: 0.95, host: 'acme.test', source_host: 'acme.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 },
        { candidate_id: 'collision_primary_candidate', value: '49', score: 0.71, host: 'collision.example', source_host: 'collision.example', source_method: 'llm', method: 'llm', source_tier: 3, tier: 3 },
        { candidate_id: 'weight-unk-candidate', value: 'unk', score: 0.1, host: 'unknown.example', source_host: 'unknown.example', source_method: 'llm', method: 'llm', source_tier: 3, tier: 3 },
      ],
      dpi: [{ candidate_id: 'p1-dpi-1', value: '35000', score: 0.97, host: 'acme.test', source_host: 'acme.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 }],
      sensor: [
        { candidate_id: 'p1-sensor-1', value: 'PAW3950', score: 0.98, host: 'acme.test', source_host: 'acme.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 },
        { candidate_id: 'global_sensor_candidate', value: 'PAW3950', score: 0.92, host: 'aggregate.example', source_host: 'aggregate.example', source_method: 'llm', method: 'llm', source_tier: 2, tier: 2 },
      ],
      connection: [
        { candidate_id: 'p1-conn-1', value: '2.4GHz', score: 0.98, host: 'acme.test', source_host: 'acme.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 },
        { candidate_id: 'global_connection_candidate', value: '2.4GHz', score: 0.9, host: 'aggregate.example', source_host: 'aggregate.example', source_method: 'llm', method: 'llm', source_tier: 2, tier: 2 },
        { candidate_id: 'p1-conn-3', value: '2.4GHz', score: 0.9, host: 'manual.example', source_host: 'manual.example', source_method: 'llm', method: 'llm', source_tier: 2, tier: 2 },
        { candidate_id: 'p1-conn-2', value: 'Wireless', score: 0.65, host: 'forum.example', source_host: 'forum.example', source_method: 'llm', method: 'llm', source_tier: 3, tier: 3 },
      ],
      dpi_max: [
        { candidate_id: 'cmp_dpi_35000', value: '35000', score: 0.9, host: 'pixart.com', source_host: 'pixart.com', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 },
        { candidate_id: 'cmp_dpi_25000', value: '25000', score: 0.82, host: 'mirror.example', source_host: 'mirror.example', source_method: 'llm', method: 'llm', source_tier: 2, tier: 2 },
        { candidate_id: 'collision_shared_candidate', value: '35000', score: 0.79, host: 'collision.example', source_host: 'collision.example', source_method: 'llm', method: 'llm', source_tier: 3, tier: 3 },
        { candidate_id: 'cmp_dpi_unknown', value: 'unk', score: 0.1, host: 'unknown.example', source_host: 'unknown.example', source_method: 'llm', method: 'llm', source_tier: 3, tier: 3 },
      ],
    },
  },
  [PRODUCT_B]: {
    identity: { brand: 'Nova', model: 'Glide 2' },
    fields: { weight: '52', dpi: '26000', sensor: 'PAW3950', connection: '2.4GHz' },
    provenance: {
      weight: { value: '52', confidence: 0.93 },
      dpi: { value: '26000', confidence: 0.95 },
      sensor: { value: 'PAW3950', confidence: 0.96 },
      connection: { value: '2.4GHz', confidence: 0.96 },
    },
    candidates: {
      weight: [{ candidate_id: 'p2-weight-1', value: '52', score: 0.93, host: 'nova.test', source_host: 'nova.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 }],
      dpi: [{ candidate_id: 'p2-dpi-1', value: '26000', score: 0.95, host: 'nova.test', source_host: 'nova.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 }],
      sensor: [{ candidate_id: 'p2-sensor-1', value: 'PAW3950', score: 0.96, host: 'nova.test', source_host: 'nova.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 }],
      connection: [{ candidate_id: 'p2-conn-1', value: '2.4GHz', score: 0.96, host: 'nova.test', source_host: 'nova.test', source_method: 'dom', method: 'dom', source_tier: 1, tier: 1 }],
    },
  },
};

async function seedProductCatalog(helperRoot, category) {
  await writeJson(path.join(helperRoot, category, '_control_plane', 'product_catalog.json'), {
    _doc: 'Per-category product catalog. Managed by GUI.',
    _version: 1,
    products: {
      [PRODUCT_A]: {
        id: 1,
        identifier: 'a1',
        brand: 'Acme',
        model: 'Orbit X1',
        variant: '',
        status: 'active',
        seed_urls: [],
        added_at: '2026-02-18T00:00:00.000Z',
        added_by: 'test',
      },
      [PRODUCT_B]: {
        id: 2,
        identifier: 'b2',
        brand: 'Nova',
        model: 'Glide 2',
        variant: '',
        status: 'active',
        seed_urls: [],
        added_at: '2026-02-18T00:00:01.000Z',
        added_by: 'test',
      },
    },
  });
}

async function seedComponentReviewSuggestions(helperRoot, category) {
  await writeJson(path.join(helperRoot, category, '_suggestions', 'component_review.json'), {
    items: [
      {
        review_id: 'rv-cmp-35000',
        category,
        component_type: 'sensor',
        field_key: 'sensor',
        raw_query: 'PAW3950',
        matched_component: 'paw3950',
        match_type: 'exact',
        status: 'pending_ai',
        product_id: PRODUCT_A,
        created_at: '2026-02-18T00:00:00.000Z',
        product_attributes: { dpi_max: '35000', ips: '750', sensor_brand: 'PixArt' },
      },
      {
        review_id: 'rv-cmp-26000',
        category,
        component_type: 'sensor',
        field_key: 'sensor',
        raw_query: 'PAW3950',
        matched_component: 'paw3950',
        match_type: 'exact',
        status: 'pending_ai',
        product_id: PRODUCT_B,
        created_at: '2026-02-18T00:00:01.000Z',
        product_attributes: { dpi_max: '26000', sensor_brand: 'PixArt' },
      },
      {
        review_id: 'rv-enum-24',
        category,
        component_type: 'sensor',
        field_key: 'connection',
        raw_query: '2.4GHz',
        matched_component: '',
        match_type: 'exact',
        status: 'pending_ai',
        product_id: PRODUCT_A,
        created_at: '2026-02-18T00:00:02.000Z',
        product_attributes: { connection: '2.4GHz' },
      },
      {
        review_id: 'rv-enum-wireless',
        category,
        component_type: 'sensor',
        field_key: 'connection',
        raw_query: 'Wireless',
        matched_component: '',
        match_type: 'exact',
        status: 'pending_ai',
        product_id: PRODUCT_B,
        created_at: '2026-02-18T00:00:03.000Z',
        product_attributes: { connection: 'Wireless' },
      },
    ],
  });
}

function seedStrictLaneCandidates(db, category) {
  // WHY: seedSpecDb scopes raw candidate IDs (e.g. "PRODUCT::field::raw").
  // These explicit rows ensure the EXACT unscoped IDs that the key review
  // state and GUI contract tests reference are present in the candidates table.
  replaceCandidateRow(db, {
    candidateId: 'p1-weight-1',
    category,
    productId: PRODUCT_A,
    fieldKey: 'weight',
    value: '49',
    score: 0.95,
  });
  replaceCandidateRow(db, {
    candidateId: 'p1-dpi-1',
    category,
    productId: PRODUCT_A,
    fieldKey: 'dpi',
    value: '35000',
    score: 0.97,
  });
  replaceCandidateRow(db, {
    candidateId: 'collision_primary_candidate',
    category,
    productId: PRODUCT_A,
    fieldKey: 'weight',
    value: '49',
    score: 0.71,
  });
  replaceCandidateRow(db, {
    candidateId: 'weight-unk-candidate',
    category,
    productId: PRODUCT_A,
    fieldKey: 'weight',
    value: 'unk',
    score: 0.1,
  });
  replaceCandidateRow(db, {
    candidateId: 'global_sensor_candidate',
    category,
    productId: PRODUCT_A,
    fieldKey: 'sensor',
    value: 'PAW3950',
    score: 0.92,
  });
  replaceCandidateRow(db, {
    candidateId: 'p1-conn-1',
    category,
    productId: PRODUCT_A,
    fieldKey: 'connection',
    value: '2.4GHz',
    score: 0.98,
    isListField: true,
  });
  replaceCandidateRow(db, {
    candidateId: 'p1-conn-3',
    category,
    productId: PRODUCT_A,
    fieldKey: 'connection',
    value: '2.4GHz',
    score: 0.9,
    isListField: true,
  });
  replaceCandidateRow(db, {
    candidateId: 'p1-conn-2',
    category,
    productId: PRODUCT_A,
    fieldKey: 'connection',
    value: 'Wireless',
    score: 0.65,
    isListField: true,
  });
  replaceCandidateRow(db, {
    candidateId: 'global_connection_candidate',
    category,
    productId: PRODUCT_A,
    fieldKey: 'connection',
    value: '2.4GHz',
    score: 0.9,
    isListField: true,
  });
  replaceCandidateRow(db, {
    candidateId: 'cmp_dpi_35000',
    category,
    productId: PRODUCT_A,
    fieldKey: 'dpi_max',
    value: '35000',
    score: 0.9,
    isComponentField: true,
    componentType: 'sensor',
  });
  replaceCandidateRow(db, {
    candidateId: 'cmp_dpi_25000',
    category,
    productId: PRODUCT_A,
    fieldKey: 'dpi_max',
    value: '25000',
    score: 0.82,
    isComponentField: true,
    componentType: 'sensor',
  });
  replaceCandidateRow(db, {
    candidateId: 'collision_shared_candidate',
    category,
    productId: PRODUCT_A,
    fieldKey: 'dpi_max',
    value: '35000',
    score: 0.79,
    isComponentField: true,
    componentType: 'sensor',
  });
  replaceCandidateRow(db, {
    candidateId: 'cmp_ips_750',
    category,
    productId: PRODUCT_A,
    fieldKey: 'ips',
    value: '750',
    score: 0.9,
    isComponentField: true,
    componentType: 'sensor',
  });
  replaceCandidateRow(db, {
    candidateId: 'cmp_dpi_unknown',
    category,
    productId: PRODUCT_A,
    fieldKey: 'dpi_max',
    value: 'unk',
    score: 0.1,
    isComponentField: true,
    componentType: 'sensor',
  });
}

function seedKeyReviewState(db, componentIdentifier) {
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'grid_key',
    itemIdentifier: PRODUCT_A,
    fieldKey: 'weight',
    selectedValue: '49',
    selectedCandidateId: 'p1-weight-1',
    confidenceScore: 0.95,
    aiConfirmPrimaryStatus: 'pending',
    userAcceptPrimaryStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'grid_key',
    itemIdentifier: PRODUCT_A,
    fieldKey: 'dpi',
    selectedValue: '35000',
    selectedCandidateId: 'p1-dpi-1',
    confidenceScore: 0.97,
    aiConfirmPrimaryStatus: 'pending',
    userAcceptPrimaryStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'grid_key',
    itemIdentifier: PRODUCT_A,
    fieldKey: 'connection',
    selectedValue: '2.4GHz',
    selectedCandidateId: 'global_connection_candidate',
    confidenceScore: 0.98,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'grid_key',
    itemIdentifier: PRODUCT_B,
    fieldKey: 'connection',
    selectedValue: '2.4GHz',
    selectedCandidateId: 'global_connection_candidate',
    confidenceScore: 0.96,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'component_key',
    fieldKey: 'dpi_max',
    componentIdentifier,
    propertyKey: 'dpi_max',
    selectedValue: '35000',
    selectedCandidateId: 'cmp_dpi_35000',
    confidenceScore: 0.9,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'component_key',
    fieldKey: 'ips',
    componentIdentifier,
    propertyKey: 'ips',
    selectedValue: '750',
    selectedCandidateId: 'cmp_ips_750',
    confidenceScore: 0.9,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'component_key',
    fieldKey: '__name',
    componentIdentifier,
    propertyKey: '__name',
    selectedValue: 'PAW3950',
    selectedCandidateId: null,
    confidenceScore: 1.0,
    aiConfirmSharedStatus: 'confirmed',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'enum_key',
    fieldKey: 'connection',
    enumValueNorm: '2.4ghz',
    selectedValue: '2.4GHz',
    selectedCandidateId: 'global_connection_candidate',
    confidenceScore: 0.98,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'enum_key',
    fieldKey: 'connection',
    enumValueNorm: 'wireless',
    selectedValue: 'Wireless',
    selectedCandidateId: 'p1-conn-2',
    confidenceScore: 0.65,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
}

async function ensureGuiBuilt() {
  const distIndex = path.join(REPO_ROOT, 'tools', 'gui-react', 'dist', 'index.html');
  try {
    await fs.access(distIndex);
  } catch {
    throw new Error(`gui_dist_missing:${distIndex}`);
  }
}

export async function waitForCondition(predicate, timeoutMs = 15_000, intervalMs = 50, label = 'condition') {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await predicate();
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timeout_waiting_for_condition:${label}`);
}

export async function clickAndWaitForDrawer(page, valueTitle) {
  const rowButton = page.locator('button').filter({ has: page.locator(`span[title="${valueTitle}"]`) }).first();
  if (await rowButton.count() > 0) {
    await rowButton.click();
  } else {
    await page.locator(`span[title="${valueTitle}"]`).first().click();
  }
  await page.waitForSelector('section:has-text("Current Value")', { timeout: 20_000 });
}

export async function clickGridCell(page, productId, fieldKey) {
  await page.locator(`[data-product-id="${productId}"][data-field-key="${fieldKey}"]`).first().click();
  await page.waitForSelector('section:has-text("Current Value")', { timeout: 20_000 });
}

export async function ensureButtonVisible(page, label) {
  await page.waitForSelector(`button:has-text("${label}")`, { timeout: 10_000 });
}

export async function createReviewLaneGuiHarness(t) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'review-lane-contract-gui-'));
  const storage = makeStorage(tempRoot);
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
    localOutputRoot: path.join(tempRoot, 'out'),
    specDbDir: path.join(tempRoot, '.workspace', 'db'),
  };
  const guiDistRoot = path.join(REPO_ROOT, 'tools', 'gui-react', 'dist');
  const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');

  let child = null;
  let db = null;
  let browser = null;
  let context = null;
  let page = null;
  let cleaned = false;
  let categorySelected = false;
  const logs = [];

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try { await page?.close?.(); } catch {}
    try { await context?.close?.(); } catch {}
    try { await browser?.close?.(); } catch {}
    await stopProcess(child);
    try { db?.close?.(); } catch {}
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  function currentHashPath() {
    const currentUrl = String(page?.url?.() || '');
    const hashIndex = currentUrl.indexOf('#');
    if (hashIndex === -1) return '/';
    const hashPath = currentUrl.slice(hashIndex + 1).trim();
    return hashPath || '/';
  }

  async function ensureShellReady() {
    await page.waitForSelector('h1.sf-shell-title', { timeout: 20_000 });
  }

  async function ensureCategorySelected() {
    const categorySelect = page.locator('aside select').first();
    await waitForCondition(async () => (await categorySelect.locator(`option[value="${CATEGORY}"]`).count()) > 0, 20_000, 60, 'category_option_visible');
    const currentValue = await categorySelect.inputValue().catch(() => '');
    if (categorySelected && currentValue === CATEGORY) return;
    if (currentValue !== CATEGORY) {
      await categorySelect.selectOption(CATEGORY);
      await waitForCondition(async () => (await categorySelect.inputValue()) === CATEGORY, 20_000, 60, 'category_selected');
    }
    categorySelected = true;
  }

  async function loadReviewHome() {
    if (currentHashPath() !== '/review') {
      await page.goto(`${baseUrl}/#/review`, { waitUntil: 'domcontentloaded' });
    }
    await ensureShellReady();
    await ensureCategorySelected();
  }

  async function openReviewGrid() {
    await loadReviewHome();
    if (currentHashPath() !== '/review') {
      await page.getByRole('link', { name: 'Review Grid' }).click();
    }
    await waitForCondition(async () => {
      const payload = await apiJson(baseUrl, 'GET', `/review/${CATEGORY}/products-index`);
      return Array.isArray(payload?.products) && payload.products.length >= 2;
    }, 20_000, 60, 'products_index_populated');
    await page.waitForSelector(`[data-product-id="${PRODUCT_A}"][data-field-key="weight"]`, { timeout: 20_000 });
  }

  async function openReviewComponents() {
    if (currentHashPath() !== '/review-components') {
      await loadReviewHome();
      await page.getByRole('link', { name: 'Review Components' }).click();
    } else {
      await ensureShellReady();
      await ensureCategorySelected();
    }
    await page.waitForSelector('text=Enum Lists', { timeout: 20_000 });
    const debugToggle = page.getByRole('button', { name: /Debug LP\+ID/ }).first();
    if ((await debugToggle.count()) > 0) {
      const label = String(await debugToggle.innerText());
      if (!label.includes('ON')) {
        await debugToggle.click();
      }
      await waitForCondition(async () => String(await debugToggle.innerText()).includes('ON'), 10_000, 50, 'component_debug_toggle_on');
    }
  }

  async function openSensorComponentView() {
    await openReviewComponents();
    await page.getByRole('button', { name: /^Sensor/ }).first().click();
    await page.waitForSelector('span[title="35000"]', { timeout: 20_000 });
  }

  async function openEnumList(fieldLabel = 'connection') {
    await openReviewComponents();
    await page.getByRole('button', { name: 'Enum Lists' }).click();
    await page.getByRole('button', { name: new RegExp(fieldLabel, 'i') }).first().waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: new RegExp(fieldLabel, 'i') }).first().click();
  }

  t.after(cleanup);

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await ensureGuiBuilt();
    await Promise.all([
      seedFieldRules(config.categoryAuthorityRoot, CATEGORY),
      seedComponentDb(config.categoryAuthorityRoot, CATEGORY),
      seedKnownValues(config.categoryAuthorityRoot, CATEGORY),
      seedWorkbookMap(config.categoryAuthorityRoot, CATEGORY),
      seedProductCatalog(config.categoryAuthorityRoot, CATEGORY),
      Promise.all(
        Object.entries(PRODUCTS).map(([productId, product]) =>
          seedLatestArtifacts(storage, CATEGORY, productId, product)),
      ),
      seedComponentReviewSuggestions(config.categoryAuthorityRoot, CATEGORY),
    ]);

    const dbPath = path.join(tempRoot, '.workspace', 'db', CATEGORY, 'spec.sqlite');
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    db = new SpecDb({ dbPath, category: CATEGORY });
    await seedSpecDb({
      db,
      config,
      category: CATEGORY,
      fieldRules: buildFieldRulesForSeed(),
      logger: null,
    });
    seedStrictLaneCandidates(db, CATEGORY);
    seedKeyReviewState(db, componentIdentifier);

    const guiServerPath = path.join(REPO_ROOT, 'src', 'api', 'guiServer.js');
    try {
      child = spawn('node', [guiServerPath, '--port', String(port), '--local'], {
        cwd: tempRoot,
        env: {
          ...process.env,
          CATEGORY_AUTHORITY_ROOT: config.categoryAuthorityRoot,
          LOCAL_OUTPUT_ROOT: config.localOutputRoot,
          LOCAL_INPUT_ROOT: path.join(tempRoot, 'fixtures'),
          OUTPUT_MODE: 'local',
          LOCAL_MODE: 'true',
          __GUI_DIST_ROOT: guiDistRoot,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (skipIfSpawnEperm(t, error)) return null;
      throw error;
    }

    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    const browserPromise = chromium.launch({ headless: true }).catch((error) => {
      if (skipIfSpawnEperm(t, error, 'sandbox blocks Playwright browser launch')) return null;
      throw error;
    });
    await waitForServerReady(baseUrl, child);
    browser = await browserPromise;
    if (!browser) return null;

    context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    page = await context.newPage();

    return {
      baseUrl,
      componentIdentifier,
      db,
      page,
      openEnumList,
      openReviewComponents,
      openReviewGrid,
      openSensorComponentView,
    };
  } catch (error) {
    await cleanup();
    throw new Error(`${error.message}\nserver_logs:\n${logs.join('')}`);
  }
}
