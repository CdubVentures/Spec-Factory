import {
  jsonResIfError,
  sendDataChangeResponse,
} from './routeSharedHelpers.js';

import {
  resolveItemFieldMutationRequest,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
} from '../services/itemMutationService.js';
import { submitCandidate } from '../../publisher/candidate-gate/submitCandidate.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

// Re-export for characterization tests and any external consumers
export {
  resolveItemFieldMutationRequest,
  buildManualOverrideEvidence,
  resolveItemOverrideMode,
};

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
  const { candidateId, value, reason, reviewer } = body;
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
    const normalizedCandidateId = String(candidateId || '').trim();

    // Candidate override — user picked a candidate from the drawer.
    if (mode === 'override' && normalizedCandidateId) {
      const candidateValue = value ?? body?.candidateValue ?? body?.candidate_value ?? null;
      const confidence = body?.candidateConfidence ?? body?.candidate_confidence ?? 1.0;
      const sourceToken = body?.candidateSource ?? body?.candidate_source ?? 'candidate_override';

      // Flow through submitCandidate — validates, dual-writes, auto-publishes.
      const result = await submitCandidate({
        category,
        productId,
        fieldKey: field,
        value: candidateValue,
        confidence,
        sourceMeta: { source: sourceToken, method: body?.candidateMethod ?? 'candidate_override', reviewer: reviewer || null },
        fieldRules: specDb?.getCompiledRules?.()?.fields || {},
        knownValues: null,
        componentDb: null,
        specDb,
        productRoot: defaultProductRoot(),
        metadata: { source: 'candidate_override', evidence: body?.candidateEvidence ?? null },
        config: { publishConfidenceThreshold: 0 },
      });

      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'review-override',
        category,
        broadcastExtra: { productId, field },
        payload: { result },
      });
    }

    // Manual override — user typed a value.
    if (value === undefined || String(value).trim() === '') {
      jsonRes(res, 400, { error: 'invalid_override_request', message: 'Provide candidateId or value.' });
      return true;
    }

    const manualEvidence = buildManualOverrideEvidence({ mode, value, body });

    // Flow through submitCandidate with confidence 1.0 so it auto-publishes.
    const result = await submitCandidate({
      category,
      productId,
      fieldKey: field,
      value,
      confidence: 1.0,
      sourceMeta: { source: 'manual_override', method: 'manual_override', reviewer: reviewer || null },
      fieldRules: specDb?.getCompiledRules?.()?.fields || {},
      knownValues: null,
      componentDb: null,
      specDb,
      productRoot: defaultProductRoot(),
      metadata: { source: 'manual_override', reviewer: reviewer || null, reason: reason || null, evidence: manualEvidence },
      config: { publishConfidenceThreshold: 0 },
    });

    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'review-manual-override',
      category,
      broadcastExtra: { productId, field },
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
  return handleReviewItemOverrideMutationEndpoint({ parts, method, req, res, context });
}
