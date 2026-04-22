/**
 * Key Finder — passenger builder.
 *
 * Shared helper used by BOTH the live runner (keyFinder.js) and the preview
 * compiler (keyFinderPreviewPrompt.js). Extracting this ensures preview and
 * run resolve passengers identically — any drift would mean the preview lies.
 *
 * Reads specDb (resolved-field, top-candidate) + the in-flight registry
 * (hard-block on busy primaries, per-tier passenger caps). Does NOT mutate
 * the registry — that lifecycle lives in keyFinder.js (primary + selected
 * passengers) so preview stays side-effect-free.
 */

import { isReservedFieldKey } from '../../core/finder/finderExclusions.js';
import { packBundle } from './keyBundler.js';
import { isPrimary as registryIsPrimary, count as registryCount } from '../../core/operations/keyFinderRegistry.js';

const CAP_KNOB_BY_TIER = Object.freeze({
  easy: 'bundlingOverlapCapEasy',
  medium: 'bundlingOverlapCapMedium',
  hard: 'bundlingOverlapCapHard',
  very_hard: 'bundlingOverlapCapVeryHard',
});

function capForTier(settings, tier) {
  const knob = CAP_KNOB_BY_TIER[tier];
  if (!knob) return Infinity;
  const raw = Number(settings[knob]);
  if (!Number.isFinite(raw) || raw < 0) return Infinity;
  // very_hard: 0 means uncapped. Other tiers: 0 means "never pack".
  if (tier === 'very_hard' && raw === 0) return Infinity;
  return raw;
}

export function buildPassengers({ primary, engineRules, specDb, productId, settings }) {
  if (!settings?.bundlingEnabled) return [];
  const primaryGroup = primary?.fieldRule?.group || '';
  if (!primaryGroup && settings.groupBundlingOnly) return [];

  const peerCandidates = [];
  for (const [fk, rule] of Object.entries(engineRules || {})) {
    if (!rule || fk === primary.fieldKey) continue;
    if (isReservedFieldKey(fk)) continue; // never bundle CEF/PIF/RDF/SKF-owned peers
    if (settings.groupBundlingOnly && rule.group !== primaryGroup) continue;
    peerCandidates.push({ fieldKey: fk, fieldRule: rule });
  }

  const resolvedFieldKeys = new Set();
  if (typeof specDb?.getResolvedFieldCandidate === 'function') {
    for (const c of peerCandidates) {
      if (specDb.getResolvedFieldCandidate(productId, c.fieldKey)) {
        resolvedFieldKeys.add(c.fieldKey);
      }
    }
  }

  // §6.2 "good enough" exclusion — when BOTH knobs > 0, drop peers whose top
  // candidate confidence ≥ X AND evidence_count ≥ Y. Below either threshold
  // peers keep retrying as passengers (the Loop is still trying to upgrade
  // them to published). Zero extra DB traffic when knobs are disabled.
  const excludeConf = Number(settings.passengerExcludeAtConfidence) || 0;
  const excludeEvd = Number(settings.passengerExcludeMinEvidence) || 0;
  if (excludeConf > 0 && excludeEvd > 0 && typeof specDb?.getTopFieldCandidate === 'function') {
    for (const c of peerCandidates) {
      if (resolvedFieldKeys.has(c.fieldKey)) continue; // already dropped
      const top = specDb.getTopFieldCandidate(productId, c.fieldKey);
      if (!top) continue;
      const conf = Number(top.confidence) || 0;
      const evd = Number(top.evidence_count) || 0;
      if (conf >= excludeConf && evd >= excludeEvd) {
        resolvedFieldKeys.add(c.fieldKey);
      }
    }
  }

  // §6.2 hard-block on busy primaries + §6.3 per-tier overlap caps. Registry
  // lookups are in-memory O(1). Cap-skipping plus the existing mandatory-first
  // sort yields reverse-fallback automatically — harder tiers pick up the
  // slack when easier tiers saturate.
  for (const c of peerCandidates) {
    if (resolvedFieldKeys.has(c.fieldKey)) continue;
    if (registryIsPrimary(productId, c.fieldKey)) {
      resolvedFieldKeys.add(c.fieldKey);
      continue;
    }
    const cap = capForTier(settings, c.fieldRule.difficulty);
    if (registryCount(productId, c.fieldKey).asPassenger >= cap) {
      resolvedFieldKeys.add(c.fieldKey);
    }
  }

  const { passengers } = packBundle({
    primary,
    candidates: peerCandidates,
    resolvedFieldKeys,
    settings,
  });
  return passengers;
}
