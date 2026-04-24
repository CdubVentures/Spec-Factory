/**
 * Publisher GUI routes.
 *
 * GET  /publisher/:category/candidates?page=1&limit=100
 * GET  /publisher/:category/stats
 * GET  /publisher/:category/published/:productId
 * GET  /publisher/:category/reconcile          (dry-run preview)
 * POST /publisher/:category/reconcile          (apply reconciliation)
 */

import { reconcileThreshold } from '../publish/reconcileThreshold.js';
import { registerOperation, updateStage, completeOperation, failOperation } from '../../../core/operations/operationsRegistry.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { computePublishedArraysFromVariants, aggregateCefFieldConfidence } from '../../color-edition/index.js';

// WHY: colors/editions store their value as a JSON-stringified array in
// field_candidates.value (e.g. '["black","white+silver"]'). UI consumers
// expect a parsed array. Scalars pass through untouched.
const ARRAY_VALUED_FIELDS = new Set(['colors', 'editions']);
function decodeFieldValue(fieldKey, rawValue) {
  if (!ARRAY_VALUED_FIELDS.has(fieldKey)) return rawValue;
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue !== 'string') return rawValue;
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : rawValue;
  } catch { return rawValue; }
}

function safeJsonParse(str, fallback) {
  if (!str || typeof str !== 'string') return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function isUnknownScalarValue(value, unknownReason) {
  if (String(unknownReason || '').trim()) return true;
  return typeof value === 'string' && value.trim().toLowerCase() === 'unk';
}

function makeStrippedUnknownRow({
  id,
  category,
  productId,
  fieldKey,
  sourceType,
  runNumber,
  ranAt,
  llmModel,
  unknownReason,
  confidence,
  brand,
  model,
  variant,
  detail = {},
}) {
  return {
    id,
    row_kind: 'stripped_unknown',
    unknown_stripped: true,
    unknown_reason: String(unknownReason || '').trim(),
    run_number: runNumber,
    category,
    product_id: productId,
    field_key: fieldKey,
    value: null,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
    source_id: `${sourceType}-${productId}-${runNumber}-stripped-unk-${fieldKey}`,
    source_type: sourceType,
    llm_model: llmModel || '',
    validation_json: {
      valid: false,
      repairs: [],
      rejections: [{ reason_code: 'stripped_unknown', detail: { unknown_reason: String(unknownReason || '').trim(), ...detail } }],
    },
    metadata_json: {
      source: sourceType,
      row_kind: 'stripped_unknown',
      unknown_reason: String(unknownReason || '').trim(),
      run_number: runNumber,
      publish_result: { status: 'skipped', reason: 'stripped_unknown' },
      ...detail,
    },
    status: 'stripped',
    submitted_at: ranAt || '',
    updated_at: ranAt || '',
    brand: brand || '',
    model: model || '',
    variant: variant || '',
    evidence: [],
    evidence_accepted_count: 0,
    evidence_rejected_count: 0,
  };
}

function listStrippedUnknownRows({ specDb, category, limit = 200 }) {
  if (!specDb?.db?.prepare) return [];
  const rows = [];
  let nextId = -1;

  const keyRuns = specDb.db.prepare(`
    SELECT r.product_id, r.run_number, r.ran_at, r.model AS llm_model, r.response_json,
           p.brand, p.model AS product_model, p.variant
    FROM key_finder_runs r
    LEFT JOIN products p ON r.product_id = p.product_id AND r.category = p.category
    WHERE r.category = ?
    ORDER BY r.ran_at DESC
    LIMIT ?
  `).all(category, limit);

  for (const run of keyRuns) {
    const response = safeJsonParse(run.response_json, {});
    const results = response?.results && typeof response.results === 'object' ? response.results : {};
    for (const [fieldKey, result] of Object.entries(results)) {
      const reason = String(result?.unknown_reason || '').trim();
      if (!isUnknownScalarValue(result?.value, reason)) continue;
      rows.push(makeStrippedUnknownRow({
        id: nextId--,
        category,
        productId: run.product_id,
        fieldKey,
        sourceType: 'key_finder',
        runNumber: run.run_number,
        ranAt: run.ran_at,
        llmModel: run.llm_model,
        unknownReason: reason,
        confidence: result?.confidence,
        brand: run.brand,
        model: run.product_model,
        variant: run.variant,
        detail: { primary_field_key: response?.primary_field_key || null },
      }));
    }
  }

  const scalarFinders = [
    { table: 'release_date_finder_runs', sourceType: 'release_date_finder', fieldKey: 'release_date', valueKey: 'release_date' },
    { table: 'sku_finder_runs', sourceType: 'sku_finder', fieldKey: 'sku', valueKey: 'sku' },
  ];

  for (const finder of scalarFinders) {
    const finderRuns = specDb.db.prepare(`
      SELECT r.product_id, r.run_number, r.ran_at, r.model AS llm_model, r.response_json,
             p.brand, p.model AS product_model, p.variant
      FROM ${finder.table} r
      LEFT JOIN products p ON r.product_id = p.product_id AND r.category = p.category
      WHERE r.category = ?
      ORDER BY r.ran_at DESC
      LIMIT ?
    `).all(category, limit);

    for (const run of finderRuns) {
      const response = safeJsonParse(run.response_json, {});
      const reason = String(response?.unknown_reason || '').trim();
      if (!isUnknownScalarValue(response?.[finder.valueKey], reason)) continue;
      rows.push(makeStrippedUnknownRow({
        id: nextId--,
        category,
        productId: run.product_id,
        fieldKey: finder.fieldKey,
        sourceType: finder.sourceType,
        runNumber: run.run_number,
        ranAt: run.ran_at,
        llmModel: run.llm_model,
        unknownReason: reason,
        confidence: response?.confidence,
        brand: run.brand,
        model: run.product_model,
        variant: response?.variant_label || run.variant,
        detail: {
          variant_id: response?.variant_id || null,
          variant_key: response?.variant_key || null,
          variant_label: response?.variant_label || null,
        },
      }));
    }
  }

  return rows.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
}

export function registerPublisherRoutes(ctx) {
  const { jsonRes, readJsonBody, getSpecDb, broadcastWs, config, productRoot } = ctx;

  return async function handlePublisherRoutes(parts, params, method, req, res) {
    if (parts[0] !== 'publisher') return false;

    const category = parts[1];
    if (!category) { jsonRes(res, 400, { error: 'category required' }); return true; }

    const specDb = getSpecDb(category);
    if (!specDb) { jsonRes(res, 404, { error: `no db for category: ${category}` }); return true; }

    // GET /publisher/:category/candidates
    if (parts[2] === 'candidates' && method === 'GET') {
      const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(params.get('limit') || '100', 10) || 100));
      const offset = (page - 1) * limit;

      const rows = specDb.getFieldCandidatesPaginated({ limit, offset });
      // WHY: Augment each row with per-row evidence refs + accepted/rejected
      // counts so the publisher panel can render the Evid ✓ / ✗ count chips
      // and the row-drawer URL lists without a second roundtrip per row.
      // field_candidate_evidence is the SQL projection of metadata_json.evidence_refs.
      const rowsWithEvidence = rows.map((row) => {
        const raw = specDb.listFieldCandidateEvidenceByCandidateId(row.id) || [];
        const evidence = raw.map((e) => ({
          url: e.url,
          tier: e.tier,
          confidence: e.confidence,
          http_status: e.http_status,
          accepted: e.accepted,
        }));
        const split = specDb.countFieldCandidateEvidenceSplitByCandidateId(row.id);
        return {
          ...row,
          evidence,
          evidence_accepted_count: split.accepted,
          evidence_rejected_count: split.rejected,
        };
      });
      const allStrippedUnknownRows = listStrippedUnknownRows({ specDb, category });
      const strippedUnknownRows = page === 1 ? allStrippedUnknownRows : [];
      const combinedRows = [...rowsWithEvidence, ...strippedUnknownRows]
        .sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
      const total = specDb.countFieldCandidates();
      const stats = specDb.getFieldCandidatesStats();

      jsonRes(res, 200, {
        rows: combinedRows,
        total: total + allStrippedUnknownRows.length,
        page,
        limit,
        stats: { ...stats, total: stats.total + allStrippedUnknownRows.length, unknown_stripped: allStrippedUnknownRows.length },
      });
      return true;
    }

    // GET /publisher/:category/stats
    if (parts[2] === 'stats' && method === 'GET') {
      const stats = specDb.getFieldCandidatesStats();
      jsonRes(res, 200, stats);
      return true;
    }

    // GET /publisher/:category/reconcile (dry-run preview)
    if (parts[2] === 'reconcile' && method === 'GET') {
      const threshold = config?.publishConfidenceThreshold ?? 0.7;
      const result = reconcileThreshold({
        specDb, category, threshold,
        productRoot: productRoot || '.workspace/products',
        dryRun: true,
      });
      jsonRes(res, 200, { threshold, ...result });
      return true;
    }

    // POST /publisher/:category/reconcile (apply)
    if (parts[2] === 'reconcile' && method === 'POST') {
      const threshold = config?.publishConfidenceThreshold ?? 0.7;
      const root = productRoot || '.workspace/products';

      let op = null;
      try {
        op = registerOperation({
          type: 'publisher-reconcile',
          category,
          stages: ['Scanning', 'Evaluating', 'Complete'],
          broadcastWs,
        });
      } catch { /* operations registry unavailable — proceed without progress */ }

      try {
        const result = reconcileThreshold({
          specDb, category, threshold,
          productRoot: root,
          dryRun: false,
          onStageAdvance: (stage) => {
            if (op) updateStage({ id: op.id, stageName: stage });
          },
        });

        if (op) completeOperation({ id: op.id });

        if (broadcastWs) {
          emitDataChange({
            broadcastWs,
            event: 'publisher-reconcile',
            category,
          });
        }

        jsonRes(res, 200, { operation_id: op?.id ?? null, result });
      } catch (err) {
        if (op) failOperation({ id: op.id, error: err.message });
        jsonRes(res, 500, { error: 'reconciliation_failed', message: err.message });
      }
      return true;
    }

    // GET /publisher/:category/published/:productId
    if (parts[2] === 'published' && parts[3] && method === 'GET') {
      const productId = parts[3];
      const allCandidates = specDb.getAllFieldCandidatesByProduct(productId);
      const fields = {};
      // WHY: For evidence-backed fields, field_candidates (status='resolved')
      // is the SSOT. Variant-backed fields (colors/editions) are handled
      // below via the variants table.
      for (const row of allCandidates) {
        if (row.status !== 'resolved') continue;
        fields[row.field_key] = {
          value: decodeFieldValue(row.field_key, row.value),
          confidence: row.confidence,
          source: row.metadata_json?.source || 'pipeline',
          resolved_at: row.updated_at,
        };
      }

      // WHY: Variants are directly connected to published for colors/editions
      // (per CEF rules). The variants table is the SSOT for these two fields
      // — not field_candidates — so that delete-all-runs (which strips
      // candidates but preserves variants) leaves published state intact.
      // Combos stay intact; an edition's combo cascades into colors natively.
      if (specDb.variants) {
        const activeVariants = specDb.variants.listActive(productId) || [];
        const { colors: variantColors, editions: variantEditions } = computePublishedArraysFromVariants(activeVariants);
        const now = new Date().toISOString();

        if (variantColors.length > 0) {
          fields.colors = {
            value: variantColors,
            confidence: aggregateCefFieldConfidence(specDb, productId, 'colors', activeVariants),
            source: 'variant_registry',
            resolved_at: fields.colors?.resolved_at || now,
          };
        } else {
          delete fields.colors;
        }

        if (variantEditions.length > 0) {
          fields.editions = {
            value: variantEditions,
            confidence: aggregateCefFieldConfidence(specDb, productId, 'editions', activeVariants),
            source: 'variant_registry',
            resolved_at: fields.editions?.resolved_at || now,
          };
        } else {
          delete fields.editions;
        }
      }

      jsonRes(res, 200, { product_id: productId, fields });
      return true;
    }

    return false;
  };
}
