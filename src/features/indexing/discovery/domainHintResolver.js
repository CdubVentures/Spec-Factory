// WHY: Builds EffectiveHostPlan — the single truth object that replaces the
// dot-only filter. Classifies hint tokens, expands tiers from registry,
// applies health ladder, attaches policies and provider caps.

import { resolveHintTokens } from './hintTokenResolver.js';
import { listSourcesByTier, registrySparsityReport } from './sourceRegistry.js';
import { buildHostPolicy } from './hostPolicy.js';
import { getProviderCapabilities } from './providerCapabilities.js';
import { normalizeHost } from './hostParser.js';

const TIER_TO_ROLE = {
  manufacturer: 'tier1_manufacturer',
  lab: 'tier2_lab',
  database: 'tier5_aggregator',
  retailer: 'tier3_retailer',
  community: 'tier4_community',
  aggregator: 'tier5_aggregator',
};

const SEARCHABLE_THRESHOLD = 3;

/**
 * Determine health_action from a source entry's health object.
 * Ladder: normal → downranked → excluded.
 */
function classifyHealthAction(entry) {
  const health = entry?.health;
  if (!health) return 'normal';

  const successRate = health.success_rate_7d;
  const blockRate = health.block_rate_7d;

  // Excluded: blocked_reason set OR success_rate < 0.1
  if (typeof successRate === 'number' && successRate < 0.1) return 'excluded';

  // Downranked: success_rate < 0.5 OR block_rate > 0.3
  if (
    (typeof successRate === 'number' && successRate < 0.5) ||
    (typeof blockRate === 'number' && blockRate > 0.3)
  ) {
    return 'downranked';
  }

  return 'normal';
}

/**
 * Category population gate. Rejects underpopulated or overly sparse registries.
 */
function checkPopulationGate(registry) {
  if (registry.entries.length < 3) {
    return { blocked: true, reason: 'registry_underpopulated' };
  }
  const sparsity = registrySparsityReport(registry);
  if (sparsity.synthetic_ratio > 0.8) {
    return { blocked: true, reason: 'registry_too_sparse' };
  }
  return null;
}

/**
 * Build the EffectiveHostPlan — single truth object for discovery.
 *
 * @param {object} opts
 * @param {string[]} opts.domainHints - hint tokens from field rules
 * @param {object} opts.registry - validated source registry
 * @param {string} opts.providerName - search provider name
 * @param {string[]} opts.brandResolutionHints - brand-resolved hosts
 * @returns {object} EffectiveHostPlan
 */
export function buildEffectiveHostPlan({ domainHints = [], registry, providerName, brandResolutionHints = [] }) {
  // Population gate
  const gateResult = checkPopulationGate(registry);
  if (gateResult) return gateResult;

  const provider_caps = getProviderCapabilities(providerName);

  // Classify all hint tokens
  const resolved = resolveHintTokens(domainHints, registry);

  const manufacturer_hosts = [];
  const tier_hosts = {};
  const explicit_hosts = [];
  const content_intents = [];
  const unresolved_tokens = [];
  const seenHosts = new Set();
  const hostGroupsList = [];
  const explainList = [];
  const host_health = {};
  const policy_map = {};

  // Merge brand resolution hints into manufacturer_hosts
  for (const hint of brandResolutionHints) {
    const host = normalizeHost(hint);
    if (host && host.includes('.') && !manufacturer_hosts.includes(host)) {
      manufacturer_hosts.push(host);
    }
  }

  // Process resolved tokens
  for (const token of resolved) {
    if (token.classification === 'host') {
      const host = token.host;
      if (!explicit_hosts.includes(host)) explicit_hosts.push(host);
    } else if (token.classification === 'tier') {
      const tierKey = token.tier;
      const fullTier = TIER_TO_ROLE[tierKey];
      if (fullTier) {
        const entries = listSourcesByTier(registry, fullTier);
        const tierHosts = entries.map(e => e.host);
        if (!tier_hosts[tierKey]) tier_hosts[tierKey] = [];
        for (const h of tierHosts) {
          if (!tier_hosts[tierKey].includes(h)) tier_hosts[tierKey].push(h);
        }
      }
    } else if (token.classification === 'intent') {
      if (!content_intents.includes(token.intent)) content_intents.push(token.intent);
    } else {
      if (!unresolved_tokens.includes(token.raw)) unresolved_tokens.push(token.raw);
    }
  }

  // Collect all unique hosts into host_groups
  const allHosts = new Set();
  for (const h of manufacturer_hosts) allHosts.add(h);
  for (const h of explicit_hosts) allHosts.add(h);
  for (const tierHosts of Object.values(tier_hosts)) {
    for (const h of tierHosts) allHosts.add(h);
  }

  for (const host of allHosts) {
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);

    // Find registry entry
    const entry = registry.entries.find(e => e.host === host);

    // Determine origin
    let origin = 'explicit';
    if (manufacturer_hosts.includes(host)) origin = 'brand_resolution';
    for (const [tierKey, hosts] of Object.entries(tier_hosts)) {
      if (hosts.includes(host)) { origin = `tier_expansion:${tierKey}`; break; }
    }

    const healthAction = entry ? classifyHealthAction(entry) : 'normal';
    const isConnector = entry?.connector_only || false;
    const isBlocked = entry?.blocked_in_search || false;
    const searchable = !isConnector && !isBlocked && healthAction === 'normal';

    const group = {
      host,
      origin,
      tier: entry?.tier || 'unknown',
      searchable,
      source_entry: entry || null,
      health_action: healthAction,
    };
    hostGroupsList.push(group);

    // Health
    if (entry?.health) {
      host_health[host] = entry.health;
    }

    // Policy
    if (entry) {
      const policy = buildHostPolicy(entry, providerName);
      policy_map[host] = policy;
    }

    // Explain
    explainList.push({
      host,
      action: searchable ? 'include' : 'exclude',
      reason: !searchable
        ? (isConnector ? 'connector_only' : isBlocked ? 'blocked_in_search' : `health_${healthAction}`)
        : `${origin}`,
    });
  }

  // Relaxation: if searchable count < threshold, promote downranked to normal
  let searchableCount = hostGroupsList.filter(g => g.searchable).length;
  if (searchableCount < SEARCHABLE_THRESHOLD) {
    for (const group of hostGroupsList) {
      if (group.health_action === 'downranked') {
        group.health_action = 'normal';
        group.searchable = true;
        // Update explain
        const explain = explainList.find(e => e.host === group.host);
        if (explain) {
          explain.action = 'include';
          explain.reason = 'relaxed_from_downranked';
        }
      }
    }
    searchableCount = hostGroupsList.filter(g => g.searchable).length;
  }

  // Count tiers
  const tierCount = Object.keys(tier_hosts).length;

  return {
    manufacturer_hosts,
    tier_hosts,
    explicit_hosts,
    content_intents,
    unresolved_tokens,
    host_groups: hostGroupsList,
    host_health,
    policy_map,
    provider_caps,
    explain: explainList,
    classification_summary: {
      host_count: explicit_hosts.length + manufacturer_hosts.filter(h => !explicit_hosts.includes(h)).length,
      tier_count: tierCount,
      intent_count: content_intents.length,
      unresolved_count: unresolved_tokens.length,
      searchable_host_count: searchableCount,
    },
  };
}

/**
 * Compare old planner hosts vs new EffectiveHostPlan.
 * Used for shadow mode drift detection.
 */
export function buildHostPlanShadowDiff(oldHosts, plan) {
  const oldSet = new Set((oldHosts || []).map(h => normalizeHost(h)).filter(Boolean));
  const newSet = new Set((plan?.host_groups || []).filter(g => g.searchable).map(g => g.host));

  const matched = [];
  const only_old = [];
  const only_new = [];

  for (const h of oldSet) {
    if (newSet.has(h)) matched.push(h);
    else only_old.push(h);
  }
  for (const h of newSet) {
    if (!oldSet.has(h)) only_new.push(h);
  }

  return {
    matched,
    only_old,
    only_new,
    old_count: oldSet.size,
    new_count: newSet.size,
    drift: only_old.length > 0 || only_new.length > 0,
  };
}
