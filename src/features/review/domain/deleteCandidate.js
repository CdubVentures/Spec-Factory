import fs from 'node:fs';
import path from 'node:path';
import { isVariantBackedField } from '../../color-edition/index.js';
import { republishField } from '../../publisher/publish/republishField.js';

/**
 * Delete a single candidate by source_id.
 *
 * Two policies (see CEF rules):
 *  - Variant-backed fields (colors, editions): candidate stripped; published is
 *    untouched because the variants table is the SSOT for those fields.
 *  - All other fields: candidate stripped + republishField() re-derives the
 *    published value from remaining candidates (and unpublishes if none remain
 *    above threshold).
 *
 * Source artifacts (finder runs, discover log, disk files) are never touched
 * here — that is source/run deletion's job.
 *
 * @returns {{ deleted: boolean, republished: boolean, artifacts_cleaned: boolean }}
 */
export function deleteCandidateBySourceId({ specDb, category, productId, fieldKey, sourceId, config, productRoot }) {
  const row = specDb.getFieldCandidateBySourceId(productId, fieldKey, sourceId);
  if (!row) {
    return { deleted: false, republished: false, artifacts_cleaned: false };
  }

  const { productJson, result } = deleteSqlThenMirrorProductJson({
    productRoot,
    productId,
    deleteSql: () => specDb.deleteFieldCandidateBySourceId(productId, fieldKey, sourceId),
    mutateProductJson: (json) => {
      if (Array.isArray(json.candidates?.[fieldKey])) {
        json.candidates[fieldKey] = json.candidates[fieldKey]
          .filter(e => e.source_id !== sourceId);
      }

      return {
        republished: rederiveIfNonVariant({ specDb, productId, fieldKey, config, productJson: json }),
      };
    },
  });
  if (!productJson) {
    return { deleted: true, republished: false, artifacts_cleaned: false };
  }

  return { deleted: true, republished: Boolean(result?.republished), artifacts_cleaned: false };
}

/**
 * Delete all candidates for a field.
 *
 * Same two-policy split as deleteCandidateBySourceId. For non-variant fields,
 * republishField() will unpublish the field (there are no remaining candidates).
 *
 * @returns {{ deleted: number, republished: boolean, artifacts_cleaned: boolean }}
 */
export function deleteAllCandidatesForField({ specDb, category, productId, fieldKey, config, productRoot }) {
  const rows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
  if (rows.length === 0) {
    return { deleted: 0, republished: false, artifacts_cleaned: false };
  }

  const deletedCount = rows.length;

  const { productJson, result } = deleteSqlThenMirrorProductJson({
    productRoot,
    productId,
    deleteSql: () => specDb.deleteFieldCandidatesByProductAndField(productId, fieldKey),
    mutateProductJson: (json) => {
      delete json.candidates?.[fieldKey];
      return {
        republished: rederiveIfNonVariant({ specDb, productId, fieldKey, config, productJson: json }),
      };
    },
  });
  if (!productJson) {
    return { deleted: deletedCount, republished: false, artifacts_cleaned: false };
  }

  return { deleted: deletedCount, republished: Boolean(result?.republished), artifacts_cleaned: false };
}

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Re-derive published for non-variant fields. Variant fields (colors, editions)
 * are skipped because their published state lives on the variants table.
 */
function rederiveIfNonVariant({ specDb, productId, fieldKey, config, productJson }) {
  if (isVariantBackedField(fieldKey)) return false;
  const result = republishField({ specDb, productId, fieldKey, config: config || {}, productJson });
  return result.status === 'republished' || result.status === 'unpublished';
}

function deleteSqlThenMirrorProductJson({ productRoot, productId, deleteSql, mutateProductJson }) {
  deleteSql();

  const productJson = readProductJson(productRoot, productId);
  if (!productJson) {
    return { productJson: null, result: null };
  }

  const result = mutateProductJson(productJson);
  productJson.updated_at = new Date().toISOString();
  writeProductJson(productRoot, productId, productJson);

  return { productJson, result };
}

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
