import {
  normalizeSourcePath,
  isSitemapLikePath,
  CATEGORY_PRODUCT_PATH_RE
} from './sourcePlannerUrlUtils.js';

export function resolveIntelBundle(rootDomain, scoringCtx) {
  const intel = scoringCtx.sourceIntelDomains[rootDomain];
  if (!intel) {
    return {
      domainIntel: null,
      activeIntel: null
    };
  }

  const brandIntel =
    scoringCtx.brandKey && intel.per_brand && intel.per_brand[scoringCtx.brandKey]
      ? intel.per_brand[scoringCtx.brandKey]
      : null;

  return {
    domainIntel: intel,
    activeIntel: brandIntel || intel
  };
}

export function scoreRequiredFieldBoost(activeIntel, domainIntel, missingRequiredFields) {
  const helpfulness =
    activeIntel?.per_field_helpfulness || domainIntel?.per_field_helpfulness || {};
  const requiredBoost = missingRequiredFields.reduce((acc, field) => {
    const count = Number.parseFloat(helpfulness[field] || 0);
    if (!Number.isFinite(count) || count <= 0) {
      return acc;
    }
    return acc + Math.min(0.01, count / 500);
  }, 0);
  return Math.min(0.2, requiredBoost);
}

export function readRewardScoreFromMethodMap(map, field) {
  const prefix = `${field}::`;
  let best = null;
  for (const [key, row] of Object.entries(map || {})) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const score = Number.parseFloat(String(row?.reward_score ?? row?.score ?? 0));
    if (!Number.isFinite(score)) {
      continue;
    }
    if (best === null || score > best) {
      best = score;
    }
  }
  return best;
}

export function scoreFieldRewardBoost(row, domainIntel, activeIntel, missingRequiredFields) {
  if (!missingRequiredFields.length || !domainIntel) {
    return 0;
  }

  const pathKey = normalizeSourcePath(row?.url || '');
  const pathIntel = domainIntel.per_path?.[pathKey] || null;
  const domainFieldReward = activeIntel?.per_field_reward || domainIntel?.per_field_reward || {};
  const domainMethodReward = activeIntel?.field_method_reward || domainIntel?.field_method_reward || {};
  const pathFieldReward = pathIntel?.per_field_reward || {};
  const pathMethodReward = pathIntel?.field_method_reward || {};

  let total = 0;
  let fieldCount = 0;
  for (const field of missingRequiredFields) {
    const pathFieldScore = Number.parseFloat(String(pathFieldReward?.[field]?.score ?? ''));
    const domainFieldScore = Number.parseFloat(String(domainFieldReward?.[field]?.score ?? ''));
    const pathMethodScore = readRewardScoreFromMethodMap(pathMethodReward, field);
    const domainMethodScore = readRewardScoreFromMethodMap(domainMethodReward, field);

    const pathBest = [pathFieldScore, pathMethodScore]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0];
    const domainBest = [domainFieldScore, domainMethodScore]
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0];

    if (!Number.isFinite(pathBest) && !Number.isFinite(domainBest)) {
      continue;
    }

    const weighted = (
      (Number.isFinite(pathBest) ? pathBest * 0.7 : 0) +
      (Number.isFinite(domainBest) ? domainBest * 0.3 : 0)
    );
    total += Math.max(-0.25, Math.min(0.35, weighted));
    fieldCount += 1;
  }

  if (!fieldCount) {
    return 0;
  }
  const avg = total / fieldCount;
  return Number.parseFloat((Math.max(-0.2, Math.min(0.2, avg * 0.35))).toFixed(6));
}

export function computePathHeuristicBoost(row, scoringCtx) {
  const rawUrl = String(row?.url || '');
  if (!rawUrl) {
    return 0;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 0;
  }

  const path = String(parsed.pathname || '/').toLowerCase();
  const query = String(parsed.search || '').toLowerCase();
  const role = String(row?.role || '').toLowerCase();
  let score = 0;

  // De-prioritize generic index/search surfaces that frequently return weak signals.
  if (
    path === '/' ||
    /\/search\/?$/.test(path) ||
    query.includes('q=') ||
    query.includes('query=')
  ) {
    score -= 0.35;
  }
  if (/\/shop\/search/.test(path)) {
    score -= 0.45;
  }

  // Crawl robots/sitemaps eventually, but never before likely product/spec pages.
  if (
    path.endsWith('/robots.txt') ||
    isSitemapLikePath(path)
  ) {
    score -= 0.4;
  }

  if (role === 'manufacturer') {
    const categoryProductPath = CATEGORY_PRODUCT_PATH_RE.test(path);
    const pathIncludesBrand = scoringCtx.brandKey.length >= 4 && path.includes(scoringCtx.brandKey);

    if (categoryProductPath) {
      score += 0.34;
    } else if (/\/products?\//.test(path)) {
      score += 0.12;
      if (!pathIncludesBrand) {
        score -= 0.08;
      }
    }
    if (categoryProductPath && pathIncludesBrand) {
      score += 0.18;
    }
    if (/\/support\//.test(path)) {
      score += 0.08;
    }
    if (/\/manual|\/spec|\/download/.test(path)) {
      score += 0.05;
    }
    if (path.endsWith('.pdf')) {
      score += 0.12;
    }
  } else if (role === 'review' || role === 'database') {
    if (/\/review|\/product|\/products?\//.test(path)) {
      score += 0.1;
    }
    if (path.endsWith('.pdf')) {
      score += 0.08;
    }
  }

  return Number.parseFloat(Math.max(-0.6, Math.min(0.6, score)).toFixed(6));
}

export function computeSourcePriority(row, scoringCtx) {
  const rootDomain = row?.rootDomain;
  const pathHeuristicBoost = computePathHeuristicBoost(row, scoringCtx);
  if (!rootDomain) {
    return pathHeuristicBoost;
  }

  const { domainIntel, activeIntel } = resolveIntelBundle(rootDomain, scoringCtx);
  if (!domainIntel || !activeIntel) {
    return pathHeuristicBoost;
  }

  const baseScore = Number.isFinite(activeIntel.planner_score)
    ? activeIntel.planner_score
    : Number.isFinite(domainIntel.planner_score)
      ? domainIntel.planner_score
    : 0;
  const missingRequiredFields = scoringCtx.requiredFields.filter(
    (field) => !scoringCtx.filledFields.has(field)
  );
  const requiredBoost = scoreRequiredFieldBoost(activeIntel, domainIntel, missingRequiredFields);
  const rewardBoost = scoreFieldRewardBoost(row, domainIntel, activeIntel, missingRequiredFields);

  return Number.parseFloat((baseScore + requiredBoost + rewardBoost + pathHeuristicBoost).toFixed(6));
}

export function computeDomainPriority(rootDomain, scoringCtx) {
  return computeSourcePriority({
    rootDomain,
    url: `https://${rootDomain}/`
  }, scoringCtx);
}
