import { INPUT_KEY_PREFIX } from '../../../shared/storageKeyPrefixes.js';

export function createQueueCommand({
  slug,
  toPosixKey,
  parseCsvList,
  parseJsonArg,
  parseQueuePriority,
  asBool,
  ingestCsvFile,
  upsertQueueProduct,
  syncQueueFromInputs,
  listQueueProducts,
  loadQueueState,
  clearQueueByStatus,
}) {
  return async function commandQueue(config, storage, args) {
    const category = String(args.category || 'mouse').trim() || 'mouse';
    const action = String(args._?.[0] || '').trim().toLowerCase();
    if (!action) {
      throw new Error('queue requires a subcommand: add|add-batch|list|stats|retry|pause|clear');
    }

    if (action === 'add') {
      const brand = String(args.brand || '').trim();
      const model = String(args.model || '').trim();
      const variant = String(args.variant || '').trim();
      const productId = String(
        args['product-id'] || [category, slug(brand), slug(model), slug(variant)].filter(Boolean).join('-')
      ).trim();
      if (!productId) {
        throw new Error('queue add requires --product-id or --brand/--model');
      }

      const s3key = String(
        args.s3key || toPosixKey(INPUT_KEY_PREFIX, category, 'products', `${productId}.json`)
      ).trim();
      if (!s3key) {
        throw new Error('queue add could not resolve s3key');
      }

      const hasJobPayload = await storage.objectExists(s3key);
      if (!hasJobPayload) {
        if (!brand || !model) {
          throw new Error('queue add requires an existing --s3key job or --brand/--model to create one');
        }
        const identityLock = {
          brand,
          model,
          variant,
          sku: String(args.sku || '').trim(),
          mpn: String(args.mpn || '').trim(),
          gtin: String(args.gtin || '').trim()
        };
        const job = {
          productId,
          category,
          identityLock,
          seedUrls: parseCsvList(args['seed-urls']),
          anchors: parseJsonArg('anchors-json', args['anchors-json'], {})
        };
        const requirements = parseJsonArg('requirements-json', args['requirements-json'], null);
        if (requirements && typeof requirements === 'object') {
          job.requirements = requirements;
        }
        await storage.writeObject(
          s3key,
          Buffer.from(JSON.stringify(job, null, 2), 'utf8'),
          { contentType: 'application/json' }
        );
      }

      const priority = parseQueuePriority(args.priority, 3);
      const product = await upsertQueueProduct({
        storage,
        category,
        productId,
        s3key,
        patch: {
          status: 'pending',
          priority,
          retry_count: 0,
          next_retry_at: '',
          next_action_hint: 'fast_pass',
          priority_reason: String(args['priority-reason'] || 'manual_add').trim() || 'manual_add'
        }
      });
      return {
        command: 'queue',
        action,
        category,
        product: product.product
      };
    }

    if (action === 'add-batch') {
      const csvPath = String(args.file || args.path || '').trim();
      if (!csvPath) {
        throw new Error('queue add-batch requires --file <csv>');
      }
      const result = await ingestCsvFile({
        storage,
        config,
        category,
        csvPath,
        importsRoot: args['imports-root'] || config.importsRoot
      });
      return {
        command: 'queue',
        action,
        category,
        ...result
      };
    }

    if (action === 'list') {
      const sync = asBool(args.sync, false);
      if (sync) {
        await syncQueueFromInputs({ storage, category });
      }
      const status = String(args.status || '').trim().toLowerCase();
      const limit = Math.max(1, Number.parseInt(String(args.limit || '100'), 10) || 100);
      const rows = await listQueueProducts({
        storage,
        category,
        status,
        limit
      });
      return {
        command: 'queue',
        action,
        category,
        status: status || null,
        count: rows.length,
        products: rows
      };
    }

    if (action === 'stats') {
      const sync = asBool(args.sync, false);
      if (sync) {
        await syncQueueFromInputs({ storage, category });
      }
      const loaded = await loadQueueState({ storage, category });
      const products = loaded.state.products || {};
      return {
        command: 'queue',
        action,
        category,
        total_products: Object.keys(products).length,
        ...queueStatusSummary(products)
      };
    }

    if (action === 'retry' || action === 'pause') {
      const productId = String(args['product-id'] || '').trim();
      if (!productId) {
        throw new Error(`queue ${action} requires --product-id <id>`);
      }
      const loaded = await loadQueueState({ storage, category });
      const existing = loaded.state.products?.[productId];
      if (!existing) {
        throw new Error(`queue ${action} could not find product '${productId}'`);
      }
      const nextStatus = action === 'retry' ? 'pending' : 'paused';
      const nextActionHint = action === 'retry' ? 'retry_manual' : 'manual_pause';
      const patched = await upsertQueueProduct({
        storage,
        category,
        productId,
        s3key: String(existing.s3key || '').trim(),
        patch: {
          status: nextStatus,
          next_action_hint: nextActionHint,
          last_error: action === 'retry' ? '' : existing.last_error || '',
          retry_count: action === 'retry' ? 0 : existing.retry_count,
          next_retry_at: action === 'retry' ? '' : existing.next_retry_at
        }
      });
      return {
        command: 'queue',
        action,
        category,
        product: patched.product
      };
    }

    if (action === 'clear') {
      const status = String(args.status || '').trim().toLowerCase();
      if (!status) {
        throw new Error('queue clear requires --status <status>');
      }
      const result = await clearQueueByStatus({
        storage,
        category,
        status
      });
      return {
        command: 'queue',
        action,
        category,
        status,
        ...result
      };
    }

    throw new Error(`Unknown queue subcommand: ${action}`);
  };
}

function queueStatusSummary(products = {}) {
  const status = {};
  const priority = {};
  for (const row of Object.values(products || {})) {
    const statusKey = String(row?.status || 'pending').trim().toLowerCase() || 'pending';
    const priorityKey = String(Math.max(1, Math.min(5, Number.parseInt(String(row?.priority || '3'), 10) || 3)));
    status[statusKey] = (status[statusKey] || 0) + 1;
    priority[priorityKey] = (priority[priorityKey] || 0) + 1;
  }
  return {
    status,
    priority
  };
}
