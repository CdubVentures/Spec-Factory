import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpecDb } from '../../../../../db/specDb.js';

export const CATEGORY = 'mouse';

export async function createTempSpecDb() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'key-review-state-'));
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

export function ensureEnumSlot(specDb, fieldKey, value, {
  source = 'pipeline',
  enumPolicy = 'closed',
  needsReview = true,
  overridden = false,
} = {}) {
  specDb.upsertListValue({
    fieldKey,
    value,
    normalizedValue: String(value || '').trim().toLowerCase(),
    source,
    enumPolicy,
    acceptedCandidateId: null,
    needsReview,
    overridden,
    sourceTimestamp: null,
  });
  const row = specDb.getListValueByFieldAndValue(fieldKey, value);
  if (!row?.id) {
    throw new Error(`Failed to create enum slot for ${fieldKey}=${value}`);
  }
  return row;
}

export function ensureComponentIdentitySlot(specDb, componentType, canonicalName, maker = '') {
  specDb.upsertComponentIdentity({
    componentType,
    canonicalName,
    maker,
    links: [],
    source: 'pipeline',
  });
  const row = specDb.db.prepare(
    `SELECT id
     FROM component_identity
     WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?
     LIMIT 1`
  ).get(CATEGORY, componentType, canonicalName, maker);
  if (!row?.id) {
    throw new Error(`Failed to create component identity slot for ${componentType}/${canonicalName}/${maker}`);
  }
  return row.id;
}
