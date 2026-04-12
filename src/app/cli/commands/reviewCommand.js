export function createReviewCommand({
  asBool,
  parseJsonArg,
  withSpecDb,
  buildReviewLayout,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
  setOverrideFromCandidate,
  approveGreenOverrides,
  setManualOverride,
  finalizeOverrides,
  buildReviewMetrics,
}) {
  return async function commandReview(config, storage, args) {
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const action = String(args._?.[0] || '').trim().toLowerCase();
    if (!action) {
      throw new Error('review requires a subcommand: layout|product|build|override|approve-greens|manual-override|finalize|metrics');
    }

    if (action === 'layout') {
      return withSpecDb(config, category, async (specDb) => {
        let studioMap = null;
        try {
          const row = specDb?.getFieldStudioMap?.();
          studioMap = row ? JSON.parse(row.map_json) : null;
        } catch { /* no studio map available */ }
        const layout = await buildReviewLayout({ storage, config, category, studioMap });
        return {
          command: 'review',
          action,
          ...layout
        };
      });
    }

    if (action === 'product') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review product requires --product-id <id>');
      }
      const includeCandidates = !asBool(args['without-candidates'], false) && !asBool(args['selected-only'], false);
      return withSpecDb(config, category, async (specDb) => {
        const payload = await buildProductReviewPayload({
          storage,
          config,
          category,
          productId,
          includeCandidates,
          specDb
        });
        return {
          command: 'review',
          action,
          category,
          ...payload
        };
      });
    }

    if (action === 'build') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review build requires --product-id <id>');
      }
      return withSpecDb(config, category, async (specDb) => {
        const product = await writeProductReviewArtifacts({
          storage,
          config,
          category,
          productId,
          specDb
        });
        return {
          command: 'review',
          action,
          category,
          product
        };
      });
    }

    if (action === 'override') {
      const productId = String(args['product-id'] || '').trim();
      const field = String(args.field || '').trim();
      const candidateId = String(args['candidate-id'] || '').trim();
      if (!productId || !field || !candidateId) {
        throw new Error('review override requires --product-id --field --candidate-id');
      }
      return withSpecDb(config, category, async (specDb) => {
        const result = await setOverrideFromCandidate({
          storage,
          config,
          category,
          productId,
          field,
          candidateId,
          reason: String(args.reason || '').trim(),
          reviewer: String(args.reviewer || '').trim(),
          specDb
        });
        return {
          command: 'review',
          action,
          category,
          ...result
        };
      });
    }

    if (action === 'approve-greens') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review approve-greens requires --product-id <id>');
      }
      return withSpecDb(config, category, async (specDb) => {
        const result = await approveGreenOverrides({
          storage,
          config,
          category,
          productId,
          reason: String(args.reason || '').trim(),
          reviewer: String(args.reviewer || '').trim(),
          specDb
        });
        return {
          command: 'review',
          action,
          category,
          product_id: productId,
          ...result
        };
      });
    }

    if (action === 'manual-override') {
      const productId = String(args['product-id'] || '').trim();
      const field = String(args.field || '').trim();
      const value = String(args.value || '').trim();
      if (!productId || !field || !value) {
        throw new Error('review manual-override requires --product-id --field --value');
      }
      return withSpecDb(config, category, async (specDb) => {
        const result = await setManualOverride({
          storage,
          config,
          category,
          productId,
          field,
          value,
          reason: String(args.reason || '').trim(),
          reviewer: String(args.reviewer || '').trim(),
          evidence: {
            url: String(args['evidence-url'] || '').trim(),
            quote: String(args['evidence-quote'] || '').trim(),
            quote_span: parseJsonArg('evidence-quote-span', args['evidence-quote-span'], null),
            snippet_id: String(args['evidence-snippet-id'] || '').trim(),
            snippet_hash: String(args['evidence-snippet-hash'] || '').trim(),
            source_id: String(args['evidence-source-id'] || '').trim(),
            retrieved_at: String(args['evidence-retrieved-at'] || '').trim()
          },
          specDb
        });
        return {
          command: 'review',
          action,
          category,
          ...result
        };
      });
    }

    if (action === 'finalize') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review finalize requires --product-id <id>');
      }
      return withSpecDb(config, category, async (specDb) => {
        const result = await finalizeOverrides({
          storage,
          config,
          category,
          productId,
          applyOverrides: asBool(args.apply, false),
          saveAsDraft: asBool(args.draft, false),
          reviewer: String(args.reviewer || '').trim(),
          specDb
        });
        return {
          command: 'review',
          action,
          category,
          ...result
        };
      });
    }

    if (action === 'metrics') {
      const windowHours = Math.max(1, Number.parseInt(String(args['window-hours'] || '24'), 10) || 24);
      const result = await buildReviewMetrics({
        config,
        category,
        windowHours
      });
      return {
        command: 'review',
        action,
        ...result
      };
    }

    throw new Error(`Unknown review subcommand: ${action}`);
  };
}
