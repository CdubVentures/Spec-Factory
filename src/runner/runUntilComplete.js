import { runProduct } from '../pipeline/runProduct.js';
import { configValue } from '../shared/settingsAccessor.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { EventLogger } from '../logger.js';
import {
  markQueueRunning,
  recordQueueRunResult,
  upsertQueueProduct
} from '../queue/queueState.js';

// WHY: Extract per-field history objects for crash recovery continuity.
export function buildPreviousFieldHistories(roundResult) {
  const fields = roundResult?.needSet?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return {};
  const result = {};
  for (const f of fields) {
    if (f.field_key && f.history) result[f.field_key] = f.history;
  }
  return result;
}

// Re-exports for backward compatibility (consumed by tests and other modules)
export { normalizeFieldContractToken, calcProgressDelta, isIdentityOrEditorialField } from './convergenceHelpers.js';

export async function runUntilComplete({
  storage,
  config,
  s3key,
  mode,
  specDb = null,
}) {
  const job = await storage.readJson(s3key);
  const category = job.category || 'mouse';
  const productId = job.productId;
  if (!productId) {
    throw new Error(`Job at ${s3key} is missing productId`);
  }
  const logger = new EventLogger({
    storage,
    runtimeEventsKey: configValue(config, 'runtimeEventsKey'),
    context: { category, productId },
  });
  logger.info('queue_transition', { from: 'none', to: 'pending', reason: 'run_until_complete_started' });

  await upsertQueueProduct({
    storage, category, productId, s3key,
    patch: { status: 'pending', next_action_hint: 'crawl_pass' },
  });

  await markQueueRunning({ storage, category, productId, s3key, nextActionHint: 'crawl_pass' });
  logger.info('queue_transition', { from: 'pending', to: 'running', round: 0, next_action_hint: 'crawl_pass' });

  const roundResult = await runProduct({
    storage,
    config,
    s3Key: s3key,
    jobOverride: null,
    roundContext: { round: 0 },
  });

  await recordQueueRunResult({
    storage, category, s3key,
    result: roundResult,
    roundResult: { exhausted: false, budgetExceeded: false, nextActionHint: 'none' },
  });

  const urlsCrawled = roundResult.crawlResults?.length ?? 0;
  const urlsSuccessful = roundResult.crawlResults?.filter((r) => r.success).length ?? 0;

  await upsertQueueProduct({
    storage, category, productId, s3key,
    patch: { status: 'complete', next_action_hint: 'none' },
  });
  logger.info('queue_transition', { from: 'running', to: 'complete', reason: 'crawl_pass_done' });

  await logger.flush();

  return {
    s3key,
    productId,
    category,
    mode,
    max_rounds: 1,
    round_count: 1,
    complete: true,
    exhausted: false,
    needs_manual: false,
    stop_reason: 'crawl_pass_done',
    final_run_id: roundResult.runId || null,
    final_summary: null,
    rounds: [{
      round: 0,
      run_id: roundResult.runId,
      urls_crawled: urlsCrawled,
      urls_successful: urlsSuccessful,
    }],
  };
}
