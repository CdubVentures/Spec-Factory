import fs from 'node:fs';
import path from 'node:path';

/**
 * Delete a single candidate by source_id.
 * Self-isolated: SQL row → product.json candidates[]. Fields[] untouched.
 * Candidates never touch their source's artifacts or published state.
 *
 * WHY: Published state is managed by source deletion (operations 2/3),
 * not candidate deletion. Candidates are evidence tracking only.
 *
 * @returns {{ deleted: boolean, republished: boolean, artifacts_cleaned: boolean }}
 */
export function deleteCandidateBySourceId({ specDb, category, productId, fieldKey, sourceId, config, productRoot }) {
  const row = specDb.getFieldCandidateBySourceId(productId, fieldKey, sourceId);
  if (!row) {
    return { deleted: false, republished: false, artifacts_cleaned: false };
  }

  // Location 1: SQL
  specDb.deleteFieldCandidateBySourceId(productId, fieldKey, sourceId);

  // Location 2: product.json candidates only (NOT fields)
  const productJson = readProductJson(productRoot, productId);
  if (productJson) {
    if (Array.isArray(productJson.candidates?.[fieldKey])) {
      productJson.candidates[fieldKey] = productJson.candidates[fieldKey]
        .filter(e => e.source_id !== sourceId);
    }
    productJson.updated_at = new Date().toISOString();
    writeProductJson(productRoot, productId, productJson);
  }

  return { deleted: true, republished: false, artifacts_cleaned: false };
}

/**
 * Delete all candidates for a field.
 * Self-isolated: bulk SQL delete → clean product.json → no artifact cascade.
 *
 * @returns {{ deleted: number, artifacts_cleaned: boolean }}
 */
export function deleteAllCandidatesForField({ specDb, category, productId, fieldKey, config, productRoot }) {
  const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
  if (rows.length === 0) {
    return { deleted: 0, artifacts_cleaned: false };
  }

  const deletedCount = rows.length;

  // Location 1: SQL bulk delete
  specDb.deleteFieldCandidatesByProductAndField(productId, fieldKey);

  // Location 2: product.json candidates only (NOT fields)
  const productJson = readProductJson(productRoot, productId);
  if (productJson) {
    delete productJson.candidates?.[fieldKey];
    // WHY: Do NOT delete productJson.fields — published state is managed by
    // source deletion, not candidate deletion.
    productJson.updated_at = new Date().toISOString();
    writeProductJson(productRoot, productId, productJson);
  }

  return { deleted: deletedCount, artifacts_cleaned: false };
}

// ── Internal helpers ────────────────────────────────────────────────

function readProductJson(productRoot, productId) {
  try {
    const filePath = path.join(productRoot, productId, 'product.json');
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function writeProductJson(productRoot, productId, data) {
  const filePath = path.join(productRoot, productId, 'product.json');
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
