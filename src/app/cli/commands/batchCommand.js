import { slug, filterKeysByBrand } from '../cliHelpers.js';

export function createBatchCommand({
  loadCategoryConfig,
  loadSourceIntel,
  rankBatchWithBandit,
  runProduct,
  openSpecDbForCategory,
}) {
  async function runWithConcurrency(items, concurrency, worker) {
    const results = [];
    let index = 0;

    async function runWorker() {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) {
          return;
        }
        results[current] = await worker(items[current], current);
      }
    }

    const count = Math.max(1, concurrency);
    await Promise.all(Array.from({ length: count }, () => runWorker()));
    return results;
  }

  function normalizeBatchStrategy(value) {
    const token = String(value || '').trim().toLowerCase();
    if (token === 'explore' || token === 'exploit' || token === 'mixed' || token === 'bandit') {
      return token;
    }
    return 'mixed';
  }

  async function collectBatchMetadata({ storage, config, category, key, specDb = null }) {
    const job = await storage.readJsonOrNull(key);
    const productId = job?.productId;
    const brand = String(job?.identityLock?.brand || '').trim().toLowerCase();

    if (!productId) {
      return {
        key,
        productId: '',
        brand,
        brandKey: slug(brand),
        hasHistory: false,
        validated: false,
        confidence: 0,
        missingCriticalCount: 0,
        fieldsBelowPassCount: 0,
        contradictionCount: 0,
        hypothesisQueueCount: 0
      };
    }

    const summary = specDb ? specDb.getSummaryForProduct(productId) : null;
    return {
      key,
      productId,
      brand,
      brandKey: slug(brand),
      hasHistory: Boolean(summary),
      validated: Boolean(summary?.validated),
      confidence: Number.parseFloat(String(summary?.confidence || 0)) || 0,
      missingCriticalCount: (summary?.critical_fields_below_pass_target || []).length,
      fieldsBelowPassCount: (summary?.fields_below_pass_target || []).length,
      contradictionCount: summary?.constraint_analysis?.contradiction_count || 0,
      hypothesisQueueCount: (summary?.hypothesis_queue || []).length
    };
  }

  function buildBrandRewardIndex(domains) {
    const buckets = new Map();

    for (const domain of Object.values(domains || {})) {
      for (const [brandKey, brandEntry] of Object.entries(domain?.per_brand || {})) {
        if (!buckets.has(brandKey)) {
          buckets.set(brandKey, {
            weighted: 0,
            weight: 0
          });
        }
        const bucket = buckets.get(brandKey);
        const attempts = Math.max(1, Number.parseFloat(String(brandEntry?.attempts || 0)) || 1);
        const fieldRewardStrength = Number.parseFloat(String(brandEntry?.field_reward_strength || 0)) || 0;
        const plannerScore = Number.parseFloat(String(brandEntry?.planner_score || 0)) || 0;
        const blended = (fieldRewardStrength * 0.7) + ((plannerScore - 0.5) * 0.3);
        bucket.weighted += blended * attempts;
        bucket.weight += attempts;
      }
    }

    const index = {};
    for (const [brandKey, bucket] of buckets.entries()) {
      index[brandKey] = bucket.weight > 0
        ? Number.parseFloat((bucket.weighted / bucket.weight).toFixed(6))
        : 0;
    }
    return index;
  }

  function scoreForExploit(meta) {
    let score = 0;
    score += meta.validated ? 2 : 0;
    score += meta.confidence || 0;
    score += meta.hasHistory ? 0.5 : 0;
    score -= (meta.missingCriticalCount || 0) * 0.25;
    return score;
  }

  function scoreForExplore(meta) {
    let score = 0;
    score += meta.hasHistory ? 0 : 2;
    score += (meta.missingCriticalCount || 0) * 0.6;
    score += meta.validated ? 0 : 0.8;
    score += Math.max(0, 1 - (meta.confidence || 0));
    return score;
  }

  function interleaveLists(left, right) {
    const output = [];
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i += 1) {
      if (i < left.length) {
        output.push(left[i]);
      }
      if (i < right.length) {
        output.push(right[i]);
      }
    }
    return output;
  }

  function orderBatchKeysByStrategy(keys, metadata, strategy, options = {}) {
    const rows = keys.map((key) => metadata.get(key)).filter(Boolean);
    if (strategy === 'bandit') {
      const ranked = rankBatchWithBandit({
        metadataRows: rows,
        brandRewardIndex: options.brandRewardIndex || {},
        seed: options.seed || new Date().toISOString().slice(0, 10),
        mode: 'balanced'
      });
      return {
        orderedKeys: ranked.orderedKeys,
        diagnostics: ranked.scored
      };
    }

    if (strategy === 'exploit') {
      return {
        orderedKeys: rows
        .sort((a, b) => scoreForExploit(b) - scoreForExploit(a) || a.key.localeCompare(b.key))
        .map((row) => row.key),
        diagnostics: []
      };
    }

    if (strategy === 'explore') {
      return {
        orderedKeys: rows
        .sort((a, b) => scoreForExplore(b) - scoreForExplore(a) || a.key.localeCompare(b.key))
        .map((row) => row.key),
        diagnostics: []
      };
    }

    const exploit = rows
      .slice()
      .sort((a, b) => scoreForExploit(b) - scoreForExploit(a) || a.key.localeCompare(b.key));
    const explore = rows
      .slice()
      .sort((a, b) => scoreForExplore(b) - scoreForExplore(a) || a.key.localeCompare(b.key));

    const seen = new Set();
    const mixed = [];
    for (const row of interleaveLists(exploit, explore)) {
      if (seen.has(row.key)) {
        continue;
      }
      seen.add(row.key);
      mixed.push(row.key);
    }
    return {
      orderedKeys: mixed,
      diagnostics: []
    };
  }

  async function commandRunBatch(config, storage, args) {
    const category = args.category || 'mouse';
    const specDb = await openSpecDbForCategory?.(config, category) ?? null;
    try {
    const categoryConfig = await loadCategoryConfig(category, { storage, config });
    // WHY: SQL is the source of truth for products — no fixture scan needed.
    const allProducts = specDb ? specDb.getAllProducts() : [];
    const allKeys = allProducts.map((p) => p.product_id);
    const keys = await filterKeysByBrand(storage, allKeys, args.brand);
    const strategy = normalizeBatchStrategy(args.strategy || 'bandit');
    const metadataRows = await runWithConcurrency(keys, config.concurrency, async (key) =>
      collectBatchMetadata({ storage, config, category, key, specDb })
    );
    const metadataByKey = new Map(metadataRows.map((row) => [row.key, row]));
    const intel = await loadSourceIntel({ storage, config, category });
    const brandRewardIndex = buildBrandRewardIndex(intel.data.domains || {});
    const schedule = orderBatchKeysByStrategy(keys, metadataByKey, strategy, {
      brandRewardIndex,
      seed: `${category}:${new Date().toISOString().slice(0, 10)}`
    });
    const orderedKeys = schedule.orderedKeys;

    const runs = await runWithConcurrency(orderedKeys, config.concurrency, async (key) => {
      try {
        const result = await runProduct({ storage, config, s3Key: key });
        return {
          key,
          productId: result.productId,
          runId: result.runId,
          urls_crawled: result.crawlResults?.length ?? 0,
          urls_successful: result.crawlResults?.filter((r) => r.success).length ?? 0
        };
      } catch (error) {
        return {
          key,
          error: error.message
        };
      }
    });

    return {
      command: 'run-batch',
      category,
      brand: args.brand || null,
      strategy,
      total_inputs: allKeys.length,
      selected_inputs: keys.length,
      concurrency: config.concurrency,
      scheduled_order: orderedKeys,
      bandit_preview: strategy === 'bandit'
        ? (schedule.diagnostics || []).slice(0, 25).map((row) => ({
          key: row.key,
          productId: row.productId,
          bandit_score: row.bandit_score,
          thompson: row.thompson,
          ucb: row.ucb,
          info_need: row.info_need,
          mean_reward: row.mean_reward,
          brand_reward: row.brandReward
        }))
        : [],
      runs
    };
    } finally {
      try { specDb?.close(); } catch { /* */ }
    }
  }

  return {
    commandRunBatch,
  };
}
