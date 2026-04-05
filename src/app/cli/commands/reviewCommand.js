export function createReviewCommand({
  asBool,
  parseJsonArg,
  openSpecDbForCategory,
  buildReviewLayout,
  buildReviewQueue,
  buildProductReviewPayload,
  writeProductReviewArtifacts,
  writeCategoryReviewArtifacts,
  startReviewQueueWebSocket,
  setOverrideFromCandidate,
  approveGreenOverrides,
  setManualOverride,
  finalizeOverrides,
  buildReviewMetrics,
  appendReviewSuggestion,
}) {
  return async function commandReview(config, storage, args) {
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const action = String(args._?.[0] || '').trim().toLowerCase();
    if (!action) {
      throw new Error('review requires a subcommand: layout|queue|product|build|ws-queue|override|approve-greens|manual-override|finalize|metrics|suggest');
    }

    if (action === 'layout') {
      const specDb = await openSpecDbForCategory(config, category);
      let studioMap = null;
      try {
        const row = specDb?.getFieldStudioMap?.();
        studioMap = row ? JSON.parse(row.map_json) : null;
      } catch { /* no studio map available */ }
      const layout = await buildReviewLayout({ storage, config, category, studioMap });
      try { specDb?.close(); } catch { /* no-op */ }
      return {
        command: 'review',
        action,
        ...layout
      };
    }

    if (action === 'queue') {
      const status = String(args.status || 'needs_review').trim().toLowerCase();
      const limit = Math.max(1, Number.parseInt(String(args.limit || '100'), 10) || 100);
      const specDb = await openSpecDbForCategory(config, category);
      let items;
      try {
        items = await buildReviewQueue({
          storage,
          config,
          category,
          status,
          limit,
          specDb
        });
      } finally {
        try { specDb?.close(); } catch { /* no-op */ }
      }
      return {
        command: 'review',
        action,
        category,
        status,
        count: items.length,
        items
      };
    }

    if (action === 'product') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review product requires --product-id <id>');
      }
      const includeCandidates = !asBool(args['without-candidates'], false) && !asBool(args['selected-only'], false);
      const specDb = await openSpecDbForCategory(config, category);
      let payload;
      try {
        payload = await buildProductReviewPayload({
          storage,
          config,
          category,
          productId,
          includeCandidates,
          specDb
        });
      } finally {
        try { specDb?.close(); } catch { /* no-op */ }
      }
      return {
        command: 'review',
        action,
        category,
        ...payload
      };
    }

    if (action === 'build') {
      const productId = String(args['product-id'] || '').trim();
      const status = String(args.status || 'needs_review').trim().toLowerCase();
      const limit = Math.max(1, Number.parseInt(String(args.limit || '500'), 10) || 500);
      const product = productId
        ? await writeProductReviewArtifacts({
          storage,
          config,
          category,
          productId
        })
        : null;
      const queue = await writeCategoryReviewArtifacts({
        storage,
        config,
        category,
        status,
        limit
      });
      return {
        command: 'review',
        action,
        category,
        product: product || null,
        queue
      };
    }

    if (action === 'ws-queue') {
      const status = String(args.status || 'needs_review').trim().toLowerCase();
      const limit = Math.max(1, Number.parseInt(String(args.limit || '200'), 10) || 200);
      const host = String(args.host || '127.0.0.1').trim() || '127.0.0.1';
      const port = Math.max(1, Number.parseInt(String(args.port || '8789'), 10) || 8789);
      const pollSeconds = Math.max(1, Number.parseInt(String(args['poll-seconds'] || '5'), 10) || 5);
      const durationSeconds = Math.max(0, Number.parseInt(String(args['duration-seconds'] || '0'), 10) || 0);
      const wsServer = await startReviewQueueWebSocket({
        storage,
        config,
        category,
        status,
        limit,
        host,
        port,
        pollSeconds
      });

      let stopReason = 'duration_elapsed';
      if (durationSeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000));
      } else {
        stopReason = await new Promise((resolve) => {
          const onSigInt = () => {
            process.off('SIGTERM', onSigTerm);
            resolve('signal:SIGINT');
          };
          const onSigTerm = () => {
            process.off('SIGINT', onSigInt);
            resolve('signal:SIGTERM');
          };
          process.once('SIGINT', onSigInt);
          process.once('SIGTERM', onSigTerm);
        });
      }
      await wsServer.stop();
      return {
        command: 'review',
        action,
        category,
        status,
        limit,
        host,
        port: wsServer.port,
        poll_seconds: wsServer.poll_seconds,
        ws_url: wsServer.ws_url,
        health_url: wsServer.health_url,
        stop_reason: stopReason
      };
    }

    if (action === 'override') {
      const productId = String(args['product-id'] || '').trim();
      const field = String(args.field || '').trim();
      const candidateId = String(args['candidate-id'] || '').trim();
      if (!productId || !field || !candidateId) {
        throw new Error('review override requires --product-id --field --candidate-id');
      }
      const specDb = await openSpecDbForCategory(config, category);
      let result;
      try {
        result = await setOverrideFromCandidate({
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
      } finally {
        try { specDb?.close(); } catch { /* no-op */ }
      }
      return {
        command: 'review',
        action,
        category,
        ...result
      };
    }

    if (action === 'approve-greens') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review approve-greens requires --product-id <id>');
      }
      const specDb = await openSpecDbForCategory(config, category);
      let result;
      try {
        result = await approveGreenOverrides({
          storage,
          config,
          category,
          productId,
          reason: String(args.reason || '').trim(),
          reviewer: String(args.reviewer || '').trim(),
          specDb
        });
      } finally {
        try { specDb?.close(); } catch { /* no-op */ }
      }
      return {
        command: 'review',
        action,
        category,
        product_id: productId,
        ...result
      };
    }

    if (action === 'manual-override') {
      const productId = String(args['product-id'] || '').trim();
      const field = String(args.field || '').trim();
      const value = String(args.value || '').trim();
      if (!productId || !field || !value) {
        throw new Error('review manual-override requires --product-id --field --value');
      }
      const specDb = await openSpecDbForCategory(config, category);
      let result;
      try {
        result = await setManualOverride({
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
      } finally {
        try { specDb?.close(); } catch { /* no-op */ }
      }
      return {
        command: 'review',
        action,
        category,
        ...result
      };
    }

    if (action === 'finalize') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error('review finalize requires --product-id <id>');
      }
      const specDb = await openSpecDbForCategory(config, category);
      let result;
      try {
        result = await finalizeOverrides({
          storage,
          config,
          category,
          productId,
          applyOverrides: asBool(args.apply, false),
          saveAsDraft: asBool(args.draft, false),
          reviewer: String(args.reviewer || '').trim(),
          specDb
        });
      } finally {
        try { specDb?.close(); } catch { /* no-op */ }
      }
      return {
        command: 'review',
        action,
        category,
        ...result
      };
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

    if (action === 'suggest') {
      const type = String(args.type || '').trim().toLowerCase();
      const field = String(args.field || '').trim();
      const value = String(args.value || '').trim();
      if (!type || !field || !value) {
        throw new Error('review suggest requires --type --field --value');
      }
      let suggestSpecDb = null;
      try { suggestSpecDb = await openSpecDbForCategory(config, category); } catch { /* optional */ }
      const result = await appendReviewSuggestion({
        config,
        category,
        type,
        specDb: suggestSpecDb,
        payload: {
          product_id: String(args['product-id'] || '').trim(),
          field,
          value,
          canonical: String(args.canonical || '').trim(),
          reason: String(args.reason || '').trim(),
          reviewer: String(args.reviewer || '').trim(),
          evidence: {
            url: String(args['evidence-url'] || '').trim(),
            quote: String(args['evidence-quote'] || '').trim(),
            quote_span: parseJsonArg('evidence-quote-span', args['evidence-quote-span'], null),
            snippet_id: String(args['evidence-snippet-id'] || '').trim(),
            snippet_hash: String(args['evidence-snippet-hash'] || '').trim()
          }
        }
      });
      try { suggestSpecDb?.close(); } catch { /* no-op */ }
      return {
        command: 'review',
        action,
        category,
        ...result
      };
    }

    throw new Error(`Unknown review subcommand: ${action}`);
  };
}
