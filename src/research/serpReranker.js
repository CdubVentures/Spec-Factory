import { callLlmWithRouting, hasLlmRouteApiKey } from '../core/llm/client/routing.js';

function normalizeHost(value) {
  return String(value || '').toLowerCase().replace(/^www\./, '');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function rerankSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      selected_urls: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string' },
            keep: { type: 'boolean' },
            reason: { type: 'string' },
            score: { type: 'number' }
          },
          required: ['url', 'keep']
        }
      }
    },
    required: ['selected_urls']
  };
}

const SERP_RERANKER_WEIGHT_DEFAULTS = Object.freeze({
  identityStrongBonus: 2.0,
  identityPartialBonus: 0.8,
  identityWeakBonus: 0,
  identityNoneBonus: -1.5,
  brandPresenceBonus: 2.5,
  modelPresenceBonus: 2.5,
  specManualKeywordBonus: 1.3,
  reviewBenchmarkBonus: 0.9,
  forumRedditPenalty: -0.9,
  brandInHostnameBonus: 1.2,
  wikipediaPenalty: -1.0,
  variantGuardPenalty: -3.0,
  multiModelHintPenalty: -1.5,
  tier1Bonus: 1.5,
  tier2Bonus: 0.5,
  hostHealthDownrankPenalty: -0.4,
  hostHealthExcludePenalty: -2.0,
  operatorRiskPenalty: -0.5,
  fieldAffinityBonus: 0.5,
  diversityPenaltyPerDupe: -0.3,
  needsetCoverageBonus: 0.2,
});

function resolveSerpRerankerWeights(config = {}) {
  const configured = config?.serpRerankerWeightMap && typeof config.serpRerankerWeightMap === 'object'
    ? config.serpRerankerWeightMap
    : {};
  const readWeight = (key) => {
    const parsed = Number.parseFloat(String(configured?.[key] ?? ''));
    return Number.isFinite(parsed) ? parsed : SERP_RERANKER_WEIGHT_DEFAULTS[key];
  };
  return {
    identityStrongBonus: readWeight('identityStrongBonus'),
    identityPartialBonus: readWeight('identityPartialBonus'),
    identityWeakBonus: readWeight('identityWeakBonus'),
    identityNoneBonus: readWeight('identityNoneBonus'),
    brandPresenceBonus: readWeight('brandPresenceBonus'),
    modelPresenceBonus: readWeight('modelPresenceBonus'),
    specManualKeywordBonus: readWeight('specManualKeywordBonus'),
    reviewBenchmarkBonus: readWeight('reviewBenchmarkBonus'),
    forumRedditPenalty: readWeight('forumRedditPenalty'),
    brandInHostnameBonus: readWeight('brandInHostnameBonus'),
    wikipediaPenalty: readWeight('wikipediaPenalty'),
    variantGuardPenalty: readWeight('variantGuardPenalty'),
    multiModelHintPenalty: readWeight('multiModelHintPenalty'),
    tier1Bonus: readWeight('tier1Bonus'),
    tier2Bonus: readWeight('tier2Bonus'),
  };
}

export function deterministicScoreWithBreakdown(row, { identity = {}, frontier = null, weights = SERP_RERANKER_WEIGHT_DEFAULTS, hostPolicyMap = null, effectiveHostPlan = null, missingFields = null } = {}) {
  const url = normalizeText(row?.url);
  const text = `${row?.title || ''} ${row?.snippet || ''} ${url}`.toLowerCase();
  const brand = String(identity?.brand || '').toLowerCase();
  const model = String(identity?.model || '').toLowerCase();
  const host = normalizeHost(row?.host || '');

  let baseScore = 0;
  if (brand && text.includes(brand)) baseScore += weights.brandPresenceBonus;
  if (model && text.includes(model)) baseScore += weights.modelPresenceBonus;
  if (/spec|manual|datasheet|technical|support/.test(text)) baseScore += weights.specManualKeywordBonus;
  if (/review|benchmark|latency|measure/.test(text)) baseScore += weights.reviewBenchmarkBonus;
  if (/forum|reddit|community/.test(text)) baseScore += weights.forumRedditPenalty;
  if (host) {
    if (host.includes(brand.replace(/\s+/g, ''))) baseScore += weights.brandInHostnameBonus;
    if (host.includes('wikipedia')) baseScore += weights.wikipediaPenalty;
  }

  let frontierPenalty = 0;
  if (frontier && typeof frontier.rankPenaltyForUrl === 'function') {
    frontierPenalty = Number(frontier.rankPenaltyForUrl(url) || 0);
  }

  const identityLevel = String(row?.identity_match_level || '').toLowerCase();
  const identityBonusMap = {
    strong: weights.identityStrongBonus,
    partial: weights.identityPartialBonus,
    weak: weights.identityWeakBonus,
    none: weights.identityNoneBonus,
  };
  const identityBonus = identityBonusMap[identityLevel] ?? 0;

  const variantGuardPenalty = row?.variant_guard_hit ? weights.variantGuardPenalty : 0;

  const multiModelPenalty = row?.multi_model_hint ? weights.multiModelHintPenalty : 0;

  const tierBonus = row?.tier === 1 ? weights.tier1Bonus : (row?.tier === 2 ? weights.tier2Bonus : 0);

  // v2 enrichment: host health, operator risk, field affinity, diversity, needset coverage
  const hasPolicy = hostPolicyMap && typeof hostPolicyMap === 'object';
  const policy = hasPolicy ? hostPolicyMap[host] : null;
  const tierSource = hasPolicy ? 'host_policy' : 'legacy';

  let hostHealthPenalty = 0;
  if (effectiveHostPlan && effectiveHostPlan.host_groups) {
    const group = effectiveHostPlan.host_groups.find(g => g.host === host);
    if (group) {
      if (group.health_action === 'downranked') hostHealthPenalty = weights.hostHealthDownrankPenalty || 0;
      else if (group.health_action === 'excluded') hostHealthPenalty = weights.hostHealthExcludePenalty || 0;
    }
  }

  let operatorRiskPenalty = 0;
  if (hasPolicy && row?.used_site_operator && policy?.operator_support?.site === false) {
    operatorRiskPenalty = weights.operatorRiskPenalty || 0;
  }

  let fieldAffinityBonus = 0;
  if (hasPolicy && policy?.field_coverage?.high && missingFields) {
    const highFields = policy.field_coverage.high;
    const overlap = toArray(missingFields).filter(f => highFields.includes(f));
    if (overlap.length > 0) fieldAffinityBonus = weights.fieldAffinityBonus || 0;
  }

  let needsetCoverageBonus = 0;
  if (hasPolicy && policy?.doc_kinds && missingFields) {
    const docKinds = toArray(policy.doc_kinds);
    if (docKinds.length > 0 && toArray(missingFields).length > 0) {
      needsetCoverageBonus = weights.needsetCoverageBonus || 0;
    }
  }

  // diversity_penalty is 0 per-row; batch applies it in rerankSerpResults
  const diversityPenalty = 0;

  const total = baseScore + frontierPenalty + identityBonus + variantGuardPenalty + multiModelPenalty + tierBonus
    + hostHealthPenalty + operatorRiskPenalty + fieldAffinityBonus + needsetCoverageBonus + diversityPenalty;

  return {
    score: total,
    breakdown: {
      base_score: baseScore,
      frontier_penalty: frontierPenalty,
      identity_bonus: identityBonus,
      variant_guard_penalty: variantGuardPenalty,
      multi_model_penalty: multiModelPenalty,
      tier_bonus: tierBonus,
      host_health_penalty: hostHealthPenalty,
      operator_risk_penalty: operatorRiskPenalty,
      field_affinity_bonus: fieldAffinityBonus,
      diversity_penalty: diversityPenalty,
      needset_coverage_bonus: needsetCoverageBonus,
      tier_source: tierSource,
    }
  };
}

export async function rerankSerpResults({
  config,
  logger,
  llmContext = {},
  identity = {},
  missingFields = [],
  serpResults = [],
  frontier = null,
  topK = 16,
  domainSafetyResults = null
} = {}) {
  const weights = resolveSerpRerankerWeights(config);
  const safetyFiltered = domainSafetyResults
    ? toArray(serpResults).filter((row) => {
      const host = normalizeHost(row?.host || '');
      const safety = domainSafetyResults.get(host);
      return !safety || safety.safe !== false;
    })
    : toArray(serpResults);

  const scored = safetyFiltered.map((row, idx) => {
    const { score, breakdown } = deterministicScoreWithBreakdown(row, { identity, frontier, weights });
    return {
      ...row,
      rank: Number.parseInt(String(row?.rank || idx + 1), 10) || (idx + 1),
      host: normalizeHost(row?.host || ''),
      score_det: score,
      score_breakdown: breakdown
    };
  });
  const deterministic = scored
    .sort((a, b) => b.score_det - a.score_det || a.rank - b.rank)
    .slice(0, Math.max(1, topK));

  if (!hasLlmRouteApiKey(config, { role: 'plan' })) {
    return deterministic.map((row) => ({
      ...row,
      keep: true,
      rerank_score: row.score_det,
      rerank_reason: 'deterministic'
    }));
  }

  const payload = {
    identity_lock: {
      brand: String(identity.brand || ''),
      model: String(identity.model || ''),
      variant: String(identity.variant || '')
    },
    missing_fields: toArray(missingFields).slice(0, 40),
    results: deterministic.map((row) => ({
      rank: row.rank,
      url: row.url,
      host: row.host,
      title: normalizeText(row.title).slice(0, 240),
      snippet: normalizeText(row.snippet).slice(0, 320),
      score_det: Number.parseFloat((row.score_det || 0).toFixed(4))
    }))
  };

  try {
    const result = await callLlmWithRouting({
      config,
      reason: 'uber_serp_reranker',
      role: 'triage',
      phase: 'serpSelector',
      system: [
        'You rerank search results for evidence-first hardware spec extraction.',
        'Return strict JSON only.',
        'Keep URLs with strong identity match and likely field relevance.',
        'Drop low-value, duplicate, or dead-pattern URLs.'
      ].join('\n'),
      user: JSON.stringify(payload),
      jsonSchema: rerankSchema(),
      usageContext: {
        category: llmContext.category || '',
        productId: llmContext.productId || '',
        runId: llmContext.runId || '',
        round: llmContext.round || 0,
        reason: 'uber_serp_reranker',
        host: '',
        url_count: deterministic.length,
        evidence_chars: JSON.stringify(payload).length,
        trace_context: {
          purpose: 'serp_rerank',
          target_fields: toArray(missingFields).slice(0, 40)
        }
      },
      costRates: llmContext.costRates || config,
      onUsage: async (usageRow) => {
        if (typeof llmContext.recordUsage === 'function') {
          await llmContext.recordUsage(usageRow);
        }
      },
      timeoutMs: config.llmTimeoutMs || config.openaiTimeoutMs,
      logger
    });
    const pickedByUrl = new Map();
    for (const row of result?.selected_urls || []) {
      const url = normalizeText(row?.url);
      if (!url) {
        continue;
      }
      pickedByUrl.set(url, {
        keep: Boolean(row?.keep),
        reason: String(row?.reason || ''),
        score: Number.parseFloat(String(row?.score || '0')) || 0
      });
    }
    const hasExplicitLlmSelections = pickedByUrl.size > 0;
    const merged = deterministic
      .map((row) => {
        const picked = pickedByUrl.get(row.url) || null;
        const keep = picked ? picked.keep : !hasExplicitLlmSelections;
        return {
          ...row,
          keep,
          decision: keep ? 'keep' : 'drop',
          rerank_score: picked ? picked.score : row.score_det,
          rerank_reason: picked?.reason || (hasExplicitLlmSelections ? 'llm_omitted_drop' : 'llm_default_keep')
        };
      })
      .filter((row) => row.keep)
      .sort((a, b) => b.rerank_score - a.rerank_score || a.rank - b.rank)
      .slice(0, Math.max(1, topK));
    if (!merged.length) {
      if (pickedByUrl.size > 0) {
        const explicitAllDropRows = deterministic.map((row) => {
          const picked = pickedByUrl.get(row.url) || null;
          const rerankReason = picked?.reason || (hasExplicitLlmSelections ? 'llm_omitted_drop' : 'llm_explicit_drop');
          return {
            ...row,
            keep: false,
            decision: 'drop',
            rerank_score: picked ? picked.score : 0,
            rerank_reason: rerankReason
          };
        });
        const explicitAllDrop = [];
        explicitAllDrop.explicitAllDrop = true;
        explicitAllDrop.explicitAllDropCount = explicitAllDropRows.length;
        explicitAllDrop.explicitAllDropRows = explicitAllDropRows;
        explicitAllDrop.fallbackReason = 'llm_explicit_all_drop';
        return explicitAllDrop;
      }
      return deterministic.slice(0, Math.max(1, topK)).map((row) => ({
        ...row,
        keep: true,
        rerank_score: row.score_det,
        rerank_reason: 'llm_empty_fallback'
      }));
    }
    return merged;
  } catch (error) {
    logger?.warn?.('uber_serp_reranker_failed', {
      message: error.message
    });
    return deterministic.map((row) => ({
      ...row,
      keep: true,
      rerank_score: row.score_det,
      rerank_reason: 'deterministic_fallback'
    }));
  }
}
