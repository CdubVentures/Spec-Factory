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
      const total = specDb.countFieldCandidates();
      const stats = specDb.getFieldCandidatesStats();

      jsonRes(res, 200, { rows, total, page, limit, stats });
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
