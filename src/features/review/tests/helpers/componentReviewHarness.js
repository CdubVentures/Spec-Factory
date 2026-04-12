import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../../db/specDb.js';
import { buildComponentIdentifier } from '../../../../utils/componentIdentifier.js';
import {
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  resolvePropertyFieldMeta,
} from '../../domain/componentReviewData.js';

export const CATEGORY = 'mouse';

export {
  buildComponentIdentifier,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  resolvePropertyFieldMeta,
};

export async function createTempSpecDb() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'component-review-lane-state-'));
  const specDb = new SpecDb({ dbPath: ':memory:', category: CATEGORY });
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
