import { OUTPUT_KEY_PREFIX } from '../../../shared/storageKeyPrefixes.js';

export function createMigrateToSqliteCommand({
  withSpecDb,
  toPosixKey,
}) {
  return async function commandMigrateToSqlite(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) throw new Error('migrate-to-sqlite requires --category');
    const phase = args.phase ? Number.parseInt(String(args.phase), 10) : 0;

    return withSpecDb(config, category, async (specDb) => {
      if (!specDb) throw new Error(`Could not open SpecDb for category: ${category}`);

      const results = {};

      if (!phase || phase === 2) {
        // WHY: Phase 2 billing migration now reads legacy JSONL from storage
        // and writes to global appDb + new JSONL path (.workspace/global/billing/ledger/).
        const appDb = config.appDb || null;
        let imported = 0;
        const billingPrefix = toPosixKey(OUTPUT_KEY_PREFIX, '_billing');
        const keys = await storage.listKeys(billingPrefix);
        const ledgerKeys = keys.filter((k) => k.endsWith('.jsonl') && k.includes('ledger'));
        for (const key of ledgerKeys) {
          const text = await storage.readTextOrNull(key);
          if (!text) continue;
          for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const entry = JSON.parse(trimmed);
              const ts = String(entry.ts || '');
              const row = {
                ts,
                month: ts.slice(0, 7),
                day: ts.slice(0, 10),
                provider: entry.provider || 'unknown',
                model: entry.model || 'unknown',
                category: entry.category || '',
                product_id: entry.productId || entry.product_id || '',
                run_id: entry.runId || entry.run_id || '',
                round: entry.round || 0,
                prompt_tokens: entry.prompt_tokens || 0,
                completion_tokens: entry.completion_tokens || 0,
                cached_prompt_tokens: entry.cached_prompt_tokens || 0,
                total_tokens: entry.total_tokens || 0,
                cost_usd: entry.cost_usd || 0,
                reason: entry.reason || 'extract',
                host: entry.host || '',
                url_count: entry.url_count || 0,
                evidence_chars: entry.evidence_chars || 0,
                estimated_usage: entry.estimated_usage ? 1 : 0,
                meta: JSON.stringify(entry.meta || {}),
              };
              if (appDb) appDb.insertBillingEntry(row);
              imported += 1;
            } catch {
              // skip malformed lines
            }
          }
        }
        results.phase2_billing = { status: 'imported', entries: imported, files: ledgerKeys.length };
      }

      if (!phase || phase === 8) {
        results.phase8_frontier = { status: 'skipped', note: 'frontier has built-in migration' };
      }

      const counts = specDb.counts();
      return {
        command: 'migrate-to-sqlite',
        category,
        phase: phase || 'all',
        results,
        table_counts: counts,
      };
    });
  };
}
