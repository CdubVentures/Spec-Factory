// Source Intel — Expansion planner
// Promotion thresholds, per-brand expansion plans, and S3 key builders.
// Depends on reward engine for round().

import { toPosixKey } from '../../s3/storage.js';
import { OUTPUT_KEY_PREFIX } from '../../shared/storageKeyPrefixes.js';
import { round } from './sourceIntelRewardEngine.js';

function topHelpfulFields(perFieldHelpfulness, limit = 12) {
  return Object.entries(perFieldHelpfulness || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([field, count]) => ({ field, count }));
}

export function applyPromotionThresholds(domains) {
  const rows = Object.values(domains || {});
  return rows
    .filter((entry) => (entry.approved_attempts || 0) === 0)
    .filter((entry) => (entry.products_seen || 0) >= 20)
    .filter((entry) => (entry.identity_match_rate || 0) >= 0.98)
    .filter((entry) => (entry.major_anchor_conflict_count || 0) === 0)
    .filter((entry) => (entry.fields_accepted_count || 0) >= 10)
    .filter((entry) => (entry.accepted_critical_fields_count || 0) >= 1)
    .sort((a, b) => (b.planner_score || 0) - (a.planner_score || 0))
    .map((entry) => ({
      rootDomain: entry.rootDomain,
      products_seen: entry.products_seen,
      identity_match_rate: entry.identity_match_rate,
      major_anchor_conflict_count: entry.major_anchor_conflict_count,
      fields_accepted_count: entry.fields_accepted_count,
      accepted_critical_fields_count: entry.accepted_critical_fields_count,
      planner_score: entry.planner_score
    }));
}

function buildPerBrandExpansionPlans(domains, approvedRootDomains) {
  const approved = approvedRootDomains || new Set();
  const byBrand = new Map();

  for (const domain of Object.values(domains || {})) {
    const rootDomain = domain.rootDomain;
    if (!rootDomain || approved.has(rootDomain)) {
      continue;
    }

    const perBrand = domain.per_brand || {};
    for (const [brandKey, stats] of Object.entries(perBrand)) {
      if ((stats.attempts || 0) < 2) {
        continue;
      }
      if ((stats.identity_match_rate || 0) < 0.9) {
        continue;
      }
      if ((stats.fields_accepted_count || 0) < 1) {
        continue;
      }
      if ((stats.major_anchor_conflict_count || 0) > 1) {
        continue;
      }

      let readiness = 'low';
      if (
        (stats.attempts || 0) >= 8 &&
        (stats.identity_match_rate || 0) >= 0.98 &&
        (stats.major_anchor_conflict_count || 0) === 0 &&
        (stats.fields_accepted_count || 0) >= 8
      ) {
        readiness = 'high';
      } else if (
        (stats.attempts || 0) >= 4 &&
        (stats.identity_match_rate || 0) >= 0.95 &&
        (stats.fields_accepted_count || 0) >= 3
      ) {
        readiness = 'medium';
      }

      const score = round(
        ((stats.identity_match_rate || 0) * 0.5) +
          ((1 - (stats.major_anchor_conflict_rate || 0)) * 0.2) +
          (Math.min(1, (stats.fields_accepted_count || 0) / 10) * 0.2) +
          (Math.min(1, (stats.products_seen || 0) / 20) * 0.1),
        6
      );

      if (!byBrand.has(brandKey)) {
        byBrand.set(brandKey, {
          brand: stats.brand || brandKey,
          brand_key: brandKey,
          generated_at: new Date().toISOString(),
          suggestions: []
        });
      }

      byBrand.get(brandKey).suggestions.push({
        rootDomain,
        readiness,
        score,
        attempts: stats.attempts || 0,
        candidate_attempts: stats.candidate_attempts || 0,
        identity_match_rate: stats.identity_match_rate || 0,
        major_anchor_conflict_rate: stats.major_anchor_conflict_rate || 0,
        fields_accepted_count: stats.fields_accepted_count || 0,
        accepted_critical_fields_count: stats.accepted_critical_fields_count || 0,
        top_fields: topHelpfulFields(stats.per_field_helpfulness, 8)
      });
    }
  }

  const plans = [...byBrand.values()].map((plan) => ({
    ...plan,
    suggestions: plan.suggestions.sort((a, b) => b.score - a.score),
    suggestion_count: plan.suggestions.length
  }));

  plans.sort((a, b) => b.suggestion_count - a.suggestion_count || a.brand.localeCompare(b.brand));
  return plans;
}

export function sourceIntelKey(config, category) {
  return toPosixKey(OUTPUT_KEY_PREFIX, '_source_intel', category, 'domain_stats.json');
}

export function promotionSuggestionsKey(config, category, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return toPosixKey(
    OUTPUT_KEY_PREFIX,
    '_source_intel',
    category,
    'promotion_suggestions',
    `${stamp}.json`
  );
}

export function expansionPlanKey(config, category, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return toPosixKey(
    OUTPUT_KEY_PREFIX,
    '_source_intel',
    category,
    'expansion_plans',
    `${stamp}.json`
  );
}

export function brandExpansionPlanKey(config, category, brandKey, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return toPosixKey(
    OUTPUT_KEY_PREFIX,
    '_source_intel',
    category,
    'expansion_plans',
    'brands',
    brandKey,
    `${stamp}.json`
  );
}

export async function writeExpansionPlans({
  storage,
  config,
  category,
  intelPayload,
  categoryConfig,
  date = new Date()
}) {
  const plans = buildPerBrandExpansionPlans(
    intelPayload.domains || {},
    categoryConfig?.approvedRootDomains || new Set()
  );

  const globalKey = expansionPlanKey(config, category, date);
  const globalPayload = {
    category,
    generated_at: new Date().toISOString(),
    plan_count: plans.length,
    plans: plans.map((plan) => ({
      brand: plan.brand,
      brand_key: plan.brand_key,
      suggestion_count: plan.suggestion_count,
      top_suggestions: plan.suggestions.slice(0, 20)
    }))
  };

  await storage.writeObject(globalKey, Buffer.from(JSON.stringify(globalPayload, null, 2), 'utf8'), {
    contentType: 'application/json'
  });

  const perBrandKeys = [];
  for (const plan of plans) {
    const key = brandExpansionPlanKey(config, category, plan.brand_key, date);
    const payload = {
      category,
      brand: plan.brand,
      brand_key: plan.brand_key,
      generated_at: new Date().toISOString(),
      suggestion_count: plan.suggestion_count,
      suggestions: plan.suggestions
    };

    await storage.writeObject(key, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'), {
      contentType: 'application/json'
    });
    perBrandKeys.push(key);
  }

  return {
    expansionPlanKey: globalKey,
    brandPlanKeys: perBrandKeys,
    planCount: plans.length
  };
}
