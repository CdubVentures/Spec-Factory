import { runProduct } from './runProduct.js';
import { EventLogger } from '../logger.js';

export async function runUntilComplete({
  storage,
  config,
  s3key,
  mode,
  specDb = null,
  jobOverride = null,
}) {
  const job = jobOverride || (await storage.readJson(s3key));
  const category = job.category || 'mouse';
  const productId = job.productId;
  if (!productId) {
    throw new Error(`Job at ${s3key} is missing productId`);
  }
  const logger = new EventLogger({
    storage,
    context: { category, productId },
  });
  logger.info('run_started', { reason: 'run_until_complete_started' });

  const roundResult = await runProduct({
    storage,
    config,
    s3Key: s3key,
    jobOverride: jobOverride || null,
    roundContext: { round: 0 },
  });

  const urlsCrawled = roundResult.crawlResults?.length ?? 0;
  const urlsSuccessful = roundResult.crawlResults?.filter((r) => r.success).length ?? 0;

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
