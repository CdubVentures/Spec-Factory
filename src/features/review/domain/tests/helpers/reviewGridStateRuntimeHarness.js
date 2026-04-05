import { createReviewGridStateRuntime } from '../../reviewGridStateRuntime.js';
import { resolveExplicitPositiveId, resolveGridFieldStateForMutation } from '../../../api/mutationResolvers.js';
import { SpecDb } from '../../../../../db/specDb.js';
export { createReviewGridStateRuntime, resolveExplicitPositiveId, resolveGridFieldStateForMutation, SpecDb };

// Shared runtime/db fixtures for reviewGridStateRuntime test slices.

export function makePreparedStatement({ get = () => null, all = () => [], run = () => ({ changes: 0 }) } = {}) {
  return { get, all, run };
}

export const CATEGORY = '_test_grid_runtime';

export async function createTempSpecDb() {
  const specDb = new SpecDb({ dbPath: ':memory:', category: CATEGORY });
  return { tempRoot: null, specDb };
}

export async function cleanupTempSpecDb(tempRoot, specDb) {
  try { specDb?.close?.(); } catch { /* best-effort */ }
  if (!tempRoot) return;
  const { default: fs } = await import('node:fs/promises');
  await fs.rm(tempRoot, { recursive: true, force: true });
}

export async function withTempSpecDb(runTest) {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    return await runTest(specDb);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
}

export function seedItemFieldState(specDb, {
  productId = 'mouse-1',
  fieldKey = 'dpi',
  value = '16000',
  confidence = 0.9,
  source = 'pipeline',
  acceptedCandidateId = null,
  needsAiReview = true,
  aiReviewComplete = false,
  overridden = false,
} = {}) {
  specDb.upsertItemFieldState({
    productId, fieldKey, value, confidence, source,
    acceptedCandidateId, overridden, needsAiReview, aiReviewComplete,
  });
  return specDb.db.prepare(
    'SELECT * FROM item_field_state WHERE category = ? AND product_id = ? AND field_key = ? LIMIT 1'
  ).get(CATEGORY, productId, fieldKey);
}

export function makeRuntime() {
  return createReviewGridStateRuntime({
    resolveExplicitPositiveId,
    resolveGridFieldStateForMutation,
  });
}

/* --- ensureGridKeyReviewState --- */
