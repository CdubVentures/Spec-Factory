// WHY: Hash-gated reseed for field_key_order.json.
// On boot, compares SHA256 of JSON file against stored hash. If changed,
// wipes SQL field_key_order and re-imports from JSON. If same, skips.

import fsSync from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../../shared/contentHash.js';

export function reseedFieldKeyOrderFromJson({ specDb, helperRoot }) {
  if (!specDb || !helperRoot) return { reseeded: false };
  const category = specDb.category;
  if (!category) return { reseeded: false };

  const jsonPath = path.join(helperRoot, category, '_control_plane', 'field_key_order.json');

  let raw;
  try {
    raw = fsSync.readFileSync(jsonPath, 'utf8');
  } catch {
    return { reseeded: false };
  }

  const currentHash = sha256Hex(raw);
  const storedHash = specDb.getFileSeedHash('field_key_order');
  if (currentHash && currentHash === storedHash) return { reseeded: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${jsonPath}: ${err.message}`);
  }

  const order = Array.isArray(parsed?.order) ? parsed.order : [];

  specDb.deleteFieldKeyOrder(category);
  if (order.length > 0) {
    specDb.setFieldKeyOrder(category, JSON.stringify(order));
  }
  specDb.setFileSeedHash('field_key_order', currentHash);
  return { reseeded: true, count: order.length };
}
