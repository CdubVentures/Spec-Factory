/**
 * Publisher GUI routes.
 *
 * GET  /publisher/:category/candidates?page=1&limit=100
 * GET  /publisher/:category/stats
 * GET  /publisher/:category/published/:productId
 * GET  /publisher/:category/reconcile          (dry-run preview)
 * POST /publisher/:category/reconcile          (apply reconciliation)
 */

import fs from 'node:fs';
import path from 'node:path';
import { reconcileThreshold } from '../publish/reconcileThreshold.js';
import { registerOperation, updateStage, completeOperation, failOperation } from '../../../core/operations/operationsRegistry.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

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
      for (const row of allCandidates) {
        if (row.status !== 'resolved') continue;
        fields[row.field_key] = {
          value: row.value,
          confidence: row.confidence,
          source: row.metadata_json?.source || 'pipeline',
          resolved_at: row.updated_at,
        };
      }

      // WHY: Variant-derived fields (colors, editions) are authoritative from
      // product.json, not from candidate resolved status. Overlay them so the
      // published endpoint reflects the variants table SSOT.
      try {
        const pjPath = path.join(defaultProductRoot(), productId, 'product.json');
        const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
        if (pj.fields) {
          for (const [key, field] of Object.entries(pj.fields)) {
            if (field?.source === 'variant_registry') {
              fields[key] = {
                value: field.value,
                confidence: field.confidence ?? 1.0,
                source: 'variant_registry',
                resolved_at: field.resolved_at || '',
              };
            }
          }
        }
      } catch { /* product.json may not exist */ }

      jsonRes(res, 200, { product_id: productId, fields });
      return true;
    }

    return false;
  };
}
