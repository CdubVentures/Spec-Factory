/**
 * Clear a published field value — demote resolved candidates back to
 * 'candidate' and remove the JSON projection. NEVER deletes candidate rows;
 * the pool is preserved so the next extraction or user pick can re-resolve.
 *
 * Three scopes:
 *   scalar         — no variantId, no allVariants. Removes fields[fieldKey].
 *   variant-single — variantId set. Removes variant_fields[vid][fieldKey].
 *   variant-all    — allVariants=true. Removes every variant_fields[*][fieldKey].
 *
 * Caller owns product.json file I/O — this function mutates productJson in place
 * (matches the republishField.js pattern).
 *
 * Side effect on demoted rows: nulls out metadata_json.publish_result so the
 * Publisher GUI (PublisherPage.tsx) doesn't render a stale "published" badge
 * on a candidate that is no longer the resolved value.
 */

import { wipePublisherStateForUnpub } from './wipePublisherStateForUnpub.js';

export function clearPublishedField({
  specDb, productId, fieldKey, productJson,
  variantId, allVariants,
}) {
  if (variantId && allVariants) {
    throw new Error('clearPublishedField: variantId and allVariants are mutually exclusive');
  }

  let result;
  if (allVariants === true) {
    result = clearVariantAll({ specDb, productId, fieldKey, productJson });
  } else if (typeof variantId === 'string' && variantId.length > 0) {
    result = clearVariantSingle({ specDb, productId, fieldKey, productJson, variantId });
  } else {
    result = clearScalar({ specDb, productId, fieldKey, productJson });
  }

  // UnPub should roll back every publisher-observable signal on the now-
  // demoted row. demoteResolvedCandidates (called above) flips status but
  // leaves the row's confidence + evidence rows intact. This helper zeroes
  // confidence and deletes field_candidate_evidence so the panel stops
  // rendering the row as a "high-confidence resolved" candidate. The row
  // itself survives so the LLM-submitted value can be re-evaluated by a
  // future Run.
  if (result.status === 'cleared') {
    wipePublisherStateForUnpub({ specDb, productId, fieldKey, variantId, allVariants });
  }

  return result;
}

function clearScalar({ specDb, productId, fieldKey, productJson }) {
  const fields = productJson?.fields || null;
  if (!fields?.[fieldKey]) return { status: 'unchanged', scope: 'scalar' };
  delete fields[fieldKey];
  // WHY: variantId=null → demote only variant_id IS NULL rows (scalar scope).
  specDb.demoteResolvedCandidates(productId, fieldKey, null);
  clearPublishResultMetadata(specDb, productId, fieldKey, null);
  productJson.updated_at = new Date().toISOString();
  return { status: 'cleared', scope: 'scalar' };
}

function clearVariantSingle({ specDb, productId, fieldKey, productJson, variantId }) {
  const variantEntry = productJson?.variant_fields?.[variantId];
  if (!variantEntry?.[fieldKey]) return { status: 'unchanged', scope: 'variant-single' };
  delete variantEntry[fieldKey];
  if (Object.keys(variantEntry).length === 0) {
    delete productJson.variant_fields[variantId];
  }
  specDb.demoteResolvedCandidates(productId, fieldKey, variantId);
  clearPublishResultMetadata(specDb, productId, fieldKey, variantId);
  productJson.updated_at = new Date().toISOString();
  return { status: 'cleared', scope: 'variant-single' };
}

function clearVariantAll({ specDb, productId, fieldKey, productJson }) {
  const variantFields = productJson?.variant_fields || {};
  const touchedVariantIds = [];
  for (const [vid, entry] of Object.entries(variantFields)) {
    if (entry && Object.prototype.hasOwnProperty.call(entry, fieldKey)) {
      delete entry[fieldKey];
      touchedVariantIds.push(vid);
      if (Object.keys(entry).length === 0) {
        delete variantFields[vid];
      }
    }
  }
  // WHY: Also demote any DB rows whose variant_id wasn't mirrored in JSON
  // (defensive; SQL is the projection, JSON is SSOT, but they can drift).
  const allRows = specDb.getFieldCandidatesByProductAndField(productId, fieldKey);
  for (const row of allRows) {
    if (row.status === 'resolved' && row.variant_id && !touchedVariantIds.includes(row.variant_id)) {
      touchedVariantIds.push(row.variant_id);
    }
  }
  if (touchedVariantIds.length === 0) {
    return { status: 'unchanged', scope: 'variant-all' };
  }
  for (const vid of touchedVariantIds) {
    specDb.demoteResolvedCandidates(productId, fieldKey, vid);
    clearPublishResultMetadata(specDb, productId, fieldKey, vid);
  }
  productJson.updated_at = new Date().toISOString();
  return { status: 'cleared', scope: 'variant-all' };
}

// WHY: publish_result lives in metadata_json on the candidate row itself
// (persistPublishResult writes it there). After a demote, this marker is
// stale and the Publisher GUI would render "published" on a row that is
// now just a candidate. Null it out on every demoted row for this scope.
function clearPublishResultMetadata(specDb, productId, fieldKey, variantId) {
  const rows = specDb.getFieldCandidatesByProductAndField(
    productId,
    fieldKey,
    variantId === undefined ? undefined : variantId,
  );
  for (const row of rows) {
    const meta = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
    if (!('publish_result' in meta)) continue;
    const next = { ...meta, publish_result: null };
    specDb.upsertFieldCandidate?.({
      productId,
      fieldKey,
      value: row.value,
      unit: row.unit,
      confidence: row.confidence,
      sourceId: row.source_id || '',
      sourceType: row.source_type || '',
      model: row.model || '',
      validationJson: row.validation_json,
      metadataJson: next,
      status: 'candidate',
      variantId: row.variant_id ?? null,
    });
  }
}
