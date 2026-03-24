import { persistSourceCorpus } from './sourceCorpus.js';
import {
  ensureDomainStats,
  ensurePathStats,
  ensureBrandStats,
  applySourceDiagnostics,
  updateDerivedStats,
  syncNamedMetrics,
} from './sourceIntel/sourceIntelStatsAccumulator.js';
import {
  normalizeSourcePath,
  isHelperSourceRecord,
  buildAcceptedEvidenceIndex,
  applyFieldRewardsForSource,
  collectAcceptedDomainHelpfulness,
  collectAcceptedPathHelpfulness,
} from './sourceIntel/sourceIntelProvenanceAnalyzer.js';
import {
  sourceIntelKey,
  promotionSuggestionsKey,
  applyPromotionThresholds,
  writeExpansionPlans,
} from './sourceIntel/sourceIntelExpansionPlanner.js';

export { sourceIntelKey, promotionSuggestionsKey } from './sourceIntel/sourceIntelExpansionPlanner.js';
export { expansionPlanKey, brandExpansionPlanKey } from './sourceIntel/sourceIntelExpansionPlanner.js';

export async function loadSourceIntel({ storage, config, category, specDb = null }) {
  const key = sourceIntelKey(config, category);

  if (specDb) {
    try {
      const sqliteData = specDb.loadSourceIntelDomains(category);
      if (sqliteData && sqliteData.domains && Object.keys(sqliteData.domains).length > 0) {
        return {
          key,
          data: {
            category: sqliteData.category || category,
            updated_at: sqliteData.updated_at || null,
            domains: sqliteData.domains
          }
        };
      }
    } catch {
      // Fall through to JSON loading
    }
  }

  const existing = await storage.readJsonOrNull(key);

  return {
    key,
    data: existing || {
      category,
      updated_at: null,
      domains: {}
    }
  };
}

export async function generateSourceExpansionPlans({
  storage,
  config,
  category,
  categoryConfig,
  specDb = null
}) {
  const loaded = await loadSourceIntel({ storage, config, category, specDb });
  return writeExpansionPlans({
    storage,
    config,
    category,
    intelPayload: loaded.data,
    categoryConfig
  });
}

export async function persistSourceIntel({
  storage,
  config,
  category,
  productId,
  brand,
  model,
  variant,
  sourceResults,
  provenance,
  categoryConfig,
  constraintAnalysis = null,
  specDb = null
}) {
  const loaded = await loadSourceIntel({ storage, config, category, specDb });
  const current = loaded.data;
  const domains = { ...(current.domains || {}) };
  const perDomainRunSeen = new Set();
  const perPathRunSeen = new Set();
  const seenAt = new Date().toISOString();
  const halfLifeDays = 45;
  const acceptedEvidenceIndex = buildAcceptedEvidenceIndex(provenance);
  const contradictionFieldSet = new Set(
    (constraintAnalysis?.contradictions || [])
      .flatMap((item) => item.fields || [])
      .map((field) => String(field || '').trim())
      .filter(Boolean)
  );

  for (const source of sourceResults || []) {
    if (isHelperSourceRecord(source)) {
      continue;
    }
    const rootDomain = source.rootDomain || source.host;
    if (!rootDomain) {
      continue;
    }

    const entry = ensureDomainStats(domains, rootDomain);
    const brandStats = ensureBrandStats(entry, brand);
    const pathKey = normalizeSourcePath(source.finalUrl || source.url || '');
    const pathStats = ensurePathStats(entry, pathKey);
    entry.attempts += 1;
    if (brandStats) {
      brandStats.attempts += 1;
    }
    pathStats.attempts += 1;

    const status = Number.parseInt(source.status || 0, 10);
    if (status >= 200 && status < 400) {
      entry.http_ok_count += 1;
      if (brandStats) {
        brandStats.http_ok_count += 1;
      }
      pathStats.http_ok_count += 1;
    }

    if (source.identity?.match) {
      entry.identity_match_count += 1;
      if (brandStats) {
        brandStats.identity_match_count += 1;
      }
      pathStats.identity_match_count += 1;
    }

    if ((source.anchorCheck?.majorConflicts || []).length > 0) {
      entry.major_anchor_conflict_count += 1;
      if (brandStats) {
        brandStats.major_anchor_conflict_count += 1;
      }
      pathStats.major_anchor_conflict_count += 1;
    }

    const contributedCount = (source.fieldCandidates || []).length;
    entry.fields_contributed_count += contributedCount;
    if (brandStats) {
      brandStats.fields_contributed_count += contributedCount;
    }
    pathStats.fields_contributed_count += contributedCount;

    if (source.approvedDomain) {
      entry.approved_attempts += 1;
      if (brandStats) {
        brandStats.approved_attempts += 1;
      }
      pathStats.approved_attempts += 1;
    } else {
      entry.candidate_attempts += 1;
      if (brandStats) {
        brandStats.candidate_attempts += 1;
      }
      pathStats.candidate_attempts += 1;
    }

    applySourceDiagnostics(entry, source);
    if (brandStats) {
      applySourceDiagnostics(brandStats, source);
    }
    applySourceDiagnostics(pathStats, source);
    applyFieldRewardsForSource({
      source,
      rootDomain,
      pathKey,
      entry,
      brandStats,
      pathStats,
      acceptedEvidenceIndex,
      contradictionFieldSet,
      seenAt,
      halfLifeDays
    });

    perDomainRunSeen.add(rootDomain);
    perPathRunSeen.add(`${rootDomain}||${pathKey}`);
  }

  for (const rootDomain of perDomainRunSeen) {
    const entry = ensureDomainStats(domains, rootDomain);
    const recent = new Set(entry.recent_products || []);
    if (!recent.has(productId)) {
      entry.products_seen += 1;
    }
    recent.add(productId);
    entry.recent_products = [...recent].slice(-200);

    const brandStats = ensureBrandStats(entry, brand);
    if (brandStats) {
      const brandRecent = new Set(brandStats.recent_products || []);
      if (!brandRecent.has(productId)) {
        brandStats.products_seen += 1;
      }
      brandRecent.add(productId);
      brandStats.recent_products = [...brandRecent].slice(-200);
    }
  }

  for (const compositeKey of perPathRunSeen) {
    const [rootDomain, pathKey] = compositeKey.split('||');
    if (!rootDomain) {
      continue;
    }
    const entry = ensureDomainStats(domains, rootDomain);
    const pathStats = ensurePathStats(entry, pathKey || '/');
    const recent = new Set(pathStats.recent_products || []);
    if (!recent.has(productId)) {
      pathStats.products_seen += 1;
    }
    recent.add(productId);
    pathStats.recent_products = [...recent].slice(-200);
  }

  const acceptedHelpfulness = collectAcceptedDomainHelpfulness(
    provenance,
    categoryConfig?.criticalFieldSet || new Set()
  );
  const acceptedPathHelpfulness = collectAcceptedPathHelpfulness(
    provenance,
    categoryConfig?.criticalFieldSet || new Set()
  );

  for (const [rootDomain, stat] of Object.entries(acceptedHelpfulness)) {
    const entry = ensureDomainStats(domains, rootDomain);
    const brandStats = ensureBrandStats(entry, brand);
    entry.fields_accepted_count += stat.fieldsAccepted;
    entry.accepted_critical_fields_count += stat.acceptedCriticalFields;
    if (brandStats) {
      brandStats.fields_accepted_count += stat.fieldsAccepted;
      brandStats.accepted_critical_fields_count += stat.acceptedCriticalFields;
    }

    for (const [field, count] of Object.entries(stat.perField || {})) {
      entry.per_field_helpfulness[field] = (entry.per_field_helpfulness[field] || 0) + count;
      if (brandStats) {
        brandStats.per_field_helpfulness[field] =
          (brandStats.per_field_helpfulness[field] || 0) + count;
      }
    }
  }

  for (const [compositeKey, stat] of Object.entries(acceptedPathHelpfulness)) {
    const [rootDomain, pathKey] = compositeKey.split('||');
    if (!rootDomain) {
      continue;
    }

    const entry = ensureDomainStats(domains, rootDomain);
    const pathStats = ensurePathStats(entry, pathKey || '/');
    pathStats.fields_accepted_count += stat.fieldsAccepted;
    pathStats.accepted_critical_fields_count += stat.acceptedCriticalFields;

    for (const [field, count] of Object.entries(stat.perField || {})) {
      pathStats.per_field_helpfulness[field] = (pathStats.per_field_helpfulness[field] || 0) + count;
    }
  }

  for (const entry of Object.values(domains)) {
    updateDerivedStats(entry, seenAt, halfLifeDays);
    syncNamedMetrics(entry, seenAt);
    for (const brandEntry of Object.values(entry.per_brand || {})) {
      updateDerivedStats(brandEntry, seenAt, halfLifeDays);
      syncNamedMetrics(brandEntry, seenAt);
    }
    for (const pathEntry of Object.values(entry.per_path || {})) {
      updateDerivedStats(pathEntry, seenAt, halfLifeDays);
      syncNamedMetrics(pathEntry, seenAt);
    }
  }

  const payload = {
    category,
    updated_at: new Date().toISOString(),
    domains
  };

  if (specDb) {
    try {
      specDb.persistSourceIntelFull(category, domains);
    } catch {
      // SQLite write failed; JSON fallback below will still run
    }
  }

  if (!specDb) {
    await storage.writeObject(loaded.key, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), {
      contentType: 'application/json'
    });
  }

  const suggestions = applyPromotionThresholds(domains);
  const suggestionKey = promotionSuggestionsKey(config, category);
  const suggestionPayload = {
    category,
    generated_at: new Date().toISOString(),
    thresholds: {
      min_products_seen: 20,
      min_identity_match_rate: 0.98,
      max_major_anchor_conflicts: 0,
      min_fields_accepted_count: 10,
      min_accepted_critical_fields_count: 1
    },
    suggestion_count: suggestions.length,
    suggestions
  };

  await storage.writeObject(suggestionKey, Buffer.from(JSON.stringify(suggestionPayload, null, 2), 'utf8'), {
    contentType: 'application/json'
  });

  const expansionResult = await writeExpansionPlans({
    storage,
    config,
    category,
    intelPayload: payload,
    categoryConfig
  });

  let sourceCorpus = null;
  try {
    sourceCorpus = await persistSourceCorpus({
      storage,
      config,
      category,
      sourceResults,
      identity: {
        brand,
        model,
        variant
      },
      specDb
    });
  } catch {
    sourceCorpus = null;
  }

  return {
    domainStatsKey: loaded.key,
    promotionSuggestionsKey: suggestionKey,
    expansionPlanKey: expansionResult.expansionPlanKey,
    brandExpansionPlanCount: expansionResult.planCount,
    sourceCorpusKey: sourceCorpus?.key || null,
    intel: payload
  };
}


