import { createHash } from 'node:crypto';

import { z, toJSONSchema } from 'zod';
import { callLlmWithRouting } from '../../../core/llm/client/routing.js';
import {
  inferImageMimeFromUri,
  normalizeVisualAssetsFromEvidencePack
} from './batchEvidenceSelection.js';
import { sanitizeExtractionResult } from './sanitizeExtractionResult.js';

export const extractionModelResponseZodSchema = z.object({
  identityCandidates: z.object({
    brand: z.string().optional(),
    model: z.string().optional(),
    sku: z.string().optional(),
    mpn: z.string().optional(),
    gtin: z.string().optional(),
    variant: z.string().optional(),
  }),
  fieldCandidates: z.array(z.object({
    field: z.string(),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.any()), z.record(z.string(), z.any()), z.null()]),
    keyPath: z.string().optional(),
    evidenceRefs: z.array(z.string()),
    snippetId: z.string().optional(),
    snippetHash: z.string().optional(),
    quote: z.string().optional(),
    quoteSpan: z.array(z.number()).min(2).max(2).optional(),
    unknownReason: z.string().optional(),
    confidence: z.number().optional(),
  })),
  conflicts: z.array(z.object({
    field: z.string(),
    values: z.array(z.string()),
    evidenceRefs: z.array(z.string()),
  })),
  notes: z.array(z.string()),
});

function llmSchema() {
  const { $schema, ...schema } = toJSONSchema(extractionModelResponseZodSchema);
  return schema;
}

function buildFallbackImageId(fileUri = '') {
  return `img_fallback_${createHash('sha256').update(String(fileUri || '')).digest('hex').slice(0, 12)}`;
}

export function shouldSendPrimeSourceVisuals({
  routeMatrixPolicy = null
} = {}) {
  const primeSignalFromPolicy = (() => {
    const token = routeMatrixPolicy?.prime_sources_visual_send;
    if (typeof token === 'boolean') {
      return token;
    }
    const normalized = String(token ?? '').trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
    return null;
  })();
  const componentSend = String(routeMatrixPolicy?.component_values_send || '').trim().toLowerCase();
  const scalarSend = String(routeMatrixPolicy?.scalar_linked_send || '').trim().toLowerCase();
  const listSend = String(routeMatrixPolicy?.list_values_send || '').trim().toLowerCase();
  const derivedPrimeSignal =
    componentSend.includes('prime') ||
    scalarSend.includes('prime') ||
    listSend.includes('prime');
  const explicit = routeMatrixPolicy?.table_linked_send ?? routeMatrixPolicy?.prime_sources_visual_send ?? null;
  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== '') {
    if (typeof explicit === 'boolean') {
      if (explicit) {
        return true;
      }
      return Boolean(primeSignalFromPolicy || derivedPrimeSignal);
    }
    const token = String(explicit).trim().toLowerCase();
    if (token === 'true' || token === '1' || token === 'yes' || token === 'on') return true;
    if (token === 'false' || token === '0' || token === 'no' || token === 'off') return false;
    return token.includes('prime');
  }
  if (primeSignalFromPolicy !== null) {
    return Boolean(primeSignalFromPolicy);
  }
  return Boolean(derivedPrimeSignal);
}

export function buildMultimodalUserInput({
  userPayload = {},
  promptEvidence = {},
  scopedEvidencePack = {},
  routeMatrixPolicy = null,
  maxImages = 6
} = {}) {
  const text = JSON.stringify(userPayload);
  const allowImages = shouldSendPrimeSourceVisuals({ routeMatrixPolicy });
  const visuals = normalizeVisualAssetsFromEvidencePack(scopedEvidencePack);
  if (!allowImages) {
    return {
      text,
      images: []
    };
  }
  const rankedVisuals = visuals
    .map((row) => ({
      ...row,
      ref_match: (promptEvidence.references || []).some((ref) => String(ref?.file_uri || '').trim() === row.file_uri) ? 1 : 0
    }))
    .sort((a, b) => {
      if (b.ref_match !== a.ref_match) return b.ref_match - a.ref_match;
      const aSize = Number(a.size_bytes || 0);
      const bSize = Number(b.size_bytes || 0);
      return bSize - aSize;
    })
    .slice(0, Math.max(1, Number(maxImages || 6)));

  const images = rankedVisuals.map((row) => ({
    id: row.id || '',
    file_uri: row.file_uri,
    mime_type: row.mime_type || '',
    content_hash: row.content_hash || '',
    kind: row.kind || '',
    source_id: row.source_id || '',
    source_url: row.source_url || '',
    caption: [
      row.kind ? `kind=${row.kind}` : '',
      row.surface ? `surface=${row.surface}` : '',
      row.width && row.height ? `size=${row.width}x${row.height}` : ''
    ].filter(Boolean).join(' | ')
  }));
  if (images.length === 0) {
    const fallbackScreenshotUri = String(scopedEvidencePack?.meta?.visual_artifacts?.screenshot_uri || '').trim();
    if (fallbackScreenshotUri) {
      images.push({
        id: buildFallbackImageId(fallbackScreenshotUri),
        file_uri: fallbackScreenshotUri,
        mime_type: inferImageMimeFromUri(fallbackScreenshotUri),
        content_hash: String(scopedEvidencePack?.meta?.visual_artifacts?.screenshot_content_hash || '').trim(),
        kind: 'screenshot_capture',
        source_id: String(scopedEvidencePack?.meta?.source_id || '').trim(),
        source_url: String(scopedEvidencePack?.meta?.url || '').trim(),
        caption: 'kind=screenshot_capture | source=meta_fallback'
      });
    }
  }

  return {
    text,
    images
  };
}

export async function invokeExtractionModel({
  model,
  routeRole = 'extract',
  reasoningMode,
  reason,
  maxTokens = 0,
  usageTracker,
  userPayload,
  promptEvidence,
  fieldSet,
  validRefs,
  minEvidenceRefsByField = {},
  scopedEvidencePack,
  routeMatrixPolicy = null,
  config = {},
  logger = null,
  job = {},
  llmContext = {},
  evidencePack = {},
  callLlmFn = callLlmWithRouting,
  sanitizeExtractionResultFn = sanitizeExtractionResult
} = {}) {
  // WHY: Token cap and reasoning budget are now controlled by the phase override
  // system (Token Cap on the Extraction phase tab) and the global reasoning budget.
  // No extraction-specific overrides needed.
  const multimodalUserInput = buildMultimodalUserInput({
    userPayload,
    promptEvidence,
    scopedEvidencePack,
    routeMatrixPolicy,
    maxImages: Math.max(1, Number.parseInt(String(config.llmExtractMaxImagesPerBatch || 6), 10) || 6)
  });
  logger?.info?.('llm_extract_multimodal_profile', {
    productId: job.productId || '',
    reason,
    route_role: routeRole,
    route_policy_table_linked_send: routeMatrixPolicy?.table_linked_send ?? null,
    route_policy_prime_sources_visual_send: routeMatrixPolicy?.prime_sources_visual_send ?? null,
    route_policy_component_values_send: routeMatrixPolicy?.component_values_send ?? null,
    route_policy_scalar_linked_send: routeMatrixPolicy?.scalar_linked_send ?? null,
    route_policy_list_values_send: routeMatrixPolicy?.list_values_send ?? null,
    prompt_reference_count: Array.isArray(promptEvidence?.references) ? promptEvidence.references.length : 0,
    scoped_visual_asset_count: Array.isArray(scopedEvidencePack?.visual_assets) ? scopedEvidencePack.visual_assets.length : 0,
    multimodal_image_count: Array.isArray(multimodalUserInput?.images) ? multimodalUserInput.images.length : 0,
    multimodal_image_uris: Array.isArray(multimodalUserInput?.images)
      ? multimodalUserInput.images
        .map((row) => String(row?.file_uri || '').trim())
        .filter(Boolean)
        .slice(0, 8)
      : []
  });
  const result = await callLlmFn({
    config,
    reason,
    role: routeRole,
    modelOverride: model,
    system: [
      'You extract structured hardware spec candidates from evidence snippets.',
      'Rules:',
      '- Focus only on targetFields when provided.',
      '- Only use provided evidence.',
      '- Every proposed field candidate must include evidenceRefs matching provided reference ids.',
      '- If uncertain, omit the candidate.',
      '- Always return object keys: identityCandidates, fieldCandidates, conflicts, notes.',
      '- No prose; JSON only.'
    ].join('\n'),
    user: multimodalUserInput,
    jsonSchema: llmSchema(),
    usageContext: {
      category: job.category || '',
      productId: job.productId || '',
      runId: llmContext.runId || '',
      round: llmContext.round || 0,
      reason,
      host: scopedEvidencePack?.meta?.host || evidencePack?.meta?.host || '',
      url_count: Math.max(0, Number(scopedEvidencePack?.references?.length || 0)),
      evidence_chars: Math.max(0, Number(scopedEvidencePack?.meta?.total_chars || evidencePack?.meta?.total_chars || 0)),
      multimodal_image_count: Array.isArray(multimodalUserInput?.images) ? multimodalUserInput.images.length : 0,
      traceWriter: llmContext.traceWriter || null,
      trace_context: {
        purpose: 'extract_candidates',
        target_fields: [...fieldSet]
      }
    },
    costRates: llmContext.costRates || config,
    onUsage: async (usageRow) => {
      if (typeof llmContext.recordUsage === 'function') {
        await llmContext.recordUsage(usageRow);
      }
      if (usageTracker && typeof usageTracker === 'object') {
        usageTracker.prompt_tokens += Number(usageRow.prompt_tokens || 0);
        usageTracker.completion_tokens += Number(usageRow.completion_tokens || 0);
        usageTracker.cost_usd += Number(usageRow.cost_usd || 0);
      }
    },
    reasoningMode: Boolean(reasoningMode),
    reasoningBudget: Number(config.llmReasoningBudget || 4096),
    maxTokens: Number(maxTokens || 0),
    timeoutMs: config.llmTimeoutMs || config.openaiTimeoutMs,
    logger
  });

  return sanitizeExtractionResultFn({
    result,
    job,
    fieldSet,
    validRefs,
    evidencePack: scopedEvidencePack,
    minEvidenceRefsByField,
    insufficientEvidenceAction: routeMatrixPolicy?.insufficient_evidence_action || 'threshold_unmet'
  });
}
