// ── Field Review Route Handlers ─────────────────────────────────────
//
// Extracted from reviewRoutes.js.
// Handles: layout, product, products, products-index, candidates, suggest.

import { resolveProductIdentity } from '../../catalog/index.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';

async function applyCatalogIdentity(payload, category, productId, { catalogEntry = null, specDb = null, config }) {
  if (!payload || typeof payload !== 'object') return payload;
  payload.identity = await resolveProductIdentity({
    productId,
    category,
    config,
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
    sessionCache,
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
      specDb: getSpecDb(category),
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
    // WHY: SQL is the source of truth — check product existence via specDb.
    const dbProduct = specDb?.getProduct(productId) ?? null;
    if (!dbProduct) {
      return jsonRes(res, 404, { error: 'not_in_catalog', message: `Product ${productId} is not in the product catalog` });
    }
    const sessionProd = await sessionCache.getSessionRules(category);
    const draftLayout = await buildReviewLayout({
      storage,
      config,
      category,
      specDb: getSpecDb(category),
      fieldOrderOverride: sessionProd.mergedFieldOrder,
      fieldsOverride: sessionProd.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const catEntry = dbProduct || {};
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      layout: draftLayout,
      specDb,
      catalogProduct: catEntry,
    });
    await applyCatalogIdentity(payload, category, productId, { catalogEntry: catEntry, specDb, config });
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
    // WHY: SQL is the sole SSOT for products.
    const dbProducts = specDb?.getAllProducts?.('active') || [];
    const dbProductMap = Object.fromEntries(dbProducts.map(p => [p.product_id, { brand: p.brand, model: p.model, variant: p.variant, id: p.id, identifier: p.identifier, base_model: p.base_model }]));
    let productIds;
    if (idsParam) {
      productIds = idsParam.split(',').filter(Boolean);
    } else {
      productIds = Object.keys(dbProductMap).slice(0, limit);
    }
    const validPids = new Set(Object.keys(dbProductMap));
    productIds = productIds.filter(pid => validPids.has(pid));
    const brandsFilter = brandsParam ? new Set(brandsParam.split(',').map(b => b.trim().toLowerCase()).filter(Boolean)) : null;
    const batchSession = await sessionCache.getSessionRules(category);
    const batchLayout = await buildReviewLayout({
      storage,
      config,
      category,
      specDb: getSpecDb(category),
      fieldOrderOverride: batchSession.mergedFieldOrder,
      fieldsOverride: batchSession.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const payloads = [];
    for (const pid of productIds) {
      try {
        const ce = dbProductMap[pid] || {};
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
        await applyCatalogIdentity(payload, category, pid, { catalogEntry: ce, specDb, config });
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
    // WHY: SQL is the sole SSOT for products.
    const indexDbProducts = specDb?.getAllProducts?.('active') || [];
    const indexProductMap = Object.fromEntries(indexDbProducts.map(p => [p.product_id, { brand: p.brand, model: p.model, variant: p.variant, id: p.id, identifier: p.identifier, base_model: p.base_model }]));
    const productIds = indexDbProducts.map(p => p.product_id);

    const indexSession = await sessionCache.getSessionRules(category);
    const indexLayout = await buildReviewLayout({
      storage, config, category,
      specDb: getSpecDb(category),
      fieldOrderOverride: indexSession.mergedFieldOrder,
      fieldsOverride: indexSession.mergedFields,
      studioMap: readRawStudioMap(category),
    });
    const payloads = [];
    for (const pid of productIds) {
      try {
        const ce = indexProductMap[pid] || {};
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
        await applyCatalogIdentity(payload, category, pid, { catalogEntry: ce, specDb, config });
        if (payload) payloads.push(payload);
      } catch { /* skip failed products */ }
    }

    // Tag each product with hasRun (has summary data)
    for (const p of payloads) {
      p.hasRun = !!p.metrics.has_run;
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
    const dbProduct = specDb?.getProduct(productId);
    if (!dbProduct) {
      return jsonRes(res, 404, { error: 'product_not_found', message: `Product ${productId} not found` });
    }
    const requestedField = decodeURIComponent(String(field || ''));

    // field_candidates is the sole SSOT for candidates.
    const fcRows = specDb?.getFieldCandidatesByProductAndField?.(productId, requestedField) || [];
    const allCandidates = fcRows.map((c) => {
      const meta = c.metadata_json && typeof c.metadata_json === 'object' ? c.metadata_json : {};
      const sources = Array.isArray(c.sources_json) ? c.sources_json : [];
      const firstSource = sources[0] && typeof sources[0] === 'object' ? sources[0] : {};
      const sourceToken = String(meta.source || firstSource.source || '').trim().toLowerCase();
      return {
        candidate_id: `fc_${c.id}`,
        value: c.value,
        score: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
        source_id: sourceToken || '',
        source: sourceToken || '',
        tier: null,
        method: String(meta.method || sourceToken || '').trim() || null,
        status: c.status || 'candidate',
        evidence: {
          url: String(meta.evidence?.url || '').trim(),
          quote: String(meta.evidence?.quote || meta.reason || '').trim(),
          source_id: sourceToken || '',
        },
      };
    });

    allCandidates.sort((a, b) => {
      const left = Number.isFinite(a.score) ? a.score : 0;
      const right = Number.isFinite(b.score) ? b.score : 0;
      if (right !== left) return right - left;
      return String(a.candidate_id || '').localeCompare(String(b.candidate_id || ''));
    });

    return jsonRes(res, 200, {
      product_id: productId,
      field: requestedField,
      candidates: allCandidates,
      candidate_count: allCandidates.length,
    });
  }

  // Review suggest - submit suggestion feedback
  if (parts[0] === 'review' && parts[1] && parts[2] === 'suggest' && method === 'POST') {
    const category = parts[1];
    const body = await readJsonBody(req);
    const { type, field, value, evidenceUrl, evidenceQuote, canonical, reason, reviewer, productId } = body;
    if (!type || !field || !value) return jsonRes(res, 400, { error: 'type, field, and value required' });
    const cliArgs = ['src/app/cli/spec.js', 'review', 'suggest', '--category', category, '--type', type, '--field', field, '--value', String(value)];
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
