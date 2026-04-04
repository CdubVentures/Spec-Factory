// WHY: Hash-gated rebuild for llm_route_matrix custom edits.
// Reads the durable JSON mirror from _control_plane/ and calls saveLlmRouteMatrix
// to replace whatever is in SQL. Only runs when file hash differs from stored hash.
// Empty rows = clear custom SQL and reset to defaults on next access.

import fsSync from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../../shared/contentHash.js';

export function rebuildLlmRouteMatrixFromJson({ specDb, helperRoot }) {
  if (!specDb || !helperRoot) return { reseeded: 0 };
  const category = specDb.category;
  if (!category) return { reseeded: 0 };
  const jsonPath = path.join(helperRoot, category, '_control_plane', 'llm_route_matrix.json');

  let raw;
  try {
    raw = fsSync.readFileSync(jsonPath, 'utf8');
  } catch {
    return { reseeded: 0 };
  }

  const currentHash = sha256Hex(raw);
  const storedHash = specDb.getFileSeedHash('llm_route_matrix');
  if (currentHash && currentHash === storedHash) return { reseeded: 0 };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reseeded: 0 };
  }

  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];

  if (rows.length === 0) {
    // WHY: Empty rows means "clear custom routes, reset to defaults."
    // saveLlmRouteMatrix([]) DELETEs all rows. The getter rehydrates defaults on next access.
    specDb.saveLlmRouteMatrix([]);
    specDb.setFileSeedHash('llm_route_matrix', currentHash);
    return { reseeded: 0, cleared: true };
  }

  specDb.saveLlmRouteMatrix(rows);
  specDb.setFileSeedHash('llm_route_matrix', currentHash);
  return { reseeded: rows.length };
}
