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
  return handleReviewItemOverrideMutationEndpoint({ parts, method, req, res, context });
}
