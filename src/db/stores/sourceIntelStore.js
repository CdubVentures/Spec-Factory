import { LEARNING_PROFILE_BOOLEAN_KEYS, SOURCE_CORPUS_BOOLEAN_KEYS } from '../specDbSchema.js';
import { hydrateRow, hydrateRows } from '../specDbHelpers.js';

/**
 * Source Intelligence store — extracted from SpecDb.
 * Owns: source_intel_domains, source_intel_field_rewards,
 *       source_intel_brands, source_intel_paths tables.
 * Also: source_corpus, runtime_events, learning_profiles, category_brain, llm_cache tables.
 *
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createSourceIntelStore({ db, category, stmts }) {
  // --- LLM Cache ---

  function getLlmCacheEntry(key) {
    return stmts._getLlmCache.get(key) || null;
  }

  function setLlmCacheEntry(key, response, timestamp, ttl) {
    stmts._upsertLlmCache.run({
      cache_key: key,
      response: typeof response === 'string' ? response : JSON.stringify(response),
      timestamp,
      ttl
    });
  }

  function evictExpiredCache(nowMs) {
    return stmts._evictExpiredCache.run(nowMs || Date.now());
  }

  // --- Learning Profiles ---

  function upsertLearningProfile(profile) {
    stmts._upsertLearningProfile.run({
      profile_id: profile.profile_id || '',
      category: profile.category || category,
      brand: profile.identity_lock?.brand || profile.brand || '',
      model: profile.identity_lock?.model || profile.model || '',
      variant: profile.identity_lock?.variant || profile.variant || '',
      runs_total: profile.runs_total ?? 0,
      validated_runs: profile.validated_runs ?? 0,
      validated: profile.validated ? 1 : 0,
      unknown_field_rate: profile.unknown_field_rate ?? 0,
      unknown_field_rate_avg: profile.unknown_field_rate_avg ?? 0,
      parser_health_avg: profile.parser_health_avg ?? 0,
      preferred_urls: JSON.stringify(profile.preferred_urls || []),
      feedback_urls: JSON.stringify(profile.feedback_urls || []),
      uncertain_fields: JSON.stringify(profile.uncertain_fields || []),
      host_stats: JSON.stringify(profile.host_stats || []),
      critical_fields_below: JSON.stringify(profile.critical_fields_below_pass_target || profile.critical_fields_below || []),
      last_run: JSON.stringify(profile.last_run || {}),
      parser_health: JSON.stringify(profile.parser_health || {}),
      updated_at: profile.updated_at || new Date().toISOString()
    });
  }

  function getLearningProfile(profileId) {
    const row = hydrateRow(LEARNING_PROFILE_BOOLEAN_KEYS, db.prepare('SELECT * FROM learning_profiles WHERE profile_id = ?').get(profileId));
    if (!row) return null;
    try { row.preferred_urls = JSON.parse(row.preferred_urls); } catch { row.preferred_urls = []; }
    try { row.feedback_urls = JSON.parse(row.feedback_urls); } catch { row.feedback_urls = []; }
    try { row.uncertain_fields = JSON.parse(row.uncertain_fields); } catch { row.uncertain_fields = []; }
    try { row.host_stats = JSON.parse(row.host_stats); } catch { row.host_stats = []; }
    try { row.critical_fields_below_pass_target = JSON.parse(row.critical_fields_below); } catch { row.critical_fields_below_pass_target = []; }
    try { row.last_run = JSON.parse(row.last_run); } catch { row.last_run = {}; }
    try { row.parser_health = JSON.parse(row.parser_health); } catch { row.parser_health = {}; }
    row.identity_lock = { brand: row.brand || '', model: row.model || '', variant: row.variant || '' };
    return row;
  }

  // --- Category Brain ---

  function upsertCategoryBrainArtifact(cat, artifactName, payload) {
    stmts._upsertCategoryBrain.run({
      category: cat,
      artifact_name: artifactName,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      updated_at: new Date().toISOString()
    });
  }

  function getCategoryBrainArtifacts(cat) {
    const rows = db.prepare('SELECT * FROM category_brain WHERE category = ?').all(cat);
    const result = {};
    for (const row of rows) {
      try { result[row.artifact_name] = JSON.parse(row.payload); } catch { result[row.artifact_name] = row.payload; }
    }
    return result;
  }

  function getCategoryBrainArtifact(cat, artifactName) {
    const row = db.prepare('SELECT payload FROM category_brain WHERE category = ? AND artifact_name = ?').get(cat, artifactName);
    if (!row) return null;
    try { return JSON.parse(row.payload); } catch { return row.payload; }
  }

  // --- Source Corpus ---

  function upsertSourceCorpusDoc(doc) {
    stmts._upsertSourceCorpus.run({
      url: doc.url || '',
      category: doc.category || '',
      host: doc.host || '',
      root_domain: doc.rootDomain || doc.root_domain || '',
      path: doc.path || '',
      title: doc.title || '',
      snippet: doc.snippet || '',
      tier: doc.tier ?? 99,
      role: doc.role || '',
      fields: JSON.stringify(doc.fields || []),
      methods: JSON.stringify(doc.methods || []),
      identity_match: doc.identity_match ? 1 : 0,
      approved_domain: doc.approved_domain ? 1 : 0,
      brand: doc.brand || '',
      model_name: doc.model || doc.model_name || '',
      variant: doc.variant || '',
      first_seen_at: doc.first_seen_at || doc.updated_at || new Date().toISOString(),
      last_seen_at: doc.last_seen_at || doc.updated_at || new Date().toISOString()
    });
  }

  function upsertSourceCorpusBatch(docs) {
    const tx = db.transaction((items) => {
      for (const doc of items) { upsertSourceCorpusDoc(doc); }
    });
    tx(docs);
  }

  function getSourceCorpusByCategory(cat) {
    const rows = hydrateRows(SOURCE_CORPUS_BOOLEAN_KEYS, db.prepare('SELECT * FROM source_corpus WHERE category = ? ORDER BY last_seen_at DESC').all(cat));
    for (const row of rows) {
      try { row.fields = JSON.parse(row.fields); } catch { row.fields = []; }
      try { row.methods = JSON.parse(row.methods); } catch { row.methods = []; }
      row.rootDomain = row.root_domain;
    }
    return rows;
  }

  function getSourceCorpusCount(cat) {
    const row = db.prepare('SELECT COUNT(*) as c FROM source_corpus WHERE category = ?').get(cat);
    return row?.c || 0;
  }

  // --- Runtime Events ---

  function insertRuntimeEvent(event) {
    stmts._insertRuntimeEvent.run({
      ts: event.ts || new Date().toISOString(),
      level: event.level || 'info',
      event: event.event || '',
      category: event.category || '',
      product_id: event.product_id || event.productId || '',
      run_id: event.run_id || event.runId || '',
      data: JSON.stringify(event.data || {})
    });
  }

  function insertRuntimeEventsBatch(events) {
    const tx = db.transaction((items) => {
      for (const event of items) { insertRuntimeEvent(event); }
    });
    tx(events);
  }

  // --- Bridge Events (transformed runtime events for GUI readers) ---

  function insertBridgeEvent(row) {
    stmts._insertBridgeEvent.run({
      run_id: row.run_id || '',
      category: row.category || '',
      product_id: row.product_id || '',
      ts: row.ts || new Date().toISOString(),
      stage: row.stage || '',
      event: row.event || '',
      payload: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload || {}),
    });
  }

  function getBridgeEventsByRunId(runId, limit = 2000) {
    const rows = stmts._getBridgeEventsByRunId.all(runId, limit);
    rows.reverse();
    return rows.map(r => {
      let parsed = {};
      try { parsed = JSON.parse(r.payload); } catch { /* default {} */ }
      return { ...r, payload: parsed };
    });
  }

  // --- Source Intelligence ---

  function upsertSourceIntelDomain(entry) {
    db.prepare(`
      INSERT OR REPLACE INTO source_intel_domains (
        root_domain, category, attempts, http_ok_count, identity_match_count,
        major_anchor_conflict_count, fields_contributed_count, fields_accepted_count,
        accepted_critical_fields_count, products_seen, approved_attempts, candidate_attempts,
        parser_runs, parser_success_count, parser_health_score_total,
        endpoint_signal_count, endpoint_signal_score_total, planner_score, field_reward_strength,
        recent_products, per_field_helpfulness, fingerprint_counts, extra_stats,
        last_seen_at, updated_at
      ) VALUES (
        @root_domain, @category, @attempts, @http_ok_count, @identity_match_count,
        @major_anchor_conflict_count, @fields_contributed_count, @fields_accepted_count,
        @accepted_critical_fields_count, @products_seen, @approved_attempts, @candidate_attempts,
        @parser_runs, @parser_success_count, @parser_health_score_total,
        @endpoint_signal_count, @endpoint_signal_score_total, @planner_score, @field_reward_strength,
        @recent_products, @per_field_helpfulness, @fingerprint_counts, @extra_stats,
        @last_seen_at, @updated_at
      )
    `).run({
      root_domain: entry.root_domain || entry.rootDomain || '',
      category: entry.category || category || '',
      attempts: entry.attempts || 0,
      http_ok_count: entry.http_ok_count || 0,
      identity_match_count: entry.identity_match_count || 0,
      major_anchor_conflict_count: entry.major_anchor_conflict_count || 0,
      fields_contributed_count: entry.fields_contributed_count || 0,
      fields_accepted_count: entry.fields_accepted_count || 0,
      accepted_critical_fields_count: entry.accepted_critical_fields_count || 0,
      products_seen: entry.products_seen || 0,
      approved_attempts: entry.approved_attempts || 0,
      candidate_attempts: entry.candidate_attempts || 0,
      parser_runs: entry.parser_runs || 0,
      parser_success_count: entry.parser_success_count || 0,
      parser_health_score_total: entry.parser_health_score_total || 0,
      endpoint_signal_count: entry.endpoint_signal_count || 0,
      endpoint_signal_score_total: entry.endpoint_signal_score_total || 0,
      planner_score: entry.planner_score || 0,
      field_reward_strength: entry.field_reward_strength || 0,
      recent_products: JSON.stringify(entry.recent_products || []),
      per_field_helpfulness: JSON.stringify(entry.per_field_helpfulness || {}),
      fingerprint_counts: JSON.stringify(entry.fingerprint_counts || {}),
      extra_stats: JSON.stringify(entry.extra_stats || {}),
      last_seen_at: entry.last_seen_at || null,
      updated_at: entry.updated_at || new Date().toISOString()
    });
  }

  function upsertSourceIntelFieldReward(entry) {
    db.prepare(`
      INSERT OR REPLACE INTO source_intel_field_rewards (
        root_domain, scope, scope_key, field, method,
        seen_count, success_count, fail_count, contradiction_count,
        success_rate, contradiction_rate, reward_score,
        last_seen_at, last_decay_at
      ) VALUES (
        @root_domain, @scope, @scope_key, @field, @method,
        @seen_count, @success_count, @fail_count, @contradiction_count,
        @success_rate, @contradiction_rate, @reward_score,
        @last_seen_at, @last_decay_at
      )
    `).run({
      root_domain: entry.root_domain || '',
      scope: entry.scope || 'domain',
      scope_key: entry.scope_key || '',
      field: entry.field || '',
      method: entry.method || 'unknown',
      seen_count: entry.seen_count || 0,
      success_count: entry.success_count || 0,
      fail_count: entry.fail_count || 0,
      contradiction_count: entry.contradiction_count || 0,
      success_rate: entry.success_rate || 0,
      contradiction_rate: entry.contradiction_rate || 0,
      reward_score: entry.reward_score || 0,
      last_seen_at: entry.last_seen_at || null,
      last_decay_at: entry.last_decay_at || null
    });
  }

  function upsertSourceIntelBrand(entry) {
    db.prepare(`
      INSERT OR REPLACE INTO source_intel_brands (
        root_domain, brand_key, brand, attempts, http_ok_count,
        identity_match_count, major_anchor_conflict_count,
        fields_contributed_count, fields_accepted_count, accepted_critical_fields_count,
        products_seen, recent_products, per_field_helpfulness, extra_stats, last_seen_at
      ) VALUES (
        @root_domain, @brand_key, @brand, @attempts, @http_ok_count,
        @identity_match_count, @major_anchor_conflict_count,
        @fields_contributed_count, @fields_accepted_count, @accepted_critical_fields_count,
        @products_seen, @recent_products, @per_field_helpfulness, @extra_stats, @last_seen_at
      )
    `).run({
      root_domain: entry.root_domain || '',
      brand_key: entry.brand_key || '',
      brand: entry.brand || '',
      attempts: entry.attempts || 0,
      http_ok_count: entry.http_ok_count || 0,
      identity_match_count: entry.identity_match_count || 0,
      major_anchor_conflict_count: entry.major_anchor_conflict_count || 0,
      fields_contributed_count: entry.fields_contributed_count || 0,
      fields_accepted_count: entry.fields_accepted_count || 0,
      accepted_critical_fields_count: entry.accepted_critical_fields_count || 0,
      products_seen: entry.products_seen || 0,
      recent_products: JSON.stringify(entry.recent_products || []),
      per_field_helpfulness: JSON.stringify(entry.per_field_helpfulness || {}),
      extra_stats: JSON.stringify(entry.extra_stats || {}),
      last_seen_at: entry.last_seen_at || null
    });
  }

  function upsertSourceIntelPath(entry) {
    db.prepare(`
      INSERT OR REPLACE INTO source_intel_paths (
        root_domain, path, attempts, http_ok_count,
        identity_match_count, major_anchor_conflict_count,
        fields_contributed_count, fields_accepted_count, accepted_critical_fields_count,
        products_seen, recent_products, per_field_helpfulness, extra_stats, last_seen_at
      ) VALUES (
        @root_domain, @path, @attempts, @http_ok_count,
        @identity_match_count, @major_anchor_conflict_count,
        @fields_contributed_count, @fields_accepted_count, @accepted_critical_fields_count,
        @products_seen, @recent_products, @per_field_helpfulness, @extra_stats, @last_seen_at
      )
    `).run({
      root_domain: entry.root_domain || '',
      path: entry.path || '/',
      attempts: entry.attempts || 0,
      http_ok_count: entry.http_ok_count || 0,
      identity_match_count: entry.identity_match_count || 0,
      major_anchor_conflict_count: entry.major_anchor_conflict_count || 0,
      fields_contributed_count: entry.fields_contributed_count || 0,
      fields_accepted_count: entry.fields_accepted_count || 0,
      accepted_critical_fields_count: entry.accepted_critical_fields_count || 0,
      products_seen: entry.products_seen || 0,
      recent_products: JSON.stringify(entry.recent_products || []),
      per_field_helpfulness: JSON.stringify(entry.per_field_helpfulness || {}),
      extra_stats: JSON.stringify(entry.extra_stats || {}),
      last_seen_at: entry.last_seen_at || null
    });
  }

  function persistSourceIntelFull(cat, domains) {
    const tx = db.transaction(() => {
      for (const [rootDomain, entry] of Object.entries(domains || {})) {
        upsertSourceIntelDomain({
          ...entry,
          root_domain: rootDomain,
          category: cat
        });

        for (const [key, reward] of Object.entries(entry.field_method_reward || {})) {
          upsertSourceIntelFieldReward({
            root_domain: rootDomain,
            scope: 'domain',
            scope_key: '',
            ...reward
          });
        }

        for (const [brandKey, brandStats] of Object.entries(entry.per_brand || {})) {
          upsertSourceIntelBrand({
            ...brandStats,
            root_domain: rootDomain,
            brand_key: brandKey
          });
          for (const [key, reward] of Object.entries(brandStats.field_method_reward || {})) {
            upsertSourceIntelFieldReward({
              root_domain: rootDomain,
              scope: 'brand',
              scope_key: brandKey,
              ...reward
            });
          }
        }

        for (const [pathKey, pathStats] of Object.entries(entry.per_path || {})) {
          upsertSourceIntelPath({
            ...pathStats,
            root_domain: rootDomain,
            path: pathKey
          });
          for (const [key, reward] of Object.entries(pathStats.field_method_reward || {})) {
            upsertSourceIntelFieldReward({
              root_domain: rootDomain,
              scope: 'path',
              scope_key: pathKey,
              ...reward
            });
          }
        }
      }
    });
    tx();
  }

  function loadSourceIntelDomains(cat) {
    const domainRows = db.prepare('SELECT * FROM source_intel_domains WHERE category = ?').all(cat);
    if (!domainRows.length) return null;

    const domains = {};
    for (const row of domainRows) {
      const rootDomain = row.root_domain;
      try { row.recent_products = JSON.parse(row.recent_products); } catch { row.recent_products = []; }
      try { row.per_field_helpfulness = JSON.parse(row.per_field_helpfulness); } catch { row.per_field_helpfulness = {}; }
      try { row.fingerprint_counts = JSON.parse(row.fingerprint_counts); } catch { row.fingerprint_counts = {}; }
      try { row.extra_stats = JSON.parse(row.extra_stats); } catch { row.extra_stats = {}; }

      domains[rootDomain] = {
        ...row,
        rootDomain,
        per_brand: {},
        per_path: {},
        field_method_reward: {},
        per_field_reward: {}
      };
    }

    for (const rootDomain of Object.keys(domains)) {
      const rewards = db.prepare(
        'SELECT * FROM source_intel_field_rewards WHERE root_domain = ?'
      ).all(rootDomain);

      for (const reward of rewards) {
        const scope = reward.scope || 'domain';
        const scopeKey = reward.scope_key || '';
        const rKey = `${reward.field}::${reward.method}`;

        if (scope === 'domain') {
          domains[rootDomain].field_method_reward[rKey] = reward;
        } else if (scope === 'brand' && domains[rootDomain].per_brand[scopeKey]) {
          if (!domains[rootDomain].per_brand[scopeKey].field_method_reward) {
            domains[rootDomain].per_brand[scopeKey].field_method_reward = {};
          }
          domains[rootDomain].per_brand[scopeKey].field_method_reward[rKey] = reward;
        } else if (scope === 'path' && domains[rootDomain].per_path[scopeKey]) {
          if (!domains[rootDomain].per_path[scopeKey].field_method_reward) {
            domains[rootDomain].per_path[scopeKey].field_method_reward = {};
          }
          domains[rootDomain].per_path[scopeKey].field_method_reward[rKey] = reward;
        }
      }
    }

    const brandRows = db.prepare(
      'SELECT * FROM source_intel_brands WHERE root_domain IN (' +
      Object.keys(domains).map(() => '?').join(',') + ')'
    ).all(...Object.keys(domains));

    for (const row of brandRows) {
      const rootDomain = row.root_domain;
      if (!domains[rootDomain]) continue;
      try { row.recent_products = JSON.parse(row.recent_products); } catch { row.recent_products = []; }
      try { row.per_field_helpfulness = JSON.parse(row.per_field_helpfulness); } catch { row.per_field_helpfulness = {}; }
      try { row.extra_stats = JSON.parse(row.extra_stats); } catch { row.extra_stats = {}; }
      domains[rootDomain].per_brand[row.brand_key] = {
        ...row,
        field_method_reward: domains[rootDomain].per_brand[row.brand_key]?.field_method_reward || {},
        per_field_reward: {}
      };
    }

    const pathRows = db.prepare(
      'SELECT * FROM source_intel_paths WHERE root_domain IN (' +
      Object.keys(domains).map(() => '?').join(',') + ')'
    ).all(...Object.keys(domains));

    for (const row of pathRows) {
      const rootDomain = row.root_domain;
      if (!domains[rootDomain]) continue;
      try { row.recent_products = JSON.parse(row.recent_products); } catch { row.recent_products = []; }
      try { row.per_field_helpfulness = JSON.parse(row.per_field_helpfulness); } catch { row.per_field_helpfulness = {}; }
      try { row.extra_stats = JSON.parse(row.extra_stats); } catch { row.extra_stats = {}; }
      domains[rootDomain].per_path[row.path] = {
        ...row,
        field_method_reward: domains[rootDomain].per_path[row.path]?.field_method_reward || {},
        per_field_reward: {}
      };
    }

    return { category: cat, domains };
  }

  return {
    getLlmCacheEntry,
    setLlmCacheEntry,
    evictExpiredCache,
    upsertLearningProfile,
    getLearningProfile,
    upsertCategoryBrainArtifact,
    getCategoryBrainArtifacts,
    getCategoryBrainArtifact,
    upsertSourceCorpusDoc,
    upsertSourceCorpusBatch,
    getSourceCorpusByCategory,
    getSourceCorpusCount,
    insertRuntimeEvent,
    insertRuntimeEventsBatch,
    insertBridgeEvent,
    getBridgeEventsByRunId,
    upsertSourceIntelDomain,
    upsertSourceIntelFieldReward,
    upsertSourceIntelBrand,
    upsertSourceIntelPath,
    persistSourceIntelFull,
    loadSourceIntelDomains,
  };
}
