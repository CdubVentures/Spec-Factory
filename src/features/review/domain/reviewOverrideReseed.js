import {
  readConsolidatedOverrides,
} from '../../../shared/consolidatedOverrides.js';
import {
  buildCandidateOverrideSourceId,
  extractOverrideProvenance,
  extractOverrideValue,
  manualCandidateId,
  normalizeField,
} from './overrideHelpers.js';
import { isObject, toNumber } from './reviewNormalization.js';

function reviewMetadata(productEntry = {}) {
  const metadata = {};
  for (const key of ['review_status', 'reviewed_by', 'reviewed_at', 'review_time_seconds', 'runtime_gate']) {
    if (productEntry[key] !== undefined) {
      metadata[key] = productEntry[key];
    }
  }
  return metadata;
}

function candidateIdForManualOverride({ category, productId, field, value, override }) {
  const explicit = String(override?.candidate_id || '').trim();
  if (explicit) {
    return explicit;
  }
  return manualCandidateId({
    category,
    productId,
    field,
    value,
    evidence: extractOverrideProvenance(override, category, productId, field),
  });
}

function insertRuntimeOverride({ specDb, productId, field, sourceId, sourceType, value, confidence, metadataJson }) {
  specDb.demoteResolvedCandidates(productId, field, null);
  specDb.deleteFieldCandidateBySourceId?.(productId, field, sourceId);
  specDb.insertFieldCandidate({
    productId,
    fieldKey: field,
    sourceId,
    sourceType,
    value,
    unit: null,
    confidence,
    model: '',
    validationJson: { valid: true, repairs: [], rejections: [] },
    metadataJson,
    status: 'resolved',
    variantId: null,
  });
}

function reseedManualOverride({ specDb, category, productId, productEntry, field, override }) {
  const value = extractOverrideValue(override);
  if (!value) {
    return false;
  }
  const evidence = extractOverrideProvenance(override, category, productId, field);
  const sourceId = candidateIdForManualOverride({ category, productId, field, value, override });
  insertRuntimeOverride({
    specDb,
    productId,
    field,
    sourceId,
    sourceType: 'manual_override',
    value,
    confidence: 1,
    metadataJson: {
      source: 'manual_override',
      reviewer: String(override?.overridden_by || '').trim() || null,
      reason: String(override?.override_reason || '').trim() || null,
      evidence,
      ...reviewMetadata(productEntry),
    },
  });
  return true;
}

function reseedCandidateOverride({ specDb, category, productId, productEntry, field, override }) {
  const value = extractOverrideValue(override);
  const candidateId = String(override?.candidate_id || '').trim();
  if (!value || !candidateId) {
    return false;
  }
  const sourceId = buildCandidateOverrideSourceId({ productId, field, candidateId });
  const confidence = toNumber(override?.confidence, NaN);
  insertRuntimeOverride({
    specDb,
    productId,
    field,
    sourceId,
    sourceType: 'candidate_override',
    value,
    confidence: Number.isFinite(confidence) ? confidence : 1,
    metadataJson: {
      source: 'candidate_override',
      override_source: 'candidate_selection',
      candidate_id: candidateId,
      reviewer: String(override?.overridden_by || '').trim() || null,
      reason: String(override?.override_reason || '').trim() || null,
      evidence: extractOverrideProvenance(override, category, productId, field),
      ...reviewMetadata(productEntry),
    },
  });
  return true;
}

function reseedOverride({ specDb, category, productId, productEntry, fieldKey, override }) {
  if (!isObject(override)) {
    return false;
  }
  const field = normalizeField(override.field || fieldKey);
  if (!field) {
    return false;
  }
  const source = String(override.override_source || '').trim();
  if (source === 'manual_entry') {
    return reseedManualOverride({ specDb, category, productId, productEntry, field, override });
  }
  if (source === 'candidate_selection') {
    return reseedCandidateOverride({ specDb, category, productId, productEntry, field, override });
  }
  return false;
}

/**
 * Rebuild resolved review override rows from consolidated JSON.
 *
 * SQL is the runtime authority. The consolidated override JSON is the durable
 * audit/rebuild mirror used to recover the SQL projection after DB deletion.
 *
 * @param {{ specDb: object, helperRoot?: string }} opts
 * @returns {Promise<{ found: number, seeded: number, skipped: number, overrides_seeded: number }>}
 */
export async function rebuildReviewOverridesFromJson({ specDb, helperRoot = 'category_authority' }) {
  const category = String(specDb?.category || '').trim();
  const stats = { found: 0, seeded: 0, skipped: 0, overrides_seeded: 0 };
  if (!category || typeof specDb?.insertFieldCandidate !== 'function' || typeof specDb?.demoteResolvedCandidates !== 'function') {
    return stats;
  }

  const envelope = await readConsolidatedOverrides({
    config: { categoryAuthorityRoot: helperRoot },
    category,
  });
  for (const [productId, productEntry] of Object.entries(envelope.products || {})) {
    stats.found++;
    if (!isObject(productEntry) || (productEntry.category && productEntry.category !== category)) {
      stats.skipped++;
      continue;
    }
    const overrides = isObject(productEntry.overrides) ? productEntry.overrides : {};
    let productSeeded = 0;
    for (const [fieldKey, override] of Object.entries(overrides)) {
      if (reseedOverride({ specDb, category, productId, productEntry, fieldKey, override })) {
        productSeeded++;
      }
    }
    if (productSeeded > 0) {
      stats.seeded++;
      stats.overrides_seeded += productSeeded;
      continue;
    }
    stats.skipped++;
  }
  return stats;
}
