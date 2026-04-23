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
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { clearScalarFinderVariant, deleteScalarFinderVariantRuns } from '../../../core/finder/scalarFinderVariantCleaner.js';

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
  if (parts[2] === 'clear-published') {
    return handleReviewItemClearPublishedEndpoint({ parts, method, req, res, context });
  }
  if (parts[2] === 'delete-variant-field') {
    return handleReviewItemDeleteVariantFieldEndpoint({ parts, method, req, res, context });
  }
  return handleReviewItemOverrideMutationEndpoint({ parts, method, req, res, context });
}
