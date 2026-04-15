import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { deleteCandidateBySourceId, deleteAllCandidatesForField } from '../domain/deleteCandidate.js';

/**
 * DELETE /review/:category/candidates/:productId/:fieldKey/:sourceId — single
 * DELETE /review/:category/candidates/:productId/:fieldKey             — all for field
 */
export async function handleCandidateDeletionRoute({ parts, method, req, res, context }) {
  if (!Array.isArray(parts) || parts[0] !== 'review' || parts[2] !== 'candidates' || method !== 'DELETE') {
    return false;
  }

  const { jsonRes, getSpecDb, broadcastWs, config } = context;
  const productRoot = context.productRoot || defaultProductRoot();
  const category = parts[1];

  const specDb = getSpecDb(category);
  if (!specDb) {
    jsonRes(res, 404, { error: 'no_spec_db', message: `No SpecDb for ${category}` });
    return true;
  }

  const productId = parts[3];
  const fieldKey = parts[4];
  if (!productId || !fieldKey) {
    jsonRes(res, 400, { error: 'missing_params', message: 'productId and fieldKey are required' });
    return true;
  }

  const sourceId = parts[5] || null;

  try {
    let payload;
    if (sourceId) {
      // Single candidate delete
      payload = deleteCandidateBySourceId({
        specDb, category, productId, fieldKey, sourceId, config, productRoot,
      });
    } else {
      // Delete all candidates for field
      payload = deleteAllCandidatesForField({
        specDb, category, productId, fieldKey, config, productRoot,
      });
    }

    emitDataChange({
      broadcastWs,
      event: 'candidate-deleted',
      category,
      meta: { productId, fieldKey, sourceId },
    });

    jsonRes(res, 200, { ok: true, ...payload });
    return true;
  } catch (err) {
    jsonRes(res, 500, { error: 'candidate_delete_failed', message: err.message });
    return true;
  }
}
