import fs from 'node:fs';
import path from 'node:path';

import {
  jsonResIfError,
  sendDataChangeResponse,
} from './routeSharedHelpers.js';

import {
  resolveItemFieldMutationRequest,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
  validateOverrideVariantContract,
  normalizeOverrideValue,
  validateClearPublishedScope,
} from '../services/itemMutationService.js';
import { submitCandidate } from '../../publisher/candidate-gate/submitCandidate.js';
import { clearPublishedField } from '../../publisher/publish/clearPublishedField.js';
import { writeManualOverride } from '../../publisher/publish/writeManualOverride.js';
import { wipePublisherStateForUnpub } from '../../publisher/publish/wipePublisherStateForUnpub.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { clearScalarFinderVariant, deleteScalarFinderVariantRuns } from '../../../core/finder/scalarFinderVariantCleaner.js';
import { isReservedFieldKey } from '../../../core/finder/finderExclusions.js';
import * as keyFinderRegistry from '../../../core/operations/keyFinderRegistry.js';
import {
  unselectKeyFinderField,
  scrubFieldFromKeyFinder,
} from '../../key/index.js';
import { deleteAllCandidatesForField as deleteReviewCandidatesForField } from '../domain/deleteCandidate.js';

// Re-export for characterization tests and any external consumers
export {
  resolveItemFieldMutationRequest,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
};

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function productJsonPath(productRoot, productId) {
  return path.join(productRoot, productId, 'product.json');
}

function listActiveProductIds(specDb) {
  const rows = typeof specDb?.getAllProducts === 'function'
    ? specDb.getAllProducts('active') || []
    : [];
  return rows
    .map((row) => String(row?.product_id || '').trim())
    .filter(Boolean);
}

function isVariantOwnedField(specDb, fieldKey) {
  const fieldRule = specDb?.getCompiledRules?.()?.fields?.[fieldKey];
  return isVariantOwnedFieldRule(fieldKey, fieldRule);
}

function isVariantOwnedFieldRule(fieldKey, fieldRule) {
  if (isReservedFieldKey(fieldKey)) return true;
  return fieldRule?.variant_dependent === true;
}

function findBusyFieldRowProducts(productIds, fieldKey) {
  return productIds.filter((productId) => keyFinderRegistry.count(productId, fieldKey).total > 0);
}

function listNonVariantFieldKeys(specDb) {
  const fields = specDb?.getCompiledRules?.()?.fields || {};
  return Object.entries(fields)
    .filter(([fieldKey, fieldRule]) => !isVariantOwnedFieldRule(fieldKey, fieldRule))
    .map(([fieldKey]) => fieldKey);
}

function findBusyProductFieldKeys(productId, fieldKeys) {
  return fieldKeys.filter((fieldKey) => keyFinderRegistry.count(productId, fieldKey).total > 0);
}

function clearProductFieldJson({ productRoot, productId, fieldKey }) {
  const filePath = productJsonPath(productRoot, productId);
  const productJson = safeReadJson(filePath);
  if (!productJson) return { changed: false };
  let changed = false;
  if (productJson.fields?.[fieldKey]) {
    delete productJson.fields[fieldKey];
    changed = true;
  }
  if (productJson.candidates?.[fieldKey]) {
    delete productJson.candidates[fieldKey];
    changed = true;
  }
  if (!changed) return { changed: false };
  productJson.updated_at = new Date().toISOString();
  writeJson(filePath, productJson);
  return { changed: true };
}

function unpublishFieldRowProduct({ specDb, productRoot, productId, fieldKey }) {
  const filePath = productJsonPath(productRoot, productId);
  const productJson = safeReadJson(filePath);
  let clearResult = { status: 'unchanged', scope: 'scalar' };

  if (productJson) {
    clearResult = clearPublishedField({
      specDb,
      productId,
      fieldKey,
      productJson,
    });
    if (clearResult.status === 'cleared') {
      writeJson(filePath, productJson);
    }
  }

  if (clearResult.status !== 'cleared') {
    if (typeof specDb.demoteResolvedCandidates === 'function') {
      specDb.demoteResolvedCandidates(productId, fieldKey);
    }
    wipePublisherStateForUnpub({ specDb, productId, fieldKey });
  }

  const selected = unselectKeyFinderField({ productId, productRoot, fieldKey });
  return {
    productId,
    published_status: clearResult.status,
    key_selected_cleared: selected.cleared === true,
  };
}

function deleteFieldRowProduct({ specDb, category, config, productRoot, productId, fieldKey }) {
  const unpublishResult = unpublishFieldRowProduct({ specDb, productRoot, productId, fieldKey });
  const candidateResult = deleteReviewCandidatesForField({
    specDb,
    category,
    productId,
    fieldKey,
    config,
    productRoot,
  });
  clearProductFieldJson({ productRoot, productId, fieldKey });

  const { deletedRuns } = scrubFieldFromKeyFinder({ productId, productRoot, fieldKey });
  if (deletedRuns.length > 0 && typeof specDb.deleteFinderRun === 'function') {
    for (const runNumber of deletedRuns) {
      specDb.deleteFinderRun('keyFinder', productId, runNumber);
    }
  }

  return {
    productId,
    published_status: unpublishResult.published_status,
    deleted_candidates: candidateResult.deleted,
    deleted_runs: deletedRuns,
  };
}

async function handleReviewFieldRowActionEndpoint({
  parts,
  method,
  res,
  context,
}) {
  const isUnpublish = method === 'POST' && parts[2] === 'field-row' && parts[3] && parts[4] === 'unpublish-all';
  const isDelete = method === 'DELETE' && parts[2] === 'field-row' && parts[3] && !parts[4];
  if (!isUnpublish && !isDelete) return false;

  const {
    jsonRes,
    getSpecDb,
    broadcastWs,
    productRoot,
    config,
  } = context || {};
  const category = parts[1];
  const fieldKey = String(parts[3] || '').trim();
  const specDb = getSpecDb(category);
  if (!specDb) {
    jsonRes(res, 404, { error: 'no_spec_db', message: `No SpecDb for ${category}` });
    return true;
  }
  if (isVariantOwnedField(specDb, fieldKey)) {
    jsonRes(res, 400, {
      error: 'variant_field_row_action_not_allowed',
      message: `${fieldKey} is variant-owned and cannot be reset from the scalar Review row action.`,
    });
    return true;
  }

  const productIds = listActiveProductIds(specDb);
  const busyProductIds = findBusyFieldRowProducts(productIds, fieldKey);
  if (busyProductIds.length > 0) {
    jsonRes(res, 409, {
      error: 'key_busy',
      field_key: fieldKey,
      busy_product_ids: busyProductIds,
      message: 'Run or Loop is in flight for this key on at least one product. Wait for it to finish or stop it first.',
    });
    return true;
  }

  const root = productRoot || defaultProductRoot();
  const results = productIds.map((productId) => (
    isUnpublish
      ? unpublishFieldRowProduct({ specDb, productRoot: root, productId, fieldKey })
      : deleteFieldRowProduct({ specDb, category, config, productRoot: root, productId, fieldKey })
  ));
  const deletedRunsByProduct = Object.fromEntries(
    results.map((result) => [result.productId, result.deleted_runs || []]),
  );
  const eventType = isUnpublish ? 'key-finder-unpublished' : 'key-finder-field-deleted';

  return sendDataChangeResponse({
    jsonRes,
    res,
    broadcastWs,
    eventType,
    category,
    entities: { productIds, fieldKeys: [fieldKey] },
    broadcastExtra: {
      scope: 'review-field-row',
      field: fieldKey,
      fieldKey,
      field_key: fieldKey,
      product_count: productIds.length,
      ...(isDelete ? { deleted_runs_by_product: deletedRunsByProduct } : {}),
    },
    payload: {
      status: isUnpublish ? 'unpublished' : 'deleted',
      field: fieldKey,
      product_count: productIds.length,
      results,
      ...(isDelete ? { deleted_runs_by_product: deletedRunsByProduct } : {}),
    },
  });
}

async function handleReviewProductNonVariantActionEndpoint({
  parts,
  method,
  res,
  context,
}) {
  const isUnpublish = method === 'POST'
    && parts[2] === 'product'
    && parts[3]
    && parts[4] === 'non-variant-keys'
    && parts[5] === 'unpublish-all';
  const isDelete = method === 'DELETE'
    && parts[2] === 'product'
    && parts[3]
    && parts[4] === 'non-variant-keys'
    && !parts[5];
  if (!isUnpublish && !isDelete) return false;

  const {
    jsonRes,
    getSpecDb,
    broadcastWs,
    productRoot,
    config,
  } = context || {};
  const category = parts[1];
  const productId = String(parts[3] || '').trim();
  const specDb = getSpecDb(category);
  if (!specDb) {
    jsonRes(res, 404, { error: 'no_spec_db', message: `No SpecDb for ${category}` });
    return true;
  }

  const activeProductIds = listActiveProductIds(specDb);
  if (!activeProductIds.includes(productId)) {
    jsonRes(res, 404, {
      error: 'product_not_found',
      product_id: productId,
      message: `No active Review product found for ${productId}.`,
    });
    return true;
  }

  const fieldKeys = listNonVariantFieldKeys(specDb);
  const busyFieldKeys = findBusyProductFieldKeys(productId, fieldKeys);
  if (busyFieldKeys.length > 0) {
    jsonRes(res, 409, {
      error: 'key_busy',
      product_id: productId,
      busy_field_keys: busyFieldKeys,
      message: 'Run or Loop is in flight for at least one non-variant key on this product. Wait for it to finish or stop it first.',
    });
    return true;
  }

  const root = productRoot || defaultProductRoot();
  const results = fieldKeys.map((fieldKey) => ({
    fieldKey,
    ...(isUnpublish
      ? unpublishFieldRowProduct({ specDb, productRoot: root, productId, fieldKey })
      : deleteFieldRowProduct({ specDb, category, config, productRoot: root, productId, fieldKey })),
  }));
  const deletedRunsByField = Object.fromEntries(
    results.map((result) => [result.fieldKey, result.deleted_runs || []]),
  );
  const eventType = isUnpublish ? 'key-finder-unpublished' : 'key-finder-field-deleted';

  return sendDataChangeResponse({
    jsonRes,
    res,
    broadcastWs,
    eventType,
    category,
    entities: { productIds: [productId], fieldKeys },
    broadcastExtra: {
      scope: 'review-product-non-variant-keys',
      productId,
      product_id: productId,
      field_count: fieldKeys.length,
      ...(isDelete ? { deleted_runs_by_field: deletedRunsByField } : {}),
    },
    payload: {
      status: isUnpublish ? 'unpublished' : 'deleted',
      product_id: productId,
      field_count: fieldKeys.length,
      field_keys: fieldKeys,
      results,
      ...(isDelete ? { deleted_runs_by_field: deletedRunsByField } : {}),
    },
  });
}

async function handleReviewItemOverrideMutationEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDb,
    resolveGridFieldStateForMutation,
    broadcastWs,
  } = context || {};
  const category = parts[1];
  const mode = resolveItemOverrideMode(parts, method);
  if (!mode) return false;

  const body = await readJsonBody(req);
  const { candidateId, value, reason, reviewer, variantId } = body;
  if (mode === 'manual-override' && (value === undefined || String(value).trim() === '')) {
    jsonRes(res, 400, { error: 'value_required', message: 'manual-override requires value' });
    return true;
  }
  const fieldRequest = resolveItemFieldMutationRequest({
    getSpecDb,
    resolveGridFieldStateForMutation,
    category,
    body,
    missingSlotMessage: 'productId and field are required for override.',
  });
  if (jsonResIfError({ jsonRes, res, error: fieldRequest.error })) return true;
  const { specDb, productId, field } = fieldRequest;

  try {
    const variantContract = validateOverrideVariantContract({ fieldKey: field, variantId, specDb });
    if (jsonResIfError({ jsonRes, res, error: variantContract.error })) return true;

    const normalizedVariantId = typeof variantId === 'string' && variantId.length > 0 ? variantId : null;
    const compiledFieldRules = specDb?.getCompiledRules?.()?.fields || {};
    const fieldRule = compiledFieldRules[field] || null;

    const normalizedCandidateId = String(candidateId || '').trim();

    // Candidate override — user picked a candidate from the drawer.
    if (mode === 'override' && normalizedCandidateId) {
      const candidateValue = value ?? body?.candidateValue ?? body?.candidate_value ?? null;
      const confidence = body?.candidateConfidence ?? body?.candidate_confidence ?? 1.0;
      const sourceToken = body?.candidateSource ?? body?.candidate_source ?? 'candidate_override';

      const result = await submitCandidate({
        category,
        productId,
        fieldKey: field,
        value: normalizeOverrideValue({ value: candidateValue, fieldRule }),
        confidence,
        sourceMeta: { source: sourceToken, method: body?.candidateMethod ?? 'candidate_override', reviewer: reviewer || null },
        fieldRules: compiledFieldRules,
        knownValues: null,
        componentDb: null,
        specDb,
        productRoot: defaultProductRoot(),
        metadata: { source: 'candidate_override', evidence: body?.candidateEvidence ?? null },
        config: { publishConfidenceThreshold: 0 },
        variantId: normalizedVariantId,
      });

      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'review-override',
        category,
        broadcastExtra: { productId, field, variantId: normalizedVariantId },
        payload: { result },
      });
    }

    // Manual override — user typed a value.
    if (value === undefined || String(value).trim() === '') {
      jsonRes(res, 400, { error: 'invalid_override_request', message: 'Provide candidateId or value.' });
      return true;
    }

    // WHY: Manual overrides are user input, NOT extraction output. Write directly
    // to product.json (published surface) and skip field_candidates entirely.
    // Candidates/evidence remain reserved for pipeline/LLM runs.
    const result = writeManualOverride({
      productRoot: defaultProductRoot(),
      productId,
      fieldKey: field,
      value: normalizeOverrideValue({ value, fieldRule }),
      variantId: normalizedVariantId,
      reviewer: reviewer || null,
      reason: reason || null,
    });

    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'review-manual-override',
      category,
      broadcastExtra: { productId, field, variantId: normalizedVariantId },
      payload: { result },
    });
  } catch (err) {
    jsonRes(res, 500, {
      error: mode === 'manual-override' ? 'manual_override_failed' : 'override_failed',
      message: err.message,
    });
    return true;
  }
}

async function handleReviewItemClearPublishedEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDb,
    resolveGridFieldStateForMutation,
    broadcastWs,
    productRoot,
  } = context || {};
  if (method !== 'POST' || parts[2] !== 'clear-published') return false;
  const category = parts[1];
  if (!category) return false;

  const body = await readJsonBody(req);
  const { variantId, allVariants } = body;

  const fieldRequest = resolveItemFieldMutationRequest({
    getSpecDb,
    resolveGridFieldStateForMutation,
    category,
    body,
    missingSlotMessage: 'productId and field are required for clear-published.',
  });
  if (jsonResIfError({ jsonRes, res, error: fieldRequest.error })) return true;
  const { specDb, productId, field } = fieldRequest;

  try {
    const scope = validateClearPublishedScope({ fieldKey: field, variantId, allVariants, specDb });
    if (jsonResIfError({ jsonRes, res, error: scope.error })) return true;

    const normalizedVariantId = typeof variantId === 'string' && variantId.length > 0 ? variantId : null;
    const normalizedAllVariants = allVariants === true;

    const root = productRoot || defaultProductRoot();
    const productPath = path.join(root, productId, 'product.json');
    const productJson = safeReadJson(productPath);

    let result = { status: 'unchanged', scope: 'scalar' };
    if (productJson) {
      result = clearPublishedField({
        specDb, productId, fieldKey: field, productJson,
        variantId: normalizedVariantId,
        allVariants: normalizedAllVariants,
      });
      if (result.status === 'cleared') {
        fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
      }
    }

    // Scalar finders (RDF / SKU) persist per-variant entries in their own
    // JSON + SQL summary — clean those too so the finder panel reflects the
    // unpublish. Safe no-op for non-scalar fields. variant-single scope only.
    if (normalizedVariantId) {
      clearScalarFinderVariant({
        specDb, productId, productRoot: root,
        fieldKey: field, variantId: normalizedVariantId,
      });
    }

    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'review-clear-published',
      category,
      broadcastExtra: {
        productId,
        field,
        variantId: normalizedVariantId,
        allVariants: normalizedAllVariants || undefined,
      },
      payload: { result },
    });
  } catch (err) {
    jsonRes(res, 500, { error: 'clear_published_failed', message: err.message });
    return true;
  }
}

// ── POST /review/:category/delete-variant-field ─────────────────────
// Per-variant full wipe for one field. Deletes every field_candidates row
// for (product, field, variant) — evidence cascades via FK — and clears
// variant_fields[variantId][fieldKey] from product.json. Used by the
// per-variant "Del" button in the RDF / SKU panels.
//
// Unlike the keyFinder /keys/:fk DELETE, runs are NOT touched: scalar-finder
// runs produce per-variant candidates in one pass, so removing one variant's
// share leaves siblings (and the run record) intact. Zero risk of cross-
// variant data loss.
async function handleReviewItemDeleteVariantFieldEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDb,
    resolveGridFieldStateForMutation,
    broadcastWs,
    productRoot,
  } = context || {};
  if (method !== 'POST' || parts[2] !== 'delete-variant-field') return false;
  const category = parts[1];
  if (!category) return false;

  const body = await readJsonBody(req);
  const { variantId } = body || {};
  if (typeof variantId !== 'string' || variantId.length === 0) {
    jsonRes(res, 400, { error: 'invalid_variant_id', message: 'variantId is required for delete-variant-field.' });
    return true;
  }

  const fieldRequest = resolveItemFieldMutationRequest({
    getSpecDb,
    resolveGridFieldStateForMutation,
    category,
    body,
    missingSlotMessage: 'productId and field are required for delete-variant-field.',
  });
  if (jsonResIfError({ jsonRes, res, error: fieldRequest.error })) return true;
  const { specDb, productId, field } = fieldRequest;

  try {
    // DB: demote (safety, covers the resolved row) then delete. Evidence
    // rows cascade via the field_candidate_evidence FK.
    if (typeof specDb.demoteResolvedCandidates === 'function') {
      specDb.demoteResolvedCandidates(productId, field, variantId);
    }
    if (typeof specDb.deleteFieldCandidatesByProductFieldVariant === 'function') {
      specDb.deleteFieldCandidatesByProductFieldVariant(productId, field, variantId);
    }

    // JSON: drop the variant_fields[vid][fk] entry. Also prune the variant
    // map entry entirely when it becomes empty (matches clearVariantSingle
    // behavior in clearPublishedField.js).
    const root = productRoot || defaultProductRoot();
    const productPath = path.join(root, productId, 'product.json');
    const productJson = safeReadJson(productPath);
    let jsonChanged = false;
    if (productJson?.variant_fields?.[variantId]
        && Object.prototype.hasOwnProperty.call(productJson.variant_fields[variantId], field)) {
      delete productJson.variant_fields[variantId][field];
      if (Object.keys(productJson.variant_fields[variantId]).length === 0) {
        delete productJson.variant_fields[variantId];
      }
      productJson.updated_at = new Date().toISOString();
      fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
      jsonChanged = true;
    }

    // Scalar finder store + SQL summary mirror — Del is a full per-variant
    // wipe, so also delete every run whose response.variant_id matches.
    // Without this the Hist (Nqu)(Nurl) counts stay populated from the run-
    // level discovery_log and the panel still shows stale candidates.
    const finderCleanup = deleteScalarFinderVariantRuns({
      specDb, productId, productRoot: root,
      fieldKey: field, variantId,
    });

    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'review-variant-field-deleted',
      category,
      broadcastExtra: { productId, field, variantId },
      payload: {
        status: 'deleted', field, variantId,
        json_changed: jsonChanged,
        finder_cleaned: finderCleanup.cleaned,
        finder_deleted_runs: finderCleanup.deletedRuns || [],
      },
    });
  } catch (err) {
    jsonRes(res, 500, { error: 'delete_variant_field_failed', message: err.message });
    return true;
  }
}

export async function handleReviewItemMutationRoute({
  parts,
  method,
  req,
  res,
  context,
}) {
  if (!Array.isArray(parts) || parts[0] !== 'review' || !parts[1]) {
    return false;
  }
  if (parts[2] === 'field-row') {
    return handleReviewFieldRowActionEndpoint({ parts, method, req, res, context });
  }
  if (parts[2] === 'product') {
    return handleReviewProductNonVariantActionEndpoint({ parts, method, req, res, context });
  }
  if (parts[2] === 'clear-published') {
    return handleReviewItemClearPublishedEndpoint({ parts, method, req, res, context });
  }
  if (parts[2] === 'delete-variant-field') {
    return handleReviewItemDeleteVariantFieldEndpoint({ parts, method, req, res, context });
  }
  return handleReviewItemOverrideMutationEndpoint({ parts, method, req, res, context });
}
