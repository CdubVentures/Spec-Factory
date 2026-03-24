import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../src/db/specDb.js';
import { buildComponentIdentifier } from '../../src/utils/componentIdentifier.js';
import {
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  resolvePropertyFieldMeta,
} from '../../src/review/componentReviewData.js';
import { applySharedLaneState } from '../../src/review/keyReviewState.js';

export const CATEGORY = 'mouse';

export {
  applySharedLaneState,
  buildComponentIdentifier,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  resolvePropertyFieldMeta,
};

export async function createTempSpecDb() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'component-review-lane-state-'));
  const dbPath = path.join(tempRoot, 'spec.sqlite');
  const specDb = new SpecDb({ dbPath, category: CATEGORY });
  return { tempRoot, specDb };
}

export async function cleanupTempSpecDb(tempRoot, specDb) {
  try {
    specDb?.close?.();
  } catch {
    // best-effort
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
}

export function makeCategoryAuthorityConfig(tempRoot) {
  return { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
}

export async function writeComponentReviewItems(tempRoot, items, category = CATEGORY) {
  const reviewPath = path.join(
    tempRoot,
    'category_authority',
    category,
    '_suggestions',
    'component_review.json',
  );
  await fs.mkdir(path.dirname(reviewPath), { recursive: true });
  await fs.writeFile(
    reviewPath,
    `${JSON.stringify({ version: 1, category, items }, null, 2)}\n`,
    'utf8',
  );
}

export function getComponentIdentityId(specDb, componentType, canonicalName, maker = '') {
  const row = specDb.db.prepare(
    `SELECT id
     FROM component_identity
     WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?
     LIMIT 1`,
  ).get(CATEGORY, componentType, canonicalName, maker);
  return row?.id ?? null;
}

export function getComponentValueId(specDb, componentType, componentName, componentMaker, propertyKey) {
  const row = specDb.db.prepare(
    `SELECT id
     FROM component_values
     WHERE category = ?
       AND component_type = ?
       AND component_name = ?
       AND component_maker = ?
       AND property_key = ?
     LIMIT 1`,
  ).get(CATEGORY, componentType, componentName, componentMaker, propertyKey);
  return row?.id ?? null;
}

export function getEnumSlot(specDb, fieldKey, value) {
  const row = specDb.db.prepare(
    `SELECT id, list_id
     FROM list_values
     WHERE category = ? AND field_key = ? AND value = ?
     LIMIT 1`,
  ).get(CATEGORY, fieldKey, value);
  return {
    listValueId: row?.id ?? null,
    enumListId: row?.list_id ?? null,
  };
}
