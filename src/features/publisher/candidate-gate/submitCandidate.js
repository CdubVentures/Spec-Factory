/**
 * Candidate Gate — single entry point for all field value submissions.
 *
 * Every source (CEF, pipeline, review override, CLI) calls this function.
 * Validates via validateField(), then dual-writes to:
 *   1. field_candidates table (SQL projection)
 *   2. product.json candidates[] (durable SSOT)
 *
 * Pure orchestration — no direct DB imports. specDb injected.
 */

import fs from 'node:fs';
import path from 'node:path';
import { validateField } from '../validation/validateField.js';
import { persistDiscoveredValue } from '../persistDiscoveredValues.js';
import { publishCandidate as autoPublish } from '../publish/publishCandidate.js';
import { buildSourceId } from './buildSourceId.js';
import { batchHeadCheck } from '../../../core/http/urlHeadCheck.js';

function safeReadJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function serializeValue(value) {
  if (value == null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * @param {{ category: string, productId: string, fieldKey: string, value: *, confidence: number, sourceMeta: object, fieldRules: object, knownValues: object|null, componentDb: object|null, specDb: object, productRoot: string, config?: object }} opts
 * @returns {{ status: 'accepted'|'rejected', candidateId: number|null, value: *, validationResult: object, publishResult?: object }}
 */
export async function submitCandidate({
  category, productId, fieldKey,
  value, confidence, sourceMeta,
  fieldRules, knownValues, componentDb, specDb, productRoot,
  repairHistory,
  metadata,
  appDb,
  config,
  variantId,
  verifyEvidenceUrls,
  evidenceCache,
  strictEvidence,
}) {
  // WHY: Normalize falsy variantId (undefined/null/'') to null so SQL stores NULL
  // and the JSON entry omits the key. Truthy strings are the FK anchor for
  // feature-source candidates; deletion cascade keys on this column.
  const normalizedVariantId = variantId || null;
  // --- Guard: identity ---
  if (!productId || !fieldKey) {
    return {
      status: 'rejected',
      candidateId: null,
      value,
      validationResult: { valid: false, value, confidence: 0, repairs: [], rejections: [{ reason_code: 'missing_identity', detail: { productId, fieldKey } }], unknownReason: null, repairPrompt: null },
    };
  }

  // --- Guard: field rule ---
  const fieldRule = fieldRules?.[fieldKey];
  if (!fieldRule) {
    return {
      status: 'rejected',
      candidateId: null,
      value,
      validationResult: { valid: false, value, confidence: 0, repairs: [], rejections: [{ reason_code: 'no_field_rule', detail: { fieldKey } }], unknownReason: null, repairPrompt: null },
    };
  }

  // --- Validate ---
  const perFieldKnown = knownValues?.[fieldKey] || null;
  const validationResult = validateField({ fieldKey, value, fieldRule, knownValues: perFieldKnown, componentDb, appDb });

  // WHY: open_prefer_known unknowns are soft rejections — the value is valid but not
  // in the known list. The candidate gate accepts these (that's the point of the policy).
  // Only hard rejections (shape, type, range, closed enum, etc.) block acceptance.
  const hardRejections = validationResult.rejections.filter(r => r.reason_code !== 'unknown_enum_prefer_known');
  if (hardRejections.length > 0) {
    return { status: 'rejected', candidateId: null, value: validationResult.value, validationResult };
  }

  // --- Build entries ---
  const repairedValue = validationResult.value;
  const repairedUnit = validationResult.unit || null;
  const serialized = serializeValue(repairedValue);
  const sourceEntry = { ...sourceMeta, confidence, submitted_at: new Date().toISOString() };
  // WHY: Filter out no-op repairs where before === after (template dispatch may log these)
  const actualRepairs = validationResult.repairs.filter(r => {
    if (Array.isArray(r.before) && Array.isArray(r.after)) {
      return JSON.stringify(r.before) !== JSON.stringify(r.after);
    }
    return r.before !== r.after;
  });
  const validationRecord = { valid: true, repairs: actualRepairs, rejections: validationResult.rejections };

  // WHY: If the source ran LLM repair before submitting, preserve the full repair context
  // so the publisher GUI can show prompt ID, decisions, and reasoning.
  if (repairHistory) {
    validationRecord.llmRepair = {
      promptId: repairHistory.promptId ?? null,
      status: repairHistory.status ?? null,
      decisions: repairHistory.decisions ?? null,
    };
  }

  // --- Source identity ---
  const sourceId = buildSourceId(sourceMeta, productId);
  const sourceType = String(sourceMeta.source || '').trim();
  const sourceModel = String(sourceMeta.model || '').trim();
  const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;

  // --- Evidence URL verification (HEAD-check gate) ---
  // WHY: LLMs can hallucinate plausible-looking URLs that 404 (e.g. Corsair CEF
  // run citing `/gaming-mice/` when the real path is `/gaming-mouse/<sku>`).
  // HEAD-check each ref deterministically. Network errors (http_status 0) are
  // treated as "unknown = accepted" so a flaky network doesn't nuke legitimate
  // sources — only actual 4xx/5xx counts as rejection.
  // Config knobs (flat, per settingsRegistry): evidenceVerificationEnabled,
  // evidenceVerificationTimeoutMs, evidenceVerificationStrict.
  const shouldVerify = verifyEvidenceUrls ?? (config?.evidenceVerificationEnabled !== false);
  const strictMode = strictEvidence ?? Boolean(config?.evidenceVerificationStrict);
  const timeoutMs = config?.evidenceVerificationTimeoutMs ?? 5000;

  if (hasMetadata && shouldVerify && Array.isArray(metadata.evidence_refs) && metadata.evidence_refs.length > 0) {
    const urls = metadata.evidence_refs.map(r => r?.url).filter(u => typeof u === 'string' && u.length > 0);
    const statusMap = await batchHeadCheck(urls, { timeoutMs, cache: evidenceCache });

    const stamped = [];
    let acceptedCount = 0;
    let rejectedCount = 0;
    for (const ref of metadata.evidence_refs) {
      const status = statusMap.get(ref?.url);
      const httpStatus = Number.isInteger(status?.http_status) ? status.http_status : null;
      const verifiedAt = status?.verified_at ?? null;
      // WHY: Only 404 (Not Found) and 410 (Gone) reliably mean "the page is dead."
      // 401/403/429/5xx/0 all indicate the server can't or won't confirm — anti-bot
      // blocks, auth gates, rate limits, transient outages, network errors. Those
      // get the benefit of the doubt (accepted as unknown) rather than penalized.
      // A human-visible page cited by the LLM shouldn't be rejected just because
      // Cloudflare / idealo / etc. fingerprinted our HEAD request as a bot.
      const isRejected = httpStatus === 404 || httpStatus === 410;
      const accepted = isRejected ? 0 : 1;
      if (accepted === 1) acceptedCount++; else rejectedCount++;
      stamped.push({ ...ref, http_status: httpStatus, verified_at: verifiedAt, accepted });
    }
    metadata.evidence_refs = stamped;

    if (strictMode && acceptedCount === 0 && rejectedCount > 0) {
      const rejectedUrls = stamped.filter(r => r.accepted === 0).map(r => r.url);
      return {
        status: 'rejected',
        candidateId: null,
        value: validationResult.value,
        validationResult: {
          ...validationRecord,
          valid: false,
          rejections: [...validationRecord.rejections, {
            reason_code: 'all_evidence_404',
            detail: { rejected_urls: rejectedUrls },
          }],
        },
      };
    }
  }

  // --- DB write (source-centric: one row per extraction, immutable) ---
  specDb.insertFieldCandidate({
    productId, fieldKey,
    sourceId,
    sourceType,
    value: serialized,
    unit: repairedUnit,
    confidence,
    model: sourceModel,
    validationJson: validationRecord,
    metadataJson: hasMetadata ? metadata : {},
    variantId: normalizedVariantId,
    submittedAt: sourceEntry.submitted_at,
  });

  // WHY: Same source_id can back two rows (variant-scoped + scalar, variant_id NULL)
  // via UNIQUE(source_id, variant_id_key). Lookup must include variant_id so the
  // evidence projection and autoPublish target the row we just inserted — not its
  // variant twin.
  const candidateRow = specDb.getFieldCandidateBySourceIdAndVariant(productId, fieldKey, sourceId, normalizedVariantId);
  const candidateId = candidateRow?.id ?? null;

  // --- Evidence projection (SQL read-side, JSON metadata stays SSOT) ---
  // WHY: metadata_json.evidence_refs is canonical. We project into
  // field_candidate_evidence so tier/confidence queries are indexed. Cascade
  // delete on the candidate row cleans this up automatically. Re-submissions
  // (same source_id) replace existing rows for the candidate.
  if (candidateId && hasMetadata && Array.isArray(metadata.evidence_refs) && metadata.evidence_refs.length > 0) {
    specDb.replaceFieldCandidateEvidence?.(candidateId, metadata.evidence_refs);
  }

  // --- Product.json write (source-centric: flat entries, no source merge) ---
  const productDir = path.join(productRoot, productId);
  const productPath = path.join(productDir, 'product.json');
  const productJson = safeReadJson(productPath);

  if (productJson) {
    if (!productJson.candidates) productJson.candidates = {};
    if (!Array.isArray(productJson.candidates[fieldKey])) productJson.candidates[fieldKey] = [];

    const entry = {
      value: repairedValue,
      source_id: sourceId,
      source_type: sourceType,
      confidence,
      model: sourceModel,
      unit: repairedUnit,
      validation: validationRecord,
      // WHY: Rebuild contract — submitted_at must survive DB-deleted reseed.
      // Without it, reseed falls back to datetime('now') and loses audit order.
      submitted_at: sourceEntry.submitted_at,
    };
    if (hasMetadata) entry.metadata = metadata;
    if (normalizedVariantId) entry.variant_id = normalizedVariantId;
    // WHY: Mirror SQL UNIQUE(source_id, variant_id_key) — same source_id with
    // a different variant_id is a distinct candidate, not a duplicate.
    const alreadyExists = productJson.candidates[fieldKey].some(e =>
      e.source_id === sourceId && (e.variant_id || null) === normalizedVariantId
    );
    if (!alreadyExists) {
      productJson.candidates[fieldKey].push(entry);
    }

    productJson.updated_at = new Date().toISOString();
    fs.writeFileSync(productPath, JSON.stringify(productJson, null, 2));
  }

  // --- Discovery enums ---
  if (fieldRule?.enum?.policy === 'open_prefer_known') {
    persistDiscoveredValue({ specDb, fieldKey, value: repairedValue, fieldRule });
  }

  // --- Auto-publish ---
  let publishResult = null;
  if (config) {
    publishResult = autoPublish({
      specDb, category, productId, fieldKey,
      candidateRow: candidateRow || { id: candidateId, variant_id: normalizedVariantId },
      value: repairedValue, unit: repairedUnit,
      confidence,
      config, fieldRule, productRoot,
      variantId: normalizedVariantId,
    });
  }

  return { status: 'accepted', candidateId, value: repairedValue, validationResult, publishResult };
}
