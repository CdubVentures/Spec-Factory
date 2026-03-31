import { toPosixKey } from '../s3/storage.js';
import { OUTPUT_KEY_PREFIX } from '../shared/storageKeyPrefixes.js';

export async function rebuildCategoryIndex({ storage, config, category, specDb = null }) {
  // WHY: SQL is the source of truth for products — no fixture scan needed.
  const productRows = specDb ? specDb.getAllProducts() : [];
  const rows = [];

  for (const row of productRows) {
    const productId = String(row.product_id || '').trim();
    if (!productId) continue;
    const latestSummaryKey = toPosixKey(
      OUTPUT_KEY_PREFIX,
      category,
      productId,
      'latest',
      'summary.json'
    );

    const latestSummary = specDb
      ? specDb.getSummaryForProduct(productId)
      : (await storage.readJsonOrNull(latestSummaryKey));

    rows.push({
      productId,
      inputKey: '',
      latestSummaryKey,
      validated: latestSummary?.validated ?? null,
      reason: latestSummary?.reason ?? null,
      runId: latestSummary?.runId ?? null,
      confidence: latestSummary?.confidence ?? null,
      completeness_required_percent: latestSummary?.completeness_required_percent ?? null,
      coverage_overall_percent: latestSummary?.coverage_overall_percent ?? null,
      updated_at: latestSummary?.generated_at ?? null
    });
  }

  const index = {
    category,
    generated_at: new Date().toISOString(),
    total_products: rows.length,
    items: rows
  };

  const indexKey = toPosixKey(OUTPUT_KEY_PREFIX, category, '_index', 'latest.json');
  await storage.writeObject(indexKey, Buffer.from(JSON.stringify(index, null, 2), 'utf8'), {
    contentType: 'application/json'
  });

  return {
    indexKey,
    totalProducts: rows.length,
    items: rows
  };
}
