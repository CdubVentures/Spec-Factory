// WHY: Standalone rebuild function for llm_route_matrix custom edits.
// Reads the durable JSON mirror from _control_plane/ and calls saveLlmRouteMatrix
// to replace whatever is in SQL. If no JSON exists or rows are empty, returns
// quietly — ensureDefaultLlmRouteMatrix will generate defaults on first access.

import fsSync from 'node:fs';
import path from 'node:path';

export function rebuildLlmRouteMatrixFromJson({ specDb, helperRoot }) {
  if (!specDb || !helperRoot) return { reseeded: 0 };
  const category = specDb.category;
  if (!category) return { reseeded: 0 };
  const jsonPath = path.join(helperRoot, category, '_control_plane', 'llm_route_matrix.json');
  try {
    const raw = fsSync.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
    if (rows.length === 0) return { reseeded: 0 };
    specDb.saveLlmRouteMatrix(rows);
    return { reseeded: rows.length };
  } catch {
    return { reseeded: 0 };
  }
}
