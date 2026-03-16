function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UNKNOWN_LIKE_TOKENS = new Set(['', 'unk', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

function isMeaningfulValue(value) {
  return !UNKNOWN_LIKE_TOKENS.has(normalizeLower(value));
}

function parseReviewItemAttributes(reviewItem) {
  const raw = reviewItem?.product_attributes;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function extractComparableValueTokens(rawValue) {
  if (Array.isArray(rawValue)) {
    const nested = [];
    for (const entry of rawValue) {
      nested.push(...extractComparableValueTokens(entry));
    }
    return [...new Set(nested)];
  }
  const text = String(rawValue ?? '').trim();
  if (!text) return [];
  const parts = text.includes(',')
    ? text.split(',').map((part) => String(part ?? '').trim()).filter(Boolean)
    : [text];
  return [...new Set(parts.map((part) => normalizeLower(part)).filter(Boolean))];
}

function splitCandidateParts(rawValue) {
  if (Array.isArray(rawValue)) {
    const nested = rawValue.flatMap((entry) => splitCandidateParts(entry));
    return [...new Set(nested)];
  }
  const text = String(rawValue ?? '').trim();
  if (!text) return [];
  const parts = text.includes(',')
    ? text.split(',').map((part) => String(part ?? '').trim()).filter(Boolean)
    : [text];
  return [...new Set(parts)];
}

function candidateLooksReference(candidateId, sourceToken = '') {
  const token = String(sourceToken || '').trim().toLowerCase();
  const cid = String(candidateId || '').trim();
  return cid.startsWith('ref_')
    || cid.startsWith('ref-')
    || cid.includes('::ref_')
    || cid.includes('::ref-')
    || token.includes('reference')
    || token.includes('component_db');
}

function candidateMatchesReviewItemValue(reviewItem, candidateNorm) {
  if (!candidateNorm) return false;
  const direct = normalizeLower(reviewItem?.matched_component || reviewItem?.raw_query || '');
  if (direct && direct === candidateNorm) return true;
  const attrs = parseReviewItemAttributes(reviewItem);
  return Object.values(attrs).some((attrValue) => (
    extractComparableValueTokens(attrValue).includes(candidateNorm)
  ));
}

function makerTokensFromReviewItem(reviewItem, componentType) {
  const attrs = parseReviewItemAttributes(reviewItem);
  const fieldKey = String(reviewItem?.field_key || '').trim();
  const keys = [
    `${componentType}_brand`,
    `${componentType}_maker`,
    fieldKey ? `${fieldKey}_brand` : '',
    fieldKey ? `${fieldKey}_maker` : '',
    'brand',
    'maker',
  ].filter(Boolean);
  const tokens = [];
  for (const key of keys) {
    for (const valuePart of splitCandidateParts(attrs[key])) {
      if (!isMeaningfulValue(valuePart)) continue;
      tokens.push(normalizeLower(valuePart));
    }
  }
  for (const valuePart of splitCandidateParts(reviewItem?.ai_suggested_maker)) {
    if (!isMeaningfulValue(valuePart)) continue;
    tokens.push(normalizeLower(valuePart));
  }
  return [...new Set(tokens)];
}

function reviewItemMatchesMakerLane(reviewItem, {
  componentType,
  componentMaker,
  allowMakerlessForNamedLane = false,
}) {
  const laneMaker = normalizeLower(componentMaker || '');
  const makerTokens = makerTokensFromReviewItem(reviewItem, componentType);
  if (!laneMaker) return makerTokens.length === 0;
  if (!makerTokens.length) return Boolean(allowMakerlessForNamedLane);
  return makerTokens.includes(laneMaker);
}

function isResolvedCandidateReview(
  reviewRow,
  {
    includeHumanAccepted = true,
    treatSharedAcceptAsPending = false,
  } = {},
) {
  if (!reviewRow) return false;
  const aiStatus = normalizeLower(reviewRow.ai_review_status || '');
  const aiReason = normalizeLower(reviewRow.ai_reason || '');
  if (aiStatus === 'rejected') return true;
  if (aiStatus === 'accepted') {
    if (treatSharedAcceptAsPending && aiReason === 'shared_accept') {
      return false;
    }
    return true;
  }
  if (includeHumanAccepted && Number(reviewRow.human_accepted) === 1) {
    return true;
  }
  return false;
}

function buildCandidateReviewLookup(reviewRows) {
  const exact = new Map();
  for (const row of Array.isArray(reviewRows) ? reviewRows : []) {
    const cid = String(row?.candidate_id || '').trim();
    if (!cid) continue;
    exact.set(cid, row);
  }
  return { exact };
}

function getReviewForCandidateId(lookup, candidateId) {
  if (!lookup) return null;
  const cid = String(candidateId || '').trim();
  if (!cid) return null;
  if (lookup.exact.has(cid)) return lookup.exact.get(cid) || null;
  return null;
}

function collectPendingCandidateIds({
  candidateRows,
  reviewLookup = null,
  includeHumanAccepted = true,
  treatSharedAcceptAsPending = false,
}) {
  const actionableIds = [];
  const seen = new Set();
  for (const row of Array.isArray(candidateRows) ? candidateRows : []) {
    const cid = String(row?.candidate_id || '').trim();
    if (!cid || seen.has(cid)) continue;
    const rowValue = row?.value;
    if (!isMeaningfulValue(rowValue)) continue;
    seen.add(cid);
    actionableIds.push(cid);
  }
  const pending = [];
  for (const cid of actionableIds) {
    const reviewRow = getReviewForCandidateId(reviewLookup, cid);
    if (!isResolvedCandidateReview(reviewRow, {
      includeHumanAccepted,
      treatSharedAcceptAsPending,
    })) {
      pending.push(cid);
    }
  }
  return pending;
}

function normalizeCandidatePrimaryReviewStatus(candidate, reviewRow = null) {
  if (candidate?.is_synthetic_selected) return 'accepted';
  if (reviewRow) {
    if (Number(reviewRow.human_accepted) === 1) return 'accepted';
    const aiStatus = normalizeLower(reviewRow.ai_review_status || '');
    if (aiStatus === 'accepted') return 'accepted';
    if (aiStatus === 'rejected') return 'rejected';
    return 'pending';
  }
  const sourceToken = normalizeLower(candidate?.source_id || candidate?.source || '');
  const methodToken = normalizeLower(candidate?.method || candidate?.source_method || '');
  if (
    sourceToken === 'reference'
    || sourceToken === 'component_db'
    || sourceToken === 'known_values'
    || sourceToken === 'user'
    || sourceToken === 'manual'
    || methodToken.includes('reference_data')
    || methodToken.includes('manual')
  ) {
    return 'accepted';
  }
  return 'pending';
}

export function createReviewCandidateRuntime({
  componentReviewPath,
  safeReadJson,
  fs,
  getSpecDb,
  config = {},
  normalizePathToken,
  buildComponentReviewSyntheticCandidateId,
} = {}) {
  if (typeof componentReviewPath !== 'function') {
    throw new TypeError('componentReviewPath must be a function');
  }
  if (typeof safeReadJson !== 'function') {
    throw new TypeError('safeReadJson must be a function');
  }
  if (!fs || typeof fs.writeFile !== 'function') {
    throw new TypeError('fs.writeFile must be available');
  }
  if (typeof getSpecDb !== 'function') {
    throw new TypeError('getSpecDb must be a function');
  }
  if (typeof normalizePathToken !== 'function') {
    throw new TypeError('normalizePathToken must be a function');
  }
  if (typeof buildComponentReviewSyntheticCandidateId !== 'function') {
    throw new TypeError('buildComponentReviewSyntheticCandidateId must be a function');
  }

  async function collectComponentReviewPropertyCandidateRows({
    category,
    componentType,
    componentName,
    componentMaker,
    allowMakerlessForNamedLane = false,
    propertyKey,
  }) {
    const normalizedComponentName = normalizeLower(componentName);
    const normalizedPropertyKey = String(propertyKey || '').trim();
    if (!category || !componentType || !normalizedComponentName || !normalizedPropertyKey) return [];
    if (normalizedPropertyKey.startsWith('__')) return [];
    const filePath = componentReviewPath({ config, category });
    const data = await safeReadJson(filePath);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return [];

    const rows = [];
    const seen = new Set();
    for (const item of items) {
      const status = normalizeLower(item?.status || '');
      if (status === 'dismissed' || status === 'ignored' || status === 'rejected') continue;
      if (String(item?.component_type || '').trim() !== String(componentType || '').trim()) continue;

      const matchedName = normalizeLower(item?.matched_component || '');
      const rawName = normalizeLower(item?.raw_query || '');
      const isSameComponent = matchedName
        ? matchedName === normalizedComponentName
        : rawName === normalizedComponentName;
      if (!isSameComponent) continue;
      if (!reviewItemMatchesMakerLane(item, { componentType, componentMaker, allowMakerlessForNamedLane })) continue;

      const attrs = parseReviewItemAttributes(item);
      const matchedEntry = Object.entries(attrs).find(([attrKey]) => (
        normalizeLower(attrKey) === normalizeLower(normalizedPropertyKey)
      ));
      if (!matchedEntry) continue;
      const [, attrValue] = matchedEntry;
      for (const valuePart of splitCandidateParts(attrValue)) {
        if (!isMeaningfulValue(valuePart)) continue;
        const candidateId = buildComponentReviewSyntheticCandidateId({
          productId: String(item?.product_id || '').trim(),
          fieldKey: normalizedPropertyKey,
          reviewId: String(item?.review_id || '').trim() || null,
          value: valuePart,
        });
        const cid = String(candidateId || '').trim();
        if (!cid || seen.has(cid)) continue;
        seen.add(cid);
        rows.push({ candidate_id: cid, value: valuePart });
      }
    }
    return rows;
  }

  function annotateCandidatePrimaryReviews(candidates, reviewRows = []) {
    const lookup = buildCandidateReviewLookup(reviewRows);
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const candidateId = String(candidate?.candidate_id || '').trim();
      const reviewRow = candidateId ? getReviewForCandidateId(lookup, candidateId) : null;
      candidate.primary_review_status = normalizeCandidatePrimaryReviewStatus(candidate, reviewRow);
      candidate.human_accepted = Number(reviewRow?.human_accepted || 0) === 1;
    }
  }

  function getPendingItemPrimaryCandidateIds(specDb, {
    productId,
    fieldKey,
    itemFieldStateId,
  }) {
    if (!specDb || !productId || !fieldKey || !itemFieldStateId) return [];
    const candidatesByField = specDb.getCandidatesForProduct(productId) || {};
    const candidateRows = candidatesByField[fieldKey] || [];
    const reviewRows = specDb.getReviewsForContext('item', String(itemFieldStateId)) || [];
    const reviewLookup = buildCandidateReviewLookup(reviewRows);
    return collectPendingCandidateIds({
      candidateRows,
      reviewLookup,
    });
  }

  async function getPendingComponentSharedCandidateIdsAsync(specDb, {
    category,
    componentType,
    componentName,
    componentMaker,
    propertyKey,
    componentValueId,
  }) {
    if (!specDb || !componentValueId || !propertyKey) return [];
    const candidateRows = specDb.getCandidatesForComponentProperty(
      componentType,
      componentName,
      componentMaker || '',
      propertyKey,
    ) || [];
    const reviewRows = specDb.getReviewsForContext('component', String(componentValueId)) || [];
    const reviewLookup = buildCandidateReviewLookup(reviewRows);
    const ambiguousMakerRows = specDb.db.prepare(`
      SELECT COUNT(DISTINCT LOWER(TRIM(COALESCE(maker, '')))) AS maker_count
      FROM component_identity
      WHERE category = ?
        AND component_type = ?
        AND LOWER(TRIM(canonical_name)) = LOWER(TRIM(?))
    `).get(specDb.category, componentType, componentName);
    const allowMakerlessForNamedLane = Boolean(String(componentMaker || '').trim())
      && Number(ambiguousMakerRows?.maker_count || 0) <= 1;
    const syntheticRows = await collectComponentReviewPropertyCandidateRows({
      category,
      componentType,
      componentName,
      componentMaker,
      allowMakerlessForNamedLane,
      propertyKey,
    });
    return collectPendingCandidateIds({
      candidateRows: [...candidateRows, ...syntheticRows],
      reviewLookup,
      includeHumanAccepted: false,
      treatSharedAcceptAsPending: true,
    });
  }

  function getPendingEnumSharedCandidateIds(specDb, {
    fieldKey,
    listValueId,
  }) {
    if (!specDb || !fieldKey || !listValueId) return [];
    const candidateRows = specDb.getCandidatesByListValue(fieldKey, listValueId) || [];
    const reviewRows = specDb.getReviewsForContext('list', String(listValueId)) || [];
    const reviewLookup = buildCandidateReviewLookup(reviewRows);
    return collectPendingCandidateIds({
      candidateRows,
      reviewLookup,
      includeHumanAccepted: false,
      treatSharedAcceptAsPending: true,
    });
  }

  async function syncSyntheticCandidatesFromComponentReview({ category, specDb }) {
    if (!specDb) return { upserted: 0 };
    const filePath = componentReviewPath({ config, category });
    const data = await safeReadJson(filePath);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return { upserted: 0 };

    let upserted = 0;
    let assertionsUpserted = 0;
    const sourceIds = new Set();
    const nowIso = new Date().toISOString();
    const categoryToken = String(specDb.category || category || '').trim();
    const selectItemFieldSlotId = specDb.db.prepare(
      'SELECT id FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
    );
    const selectEvidenceRef = specDb.db.prepare(
      'SELECT 1 FROM source_evidence_refs WHERE assertion_id = ? LIMIT 1'
    );
    for (const item of items) {
      const status = String(item?.status || '').trim().toLowerCase();
      if (status === 'dismissed') continue;
      const productId = String(item?.product_id || '').trim();
      const fieldKey = String(item?.field_key || '').trim();
      if (!productId || !fieldKey) continue;
      const runToken = normalizePathToken(item?.run_id || 'component-review', 'component-review');
      const reviewToken = normalizePathToken(item?.review_id || 'pending', 'pending');
      const sourceId = `${categoryToken}::${productId}::pipeline::${runToken}::${reviewToken}`;
      const sourceUrl = `pipeline://component-review/${reviewToken}`;
      specDb.upsertSourceRegistry({
        sourceId,
        category: categoryToken,
        itemIdentifier: productId,
        productId,
        runId: item?.run_id || null,
        sourceUrl,
        sourceHost: 'pipeline',
        sourceRootDomain: 'pipeline',
        sourceTier: null,
        sourceMethod: item?.match_type || 'component_review',
        crawlStatus: 'fetched',
        httpStatus: null,
        fetchedAt: item?.created_at || nowIso,
      });
      sourceIds.add(sourceId);

      const pushCandidate = (candidateId, value, score, method, quote, snippetText, candidateFieldKey = fieldKey) => {
        const text = String(value ?? '').trim();
        if (!text || !isMeaningfulValue(text)) return;
        const resolvedFieldKey = String(candidateFieldKey || '').trim();
        if (!resolvedFieldKey) return;
        const itemFieldStateId = selectItemFieldSlotId.get(categoryToken, productId, resolvedFieldKey)?.id ?? null;
        const normalizedText = normalizeLower(text);
        specDb.insertCandidate({
          candidate_id: candidateId,
          product_id: productId,
          field_key: resolvedFieldKey,
          value: text,
          normalized_value: normalizedText,
          score: Number.isFinite(Number(score)) ? Number(score) : 0.5,
          rank: 1,
          source_url: sourceUrl,
          source_host: 'pipeline',
          source_root_domain: 'pipeline',
          source_tier: null,
          source_method: method,
          approved_domain: 0,
          snippet_id: String(item.review_id || ''),
          snippet_hash: '',
          snippet_text: snippetText || '',
          quote: quote || '',
          quote_span_start: null,
          quote_span_end: null,
          evidence_url: '',
          evidence_retrieved_at: item.created_at || null,
          is_component_field: 1,
          component_type: item.component_type || null,
          is_list_field: 0,
          llm_extract_model: null,
          extracted_at: item.created_at || nowIso,
          run_id: item.run_id || null,
        });
        upserted += 1;
        const assertionId = String(candidateId || '').trim();
        if (!assertionId) return;
        specDb.upsertSourceAssertion({
          assertionId,
          sourceId,
          fieldKey: resolvedFieldKey,
          contextKind: 'scalar',
          contextRef: itemFieldStateId ? `item_field_state:${itemFieldStateId}` : `item_field:${productId}:${resolvedFieldKey}`,
          itemFieldStateId,
          componentValueId: null,
          listValueId: null,
          enumListId: null,
          valueRaw: text,
          valueNormalized: normalizedText,
          unit: null,
          candidateId: assertionId,
          extractionMethod: method || item?.match_type || 'component_review',
        });
        assertionsUpserted += 1;
        if (!selectEvidenceRef.get(assertionId)) {
          const quoteText = String(quote || snippetText || `Pipeline component review candidate for ${fieldKey}`).trim();
          specDb.insertSourceEvidenceRef({
            assertionId,
            evidenceUrl: sourceUrl,
            snippetId: String(item.review_id || '').trim() || null,
            quote: quoteText || null,
            method: method || item?.match_type || 'component_review',
            tier: null,
            retrievedAt: item.created_at || nowIso,
          });
        }
      };

      const primaryValue = String(item?.matched_component || item?.raw_query || '').trim();
      if (primaryValue) {
        const id = buildComponentReviewSyntheticCandidateId({
          productId,
          fieldKey,
          reviewId: String(item?.review_id || '').trim() || null,
          value: primaryValue,
        });
        pushCandidate(
          id,
          primaryValue,
          item?.combined_score ?? 0.5,
          item?.match_type || 'component_review',
          item?.raw_query ? `Raw query: "${item.raw_query}"` : '',
          item?.reasoning_note || 'Pipeline component review candidate',
        );
      }

      const attrs = item?.product_attributes && typeof item.product_attributes === 'object'
        ? item.product_attributes
        : {};
      for (const [attrKeyRaw, attrValue] of Object.entries(attrs)) {
        const attrKey = String(attrKeyRaw || '').trim();
        if (!attrKey) continue;
        for (const attrText of splitCandidateParts(attrValue)) {
          if (!isMeaningfulValue(attrText)) continue;
          const id = buildComponentReviewSyntheticCandidateId({
            productId,
            fieldKey: attrKey,
            reviewId: String(item?.review_id || '').trim() || attrKey,
            value: attrText,
          });
          pushCandidate(
            id,
            attrText,
            item?.property_score ?? 0.4,
            'product_extraction',
            `Extracted attribute "${attrKey}" from product run`,
            `${attrKey}: ${attrText}`,
            attrKey,
          );
        }
      }
    }
    return { upserted, assertionsUpserted, sourcesUpserted: sourceIds.size };
  }

  async function remapPendingComponentReviewItemsForNameChange({
    category,
    componentType,
    oldName,
    newName,
    specDb = null,
  }) {
    const oldNorm = normalizeLower(oldName);
    const newValue = String(newName || '').trim();
    if (!oldNorm || !newValue || oldNorm === normalizeLower(newValue)) return { changed: 0 };

    const filePath = componentReviewPath({ config, category });
    const data = await safeReadJson(filePath);
    let changed = 0;
    const changedReviewIds = [];

    if (data && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item?.status !== 'pending_ai') continue;
        if (String(item?.component_type || '').trim() !== String(componentType || '').trim()) continue;
        const matchedNorm = normalizeLower(item?.matched_component || '');
        const rawNorm = normalizeLower(item?.raw_query || '');
        const shouldRebind = matchedNorm === oldNorm || (!matchedNorm && rawNorm === oldNorm);
        if (!shouldRebind) continue;
        item.matched_component = newValue;
        changed += 1;
        changedReviewIds.push(String(item.review_id || '').trim());
      }
      if (changed > 0) {
        data.updated_at = new Date().toISOString();
        await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      }
    }

    const runtimeSpecDb = specDb || getSpecDb(category);
    if (runtimeSpecDb) {
      try {
        if (changedReviewIds.length > 0) {
          const stmt = runtimeSpecDb.db.prepare(
            `UPDATE component_review_queue
             SET matched_component = ?, updated_at = datetime('now')
             WHERE category = ? AND review_id = ?`
          );
          for (const reviewId of changedReviewIds) {
            if (!reviewId) continue;
            stmt.run(newValue, category, reviewId);
          }
        } else {
          runtimeSpecDb.db.prepare(
            `UPDATE component_review_queue
             SET matched_component = ?, updated_at = datetime('now')
             WHERE category = ?
               AND component_type = ?
               AND status = 'pending_ai'
               AND (
                 LOWER(TRIM(COALESCE(matched_component, ''))) = LOWER(TRIM(?))
                 OR (
                   (matched_component IS NULL OR TRIM(matched_component) = '')
                   AND LOWER(TRIM(COALESCE(raw_query, ''))) = LOWER(TRIM(?))
                 )
               )`
          ).run(newValue, category, componentType, oldName, oldName);
        }
      } catch {
        // best-effort sync
      }
    }

    return { changed };
  }

  async function propagateSharedLaneDecision({
    category,
    specDb,
    keyReviewState,
    laneAction,
    candidateValue = null,
  }) {
    if (!specDb || !keyReviewState) return { propagated: false };
    if (String(keyReviewState.target_kind || '') !== 'grid_key') return { propagated: false };
    if (laneAction !== 'accept') return { propagated: false };

    const fieldKey = String(keyReviewState.field_key || '').trim();
    const selectedValue = String(
      candidateValue ?? keyReviewState.selected_value ?? ''
    ).trim();
    if (!fieldKey || !isMeaningfulValue(selectedValue)) return { propagated: false };

    // Grid shared accepts are strictly slot-scoped: one item field slot action must never
    // mutate peer item slots, component property slots, or enum value slots.
    return { propagated: false };
  }

  return {
    normalizeLower,
    isMeaningfulValue,
    candidateLooksReference,
    annotateCandidatePrimaryReviews,
    getPendingItemPrimaryCandidateIds,
    getPendingComponentSharedCandidateIdsAsync,
    getPendingEnumSharedCandidateIds,
    syncSyntheticCandidatesFromComponentReview,
    remapPendingComponentReviewItemsForNameChange,
    propagateSharedLaneDecision,
  };
}
