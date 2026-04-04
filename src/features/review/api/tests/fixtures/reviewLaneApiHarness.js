import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { SpecDb } from '../../../../../db/specDb.js';
import { seedSpecDb } from '../../../../../db/seed.js';
import { buildComponentIdentifier } from '../../../../../utils/componentIdentifier.js';
import { throwIfSpawnEperm } from '../../../../../shared/tests/helpers/spawnEperm.js';
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
  findFreePort,
  waitForServerReady,
  apiJson,
  apiRawJson,
  findEnumValue,
  getItemFieldStateId,
  getComponentIdentityId,
  getComponentValueId,
  getEnumSlotIds,
  upsertStrictKeyReviewState,
  getStrictKeyReviewState,
  stopProcess,
} from '../../../tests/fixtures/reviewLaneFixtures.js';

export {
  PRODUCT_A,
  PRODUCT_B,
  apiJson,
  apiRawJson,
  findEnumValue,
  getItemFieldStateId,
  getComponentIdentityId,
  getComponentValueId,
  getEnumSlotIds,
  upsertStrictKeyReviewState,
  getStrictKeyReviewState,
};

export const CATEGORY = 'mouse_contract_lane_matrix';

const PRODUCTS = {
  [PRODUCT_A]: {
    identity: { brand: 'Razer', model: 'Viper V3 Pro' },
    fields: { weight: '49', dpi: '35000', sensor: 'PAW3950', connection: '2.4GHz' },
    provenance: {
      weight: { value: '49', confidence: 0.95 },
      dpi: { value: '35000', confidence: 0.97 },
      sensor: { value: 'PAW3950', confidence: 0.98 },
      connection: { value: '2.4GHz', confidence: 0.98 },
    },
  },
  [PRODUCT_B]: {
    identity: { brand: 'Pulsar', model: 'X2 V3' },
    fields: { weight: '52', dpi: '26000', sensor: 'PAW3950', connection: '2.4GHz' },
    provenance: {
      weight: { value: '52', confidence: 0.93 },
      dpi: { value: '26000', confidence: 0.95 },
      sensor: { value: 'PAW3950', confidence: 0.96 },
      connection: { value: '2.4GHz', confidence: 0.96 },
    },
  },
};

function buildComponentRowMatcher(item) {
  return item?.name === 'PAW3950' && item?.maker === 'PixArt';
}

function seedComponentReviewSuggestions(db, category) {
  const items = [
    {
      review_id: 'rv-cmp-35000',
      category,
      component_type: 'sensor',
      field_key: 'sensor',
      raw_query: 'PAW3950',
      matched_component: 'PAW3950',
      match_type: 'exact',
      status: 'pending_ai',
      product_id: PRODUCT_A,
      created_at: '2026-02-18T00:00:00.000Z',
      product_attributes: { dpi_max: '35000', sensor_brand: 'PixArt' },
    },
    {
      review_id: 'rv-cmp-26000',
      category,
      component_type: 'sensor',
      field_key: 'sensor',
      raw_query: 'PAW3950',
      matched_component: 'PAW3950',
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
  ];
  for (const item of items) {
    db.upsertComponentReviewItem(item);
  }
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
    fieldKey: 'sensor',
    selectedValue: 'PAW3950',
    selectedCandidateId: 'global_sensor_candidate',
    confidenceScore: 0.98,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
  upsertStrictKeyReviewState(db, CATEGORY, {
    category: CATEGORY,
    targetKind: 'grid_key',
    itemIdentifier: PRODUCT_B,
    fieldKey: 'sensor',
    selectedValue: 'PAW3950',
    selectedCandidateId: 'global_sensor_candidate',
    confidenceScore: 0.96,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
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
    targetKind: 'enum_key',
    fieldKey: 'connection',
    enumValueNorm: '2.4ghz',
    selectedValue: '2.4GHz',
    selectedCandidateId: 'global_connection_candidate',
    confidenceScore: 0.98,
    aiConfirmSharedStatus: 'pending',
    userAcceptSharedStatus: null,
  });
}

async function seedReviewLaneApiWorkspace(workspaceRoot) {
  const storage = makeStorage(workspaceRoot);
  const config = {
    categoryAuthorityRoot: path.join(workspaceRoot, 'category_authority'),
    localOutputRoot: path.join(workspaceRoot, 'out'),
    specDbDir: path.join(workspaceRoot, '.workspace', 'db'),
  };
  const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');
  const dbPath = path.join(config.specDbDir, CATEGORY, 'spec.sqlite');

  await seedFieldRules(config.categoryAuthorityRoot, CATEGORY);
  await seedComponentDb(config.categoryAuthorityRoot, CATEGORY);
  await seedKnownValues(config.categoryAuthorityRoot, CATEGORY);
  await seedWorkbookMap(config.categoryAuthorityRoot, CATEGORY);
  await Promise.all(
    Object.entries(PRODUCTS).map(([productId, product]) =>
      seedLatestArtifacts(storage, CATEGORY, productId, product)),
  );

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new SpecDb({ dbPath, category: CATEGORY });
  try {
    await seedSpecDb({
      db,
      config,
      category: CATEGORY,
      fieldRules: buildFieldRulesForSeed(),
      logger: null,
    });
    // WHY: fieldReviewHandlers checks products table for product existence
    for (const productId of Object.keys(PRODUCTS)) {
      db.upsertProduct({ category: CATEGORY, product_id: productId, brand: '', model: productId });
    }
    seedComponentReviewSuggestions(db, CATEGORY);
    seedKeyReviewState(db, componentIdentifier);
  } finally {
    db.close();
  }

  return { componentIdentifier };
}

export async function createReviewLaneApiHarness(t) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'review-lane-contract-api-'));
  const config = {
    categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
    localOutputRoot: path.join(tempRoot, 'out'),
    specDbDir: path.join(tempRoot, '.workspace', 'db'),
  };
  const componentIdentifier = buildComponentIdentifier('sensor', 'PAW3950', 'PixArt');

  let child = null;
  let db = null;
  let cleaned = false;
  const logs = [];

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    await stopProcess(child);
    try {
      db?.close?.();
    } catch {
      // best-effort cleanup
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  t.after(cleanup);

  try {
    await seedReviewLaneApiWorkspace(tempRoot);

    const dbPath = path.join(config.specDbDir, CATEGORY, 'spec.sqlite');
    db = new SpecDb({ dbPath, category: CATEGORY });

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const guiServerPath = path.resolve('src/api/guiServer.js');

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
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throwIfSpawnEperm(error, 'review lane API harness requires spawning the GUI server');
      throw error;
    }

    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));
    await waitForServerReady(baseUrl, child);

    return {
      baseUrl,
      componentIdentifier,
      config,
      db,
      findComponentRow: (payload) => (payload?.items || []).find(buildComponentRowMatcher) || null,
    };
  } catch (error) {
    await cleanup();
    throw new Error(`${error.message}\nserver_logs:\n${logs.join('')}`);
  }
}
