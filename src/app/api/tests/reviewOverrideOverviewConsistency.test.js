import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../db/specDb.js';
import { createCatalogRowBuilder } from '../catalogHelpers.js';
import { handleReviewItemMutationRoute } from '../../../features/review/api/itemMutationRoutes.js';

function cleanVariant(variant) {
  const token = String(variant ?? '').trim().toLowerCase();
  if (token === '' || token === 'unknown' || token === 'n/a') return '';
  return String(variant).trim();
}

test('Overview catalog row reflects a review manual override route through SQL after mutation', async (t) => {
  const category = 'mouse';
  const productId = 'mouse-overview-review-override';
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-overview-review-override-'));
  const specDb = new SpecDb({ dbPath: ':memory:', category });
  t.after(async () => {
    specDb.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  specDb.upsertProduct({
    product_id: productId,
    category,
    brand: 'Razer',
    model: 'Viper V3 Pro',
    base_model: 'Viper V3 Pro',
    variant: '',
    status: 'active',
  });
  specDb.setFieldKeyOrder(category, JSON.stringify(['weight']));

  const responses = [];
  await handleReviewItemMutationRoute({
    parts: ['review', category, 'manual-override'],
    method: 'POST',
    req: {},
    res: {},
    context: {
      readJsonBody: async () => ({
        value: '59',
        reviewer: 'reviewer_overview',
        reason: 'verified_spec',
      }),
      jsonRes: (_res, status, body) => {
        responses.push({ status, body });
        return { status, body };
      },
      getSpecDb: () => specDb,
      resolveGridFieldStateForMutation: () => ({
        row: {
          product_id: productId,
          field_key: 'weight',
        },
      }),
      broadcastWs: () => {},
      productRoot: path.join(tempRoot, 'products'),
    },
  });
  assert.equal(responses[0]?.status, 200);

  const buildCatalogRow = createCatalogRowBuilder({
    getSpecDb: () => specDb,
    cleanVariant,
  });

  const row = await buildCatalogRow(category, productId);

  assert.equal(row.fieldsFilled, 1);
  assert.equal(row.fieldsTotal, 1);
  assert.equal(row.coverage, 1);
  assert.equal(row.confidence, 1);
});
