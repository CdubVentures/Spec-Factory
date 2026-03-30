// ── Field Review Route Handlers ─────────────────────────────────────
//
// Extracted from reviewRoutes.js.
// Handles: layout, product, products, products-index, candidates, suggest.

import { resolveProductIdentity } from '../../catalog/index.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';

async function applyCatalogIdentity(payload, category, productId, { catalogEntry = null, specDb = null, config, loadProductCatalog }) {
  if (!payload || typeof payload !== 'object') return payload;
  payload.identity = await resolveProductIdentity({
    productId,
    category,
    config,
    loadProductCatalog,
    specDb,
    catalogProduct: catalogEntry,
    normalizedIdentity: payload.identity,
  });
  return payload;
}

export async function handleFieldReviewRoute({ parts, params, method, req, res, context }) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    hasKnownValue,
    config,
    storage,
    getSpecDb,
    buildReviewLayout,
    buildProductReviewPayload,
    buildReviewQueue,
    loadProductCatalog,
    sessionCache,
    annotateCandidatePrimaryReviews,
    slugify,
    broadcastWs,
    path,
    spawn,
  } = context;

  // WHY: SQL is the primary source for field_studio_map. This helper reads the raw map
  // for consumers (like buildReviewLayout) that need key_list / product_table metadata.
  function readRawStudioMap(category) {
    const specDb = getSpecDb(category);
    const row = specDb?.getFieldStudioMap?.();
    if (!row) return null;
    try { return JSON.parse(row.map_json); } catch { return null; }
  }

  // Review layout
  if (parts[0] === 'review' && parts[1] && parts[2] === 'layout' && method === 'GET') {
    const category = parts[1];
    const session = await sessionCache.getSessionRules(category);
    const layout = await buildReviewLayout({
      storage,
      config,
      category,
      fieldOrderOverride: session.mergedFieldOrder,
      fieldsOverride: session.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    return jsonRes(res, 200, layout);
  }

  // Review product payload (single) - only serve if product exists in catalog
  if (parts[0] === 'review' && parts[1] && parts[2] === 'product' && parts[3] && method === 'GET') {
    const [, category, , productId] = parts;
    const specDb = getSpecDb(category);
    const catalog = await loadProductCatalog(config, category);
    const catalogPids = new Set(Object.keys(catalog.products || {}));
    if (catalogPids.size > 0 && !catalogPids.has(productId)) {
      return jsonRes(res, 404, { error: 'not_in_catalog', message: `Product ${productId} is not in the product catalog` });
    }
    const sessionProd = await sessionCache.getSessionRules(category);
    const draftLayout = await buildReviewLayout({
      storage,
      config,
      category,
      fieldOrderOverride: sessionProd.mergedFieldOrder,
      fieldsOverride: sessionProd.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const catEntry = catalog.products?.[productId] || {};
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      layout: draftLayout,
      specDb,
      catalogProduct: catEntry,
    });
    await applyCatalogIdentity(payload, category, productId, { catalogEntry: catEntry, specDb, config, loadProductCatalog });
    return jsonRes(res, 200, payload);
  }

  // Review batch products (for multi-product matrix)
  if (parts[0] === 'review' && parts[1] && parts[2] === 'products' && method === 'GET') {
    const category = parts[1];
    const specDb = getSpecDb(category);
    const idsParam = params.get('ids') || '';
    const brandsParam = params.get('brands') || '';
    const limit = toInt(params.get('limit'), 20);
    const wantCandidates = params.get('includeCandidates') !== 'false';
    const catalog = await loadProductCatalog(config, category);
    let productIds;
    if (idsParam) {
      productIds = idsParam.split(',').filter(Boolean);
    } else {
      const queue = await buildReviewQueue({
        storage,
        config,
        category,
        status: 'needs_review',
        limit,
        specDb,
        catalogProducts: catalog.products || {},
      });
      productIds = queue.map(q => q.product_id || q.productId).filter(Boolean).slice(0, limit);
    }
    const catalogPids = new Set(Object.keys(catalog.products || {}));
    if (specDb) {
      try {
        const dbProducts = specDb.getAllProducts('active');
        for (const p of dbProducts) catalogPids.add(p.product_id);
      } catch { /* fall through */ }
    }
    productIds = productIds.filter(pid => catalogPids.has(pid));
    const brandsFilter = brandsParam ? new Set(brandsParam.split(',').map(b => b.trim().toLowerCase()).filter(Boolean)) : null;
    const batchSession = await sessionCache.getSessionRules(category);
    const batchLayout = await buildReviewLayout({
      storage,
      config,
      category,
      fieldOrderOverride: batchSession.mergedFieldOrder,
      fieldsOverride: batchSession.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const payloads = [];
    for (const pid of productIds) {
      try {
        const ce = catalog.products?.[pid] || {};
        const payload = await buildProductReviewPayload({
          storage,
          config,
          category,
          productId: pid,
          layout: batchLayout,
          includeCandidates: wantCandidates,
          specDb,
          catalogProduct: ce,
        });
        await applyCatalogIdentity(payload, category, pid, { catalogEntry: ce, specDb, config, loadProductCatalog });
        if (payload) {
          if (brandsFilter) {
            const brand = String(payload.identity?.brand || '').trim().toLowerCase();
            if (!brandsFilter.has(brand)) continue;
          }
          payloads.push(payload);
        }
      } catch { /* skip failed products */ }
    }
    return jsonRes(res, 200, payloads);
  }

  // Review products index - ALL products, lightweight (no candidates), sorted by brand
  if (parts[0] === 'review' && parts[1] && parts[2] === 'products-index' && method === 'GET') {
    const category = parts[1];
    const specDb = getSpecDb(category);
    const catalog = await loadProductCatalog(config, category);
    const catalogProducts = catalog.products || {};
    let productIds = Object.keys(catalogProducts);
    if (productIds.length === 0) {
      if (specDb) {
        try {
          const dbProducts = specDb.getAllProducts('active');
          productIds = dbProducts.map(p => p.product_id);
          for (const p of dbProducts) {
            catalogProducts[p.product_id] = { brand: p.brand, model: p.model, variant: p.variant, id: p.id, identifier: p.identifier };
          }
        } catch { /* fall through */ }
      }
    }

    const indexSession = await sessionCache.getSessionRules(category);
    const indexLayout = await buildReviewLayout({
      storage, config, category,
      fieldOrderOverride: indexSession.mergedFieldOrder,
      fieldsOverride: indexSession.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const payloads = [];
    for (const pid of productIds) {
      try {
        const ce = catalogProducts[pid] || {};
        const payload = await buildProductReviewPayload({
          storage,
          config,
          category,
          productId: pid,
          layout: indexLayout,
          includeCandidates: false,
          specDb,
          catalogProduct: ce,
        });
        await applyCatalogIdentity(payload, category, pid, { catalogEntry: ce, specDb, config, loadProductCatalog });
        if (payload) payloads.push(payload);
      } catch { /* skip failed products */ }
    }

    // Tag each product with hasRun (has summary data)
    for (const p of payloads) {
      p.hasRun = !!p.metrics.has_run;
    }

    // Enrich each product's fields with key_review_state data
    if (specDb) {
      for (const p of payloads) {
        try {
          const krsRows = specDb.getKeyReviewStatesForItem(p.product_id);
          for (const krs of krsRows) {
            const fieldState = p.fields[krs.field_key];
            if (!fieldState) continue;
            fieldState.keyReview = {
              id: krs.id,
              selectedCandidateId: krs.selected_candidate_id || null,
              primaryStatus: krs.ai_confirm_primary_status || null,
              primaryConfidence: krs.ai_confirm_primary_confidence ?? null,
              sharedStatus: krs.ai_confirm_shared_status || null,
              sharedConfidence: krs.ai_confirm_shared_confidence ?? null,
              userAcceptPrimary: krs.user_accept_primary_status || null,
              userAcceptShared: krs.user_accept_shared_status || null,
              overridePrimary: Boolean(krs.user_override_ai_primary),
              overrideShared: Boolean(krs.user_override_ai_shared),
            };
          }
        } catch { /* best-effort key review enrichment */ }
      }
    }

    // Sort by brand (ascending), then model (ascending)
    payloads.sort((a, b) => {
      const brandA = String(a.identity?.brand || '').toLowerCase();
      const brandB = String(b.identity?.brand || '').toLowerCase();
      if (brandA !== brandB) return brandA.localeCompare(brandB);
      const modelA = String(a.identity?.model || '').toLowerCase();
      const modelB = String(b.identity?.model || '').toLowerCase();
      return modelA.localeCompare(modelB);
    });

    // Extract unique sorted brands
    const brandSet = new Set();
    for (const p of payloads) {
      const brand = String(p.identity?.brand || '').trim();
      if (brand) brandSet.add(brand);
    }
    const brands = [...brandSet].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // Compute run-only metrics (excludes unrun products that drag averages down)
    const runProducts = payloads.filter(p => p.hasRun);
    const metricsRun = runProducts.length > 0 ? {
      confidence: runProducts.reduce((s, p) => s + p.metrics.confidence, 0) / runProducts.length,
      coverage: runProducts.reduce((s, p) => s + p.metrics.coverage, 0) / runProducts.length,
      flags: runProducts.reduce((s, p) => s + p.metrics.flags, 0),
      missing: runProducts.reduce((s, p) => s + (p.metrics.missing || 0), 0),
      count: runProducts.length,
    } : { confidence: 0, coverage: 0, flags: 0, missing: 0, count: 0 };

    return jsonRes(res, 200, { products: payloads, brands, total: payloads.length, metrics_run: metricsRun });
  }

  // Review candidates for a single field - lazy loading for drawer
  if (parts[0] === 'review' && parts[1] && parts[2] === 'candidates' && parts[3] && parts[4] && method === 'GET') {
    const [, category, , productId, field] = parts;
    const specDb = getSpecDb(category);
    const catalog = await loadProductCatalog(config, category);
    const catalogPids = new Set(Object.keys(catalog.products || {}));
    if (catalogPids.size > 0 && !catalogPids.has(productId)) {
      const dbProduct = specDb?.getProduct(productId);
      if (!dbProduct) {
        return jsonRes(res, 404, { error: 'not_in_catalog', message: `Product ${productId} is not in the product catalog` });
      }
    }
    const candSession = await sessionCache.getSessionRules(category);
    const candLayout = await buildReviewLayout({
      storage, config, category,
      fieldOrderOverride: candSession.mergedFieldOrder,
      fieldsOverride: candSession.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      layout: candLayout,
      includeCandidates: true,
      specDb,
    });
    const requestedField = decodeURIComponent(String(field || ''));
    const availableFields = Object.keys(payload.fields || {});
    const resolvedField = payload.fields?.[requestedField]
      ? requestedField
      : (availableFields.find((key) => key.toLowerCase() === requestedField.toLowerCase()) || requestedField);
    const fieldState = payload.fields?.[resolvedField] || { candidates: [] };
    let itemFieldStateId = (() => {
      const n = Number(fieldState?.slot_id ?? fieldState?.id ?? null);
      if (!Number.isFinite(n)) return null;
      const id = Math.trunc(n);
      return id > 0 ? id : null;
    })();
    const allCandidates = Array.isArray(fieldState.candidates) ? [...fieldState.candidates] : [];
    let keyReview = null;
    if (specDb) {
      try {
        const krs = specDb.getKeyReviewState({
          targetKind: 'grid_key',
          itemIdentifier: productId,
          fieldKey: resolvedField,
          itemFieldStateId,
          category,
        });
        if (krs) {
          keyReview = {
            id: krs.id,
            selectedCandidateId: krs.selected_candidate_id || null,
            primaryStatus: krs.ai_confirm_primary_status || null,
            primaryConfidence: krs.ai_confirm_primary_confidence ?? null,
            sharedStatus: krs.ai_confirm_shared_status || null,
            sharedConfidence: krs.ai_confirm_shared_confidence ?? null,
            userAcceptPrimary: krs.user_accept_primary_status || null,
            userAcceptShared: krs.user_accept_shared_status || null,
            overridePrimary: Boolean(krs.user_override_ai_primary),
            overrideShared: Boolean(krs.user_override_ai_shared),
          };
        }
      } catch { /* best-effort */ }
    }
    const selectedValue = fieldState?.selected?.value;
    const selectedValueNorm = String(selectedValue ?? '').trim().toLowerCase();
    const hasSelectedValue = hasKnownValue(selectedValue);
    const selectedCandidateId = String(
      keyReview?.selectedCandidateId
      || fieldState?.accepted_candidate_id
      || '',
    ).trim();
    const existingIds = new Set(allCandidates.map((candidate) => String(candidate?.candidate_id || '').trim()).filter(Boolean));
    const hasSelectedId = selectedCandidateId ? existingIds.has(selectedCandidateId) : false;
    const hasSelectedValueCandidate = hasSelectedValue
      && allCandidates.some((candidate) => String(candidate?.value ?? '').trim().toLowerCase() === selectedValueNorm);
    const sourceTokenRaw = String(fieldState?.source || '').trim().toLowerCase();
    const sourceId = sourceTokenRaw === 'component_db'
      || sourceTokenRaw === 'known_values'
      || sourceTokenRaw === 'reference'
      ? 'reference'
      : (sourceTokenRaw.startsWith('pipeline')
          ? 'pipeline'
          : (sourceTokenRaw === 'manual' || sourceTokenRaw === 'user' ? 'user' : sourceTokenRaw));
    const sourceLabel = sourceId === 'reference'
      ? 'Reference'
      : (sourceId === 'pipeline'
          ? 'Pipeline'
          : (String(fieldState?.source || '').trim() || sourceId || 'Pipeline'));
    const selectedConfidence = Number.isFinite(Number(fieldState?.selected?.confidence))
      ? Math.max(0, Math.min(1, Number(fieldState.selected.confidence)))
      : 0.5;
    const selectedEvidenceUrl = String(fieldState?.evidence_url || '').trim();
    const selectedEvidenceQuote = String(fieldState?.evidence_quote || '').trim()
      || 'Selected value retained from slot state';
    const ensureSelectedCandidate = (candidateId) => {
      const cid = String(candidateId || '').trim();
      if (!cid || existingIds.has(cid) || !hasSelectedValue) return;
      existingIds.add(cid);
      allCandidates.push({
        candidate_id: cid,
        value: selectedValue,
        score: selectedConfidence,
        source_id: sourceId || '',
        source: sourceLabel,
        tier: null,
        method: sourceId === 'user' ? 'manual_override' : 'selected_value',
        is_synthetic_selected: true,
        evidence: {
          url: selectedEvidenceUrl,
          retrieved_at: String(fieldState?.source_timestamp || '').trim(),
          snippet_id: '',
          snippet_hash: '',
          quote: selectedEvidenceQuote,
          quote_span: null,
          snippet_text: selectedEvidenceQuote,
          source_id: sourceId || '',
        },
      });
    };
    if (hasSelectedValue && selectedCandidateId && !hasSelectedId) {
      ensureSelectedCandidate(selectedCandidateId);
    }
    if (hasSelectedValue && !hasSelectedValueCandidate) {
      ensureSelectedCandidate(`selected_${slugify(productId || 'product')}_${slugify(resolvedField || 'field')}`);
    }
    if (specDb) {
      const reviewRows = itemFieldStateId
        ? (specDb.getReviewsForContext('item', String(itemFieldStateId)) || [])
        : [];
      annotateCandidatePrimaryReviews(allCandidates, reviewRows);
    }
    allCandidates.sort((a, b) => {
      const aScore = Number.parseFloat(String(a?.score ?? ''));
      const bScore = Number.parseFloat(String(b?.score ?? ''));
      const left = Number.isFinite(aScore) ? aScore : 0;
      const right = Number.isFinite(bScore) ? bScore : 0;
      if (right !== left) return right - left;
      return String(a?.candidate_id || '').localeCompare(String(b?.candidate_id || ''));
    });
    return jsonRes(res, 200, {
      product_id: productId,
      field: resolvedField,
      candidates: allCandidates,
      candidate_count: allCandidates.length,
      keyReview,
    });
  }

  // Review suggest - submit suggestion feedback
  if (parts[0] === 'review' && parts[1] && parts[2] === 'suggest' && method === 'POST') {
    const category = parts[1];
    const body = await readJsonBody(req);
    const { type, field, value, evidenceUrl, evidenceQuote, canonical, reason, reviewer, productId } = body;
    if (!type || !field || !value) return jsonRes(res, 400, { error: 'type, field, and value required' });
    const cliArgs = ['src/cli/spec.js', 'review', 'suggest', '--category', category, '--type', type, '--field', field, '--value', String(value)];
    if (evidenceUrl) cliArgs.push('--evidence-url', String(evidenceUrl));
    if (evidenceQuote) cliArgs.push('--evidence-quote', String(evidenceQuote));
    if (canonical) cliArgs.push('--canonical', String(canonical));
    if (reason) cliArgs.push('--reason', String(reason));
    if (reviewer) cliArgs.push('--reviewer', String(reviewer));
    if (productId) cliArgs.push('--product-id', String(productId));
    cliArgs.push('--local');
    try {
      const result = await new Promise((resolve, reject) => {
        const proc = spawn('node', cliArgs, { cwd: path.resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = '';
        proc.stdout.on('data', d => { stdout += d; });
        proc.stderr.on('data', d => { stderr += d; });
        proc.on('exit', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `exit ${code}`)));
      });
      emitDataChange({
        broadcastWs,
        event: 'review-suggest',
        category,
        entities: {
          productIds: [productId || null],
          fieldKeys: [field || null],
        },
        meta: {
          suggestionType: String(type || '').trim(),
        },
      });
      return jsonRes(res, 200, { ok: true, output: result });
    } catch (err) {
      return jsonRes(res, 500, { error: 'suggest_failed', message: err.message });
    }
  }

  return false;
}
