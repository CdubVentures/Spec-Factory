import { OUTPUT_KEY_PREFIX } from '../../../shared/storageKeyPrefixes.js';

export function createMigrateToSqliteCommand({
  withSpecDb,
  toPosixKey,
  now = () => Date.now(),
}) {
  return async function commandMigrateToSqlite(config, storage, args) {
    const category = String(args.category || '').trim();
    if (!category) throw new Error('migrate-to-sqlite requires --category');
    const phase = args.phase ? Number.parseInt(String(args.phase), 10) : 0;

    return withSpecDb(config, category, async (specDb) => {
      if (!specDb) throw new Error(`Could not open SpecDb for category: ${category}`);

      const results = {};

      if (!phase || phase === 1) {
        const rows = specDb.getAllQueueProducts();
        results.phase1_queue = { status: 'verified', rows: rows.length };
      }

      if (!phase || phase === 2) {
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
              specDb.insertBillingEntry({
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
              });
              imported += 1;
            } catch {
              // skip malformed lines
            }
          }
        }
        results.phase2_billing = { status: 'imported', entries: imported, files: ledgerKeys.length };
      }

      if (!phase || phase === 4) {
        let imported = 0;
        const learningPrefix = toPosixKey(OUTPUT_KEY_PREFIX, '_learning', category, 'profiles');
        const keys = await storage.listKeys(learningPrefix);
        for (const key of keys) {
          if (!key.endsWith('.json')) continue;
          try {
            const profile = await storage.readJsonOrNull(key);
            if (!profile) continue;
            const profileId = profile.profile_id || key.split('/').pop()?.replace(/\.json$/, '') || '';
            specDb.upsertLearningProfile({
              profile_id: profileId,
              category: profile.category || category,
              brand: profile.brand || '',
              model: profile.model || '',
              variant: profile.variant || '',
              runs_total: profile.runs_total || 0,
              validated_runs: profile.validated_runs || 0,
              validated: profile.validated ? 1 : 0,
              unknown_field_rate: profile.unknown_field_rate || 0,
              unknown_field_rate_avg: profile.unknown_field_rate_avg || 0,
              parser_health_avg: profile.parser_health_avg || 0,
              preferred_urls: JSON.stringify(profile.preferred_urls || []),
              feedback_urls: JSON.stringify(profile.feedback_urls || []),
              uncertain_fields: JSON.stringify(profile.uncertain_fields || []),
              host_stats: JSON.stringify(profile.host_stats || []),
              critical_fields_below: JSON.stringify(profile.critical_fields_below_pass_target || []),
              last_run: JSON.stringify(profile.last_run || {}),
              parser_health: JSON.stringify(profile.parser_health || {}),
              updated_at: profile.updated_at || new Date().toISOString(),
            });
            imported += 1;
          } catch {
            // skip bad files
          }
        }
        results.phase4_learning = { status: 'imported', profiles: imported };
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
